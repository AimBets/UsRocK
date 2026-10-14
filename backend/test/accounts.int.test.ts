import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import type { App } from "../src/app.js";
import { createDatabase } from "../src/db/client.js";
import { consents, passwordResetTokens, sessions, users } from "../src/modules/accounts/accounts.schema.js";
import type { CurrentUser } from "../src/modules/accounts/accounts.contracts.js";
import { hashPassword } from "../src/modules/accounts/security.js";
import { permissions } from "../src/modules/auth/auth.types.js";
import { createMemoryMailer } from "../src/modules/mail/mailer.js";
import type { ErrorResponse } from "../src/shared/errors.js";
import type { captureLogs } from "./helpers/app.js";
import { buildTestApp, TEST_ORIGIN } from "./helpers/app.js";

const database = createDatabase(inject("testDatabaseUrl"), { poolMax: 3 });
const { db } = database;
const mailer = createMemoryMailer();
let app: App;
let logs: ReturnType<typeof captureLogs>;

const PASSWORD = "riff-pesado-2026";
const COOKIE = "usrock_session";

async function register(email: string, extra: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    headers: { origin: TEST_ORIGIN },
    payload: { email, password: PASSWORD, name: "Fã de Rock", acceptTerms: true, ...extra },
  });
}

async function login(email: string, password = PASSWORD, remoteAddress?: string) {
  return app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email, password },
    ...(remoteAddress ? { remoteAddress } : {}),
  });
}

function sessionCookie(res: Awaited<ReturnType<typeof login>>): string {
  const cookie = res.cookies.find((item) => item.name === COOKIE);
  if (!cookie?.value) throw new Error(`no session cookie in response (${res.statusCode})`);
  return cookie.value;
}

const me = (token: string) => app.inject({ method: "GET", url: "/api/v1/me", cookies: { [COOKIE]: token } });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE consents, password_reset_tokens, sessions, users RESTART IDENTITY CASCADE`);
  ({ app, logs } = await buildTestApp({ database, mailer, env: { AUTH_RATE_LIMIT_MAX: "1000" } }));
  await app.ready();
});

beforeEach(() => {
  mailer.messages.length = 0;
});

afterAll(async () => {
  await app.close();
  await database.close();
});

describe("registration", () => {
  it("creates a customer, records consents and starts a session", async () => {
    const res = await register("Fa.Rock@Example.com", { marketingEmailOptIn: true });
    expect(res.statusCode, res.body).toBe(201);

    const { user } = res.json<{ user: CurrentUser }>();
    expect(user).toMatchObject({ email: "fa.rock@example.com", name: "Fã de Rock", roles: ["customer"], permissions: [], emailVerified: false });

    const cookie = res.cookies.find((item) => item.name === COOKIE);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });
    expect(cookie?.secure).toBeFalsy(); // test env; production forces Secure

    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row?.passwordHash).toMatch(/^\$argon2id\$/);
    const recorded = await db.select().from(consents).where(eq(consents.userId, user.id));
    expect(recorded.map(({ purpose, granted, policyVersion, source }) => ({ purpose, granted, policyVersion, source })).sort((a, b) => a.purpose.localeCompare(b.purpose))).toEqual([
      { purpose: "marketing_email", granted: true, policyVersion: "rascunho-2026-10", source: "register" },
      { purpose: "privacy", granted: true, policyVersion: "rascunho-2026-10", source: "register" },
      { purpose: "terms", granted: true, policyVersion: "rascunho-2026-10", source: "register" },
    ]);
  });

  it("rejects a duplicate email regardless of case", async () => {
    const res = await register("FA.ROCK@example.com");
    expect(res.statusCode).toBe(409);
    expect(res.json<ErrorResponse>().error.code).toBe("CONFLICT");
  });

  it("never logs passwords, emails or session tokens", async () => {
    const res = await register("logs-check@example.com");
    const token = sessionCookie(res);
    const raw = logs.raw();
    expect(raw).not.toContain(PASSWORD);
    expect(raw).not.toContain("logs-check@example.com");
    expect(raw).not.toContain(token);
  });
});

describe("session lifecycle", () => {
  it("serves /me for a valid session and 401 otherwise", async () => {
    const token = sessionCookie(await login("fa.rock@example.com"));
    const res = await me(token);
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.json<{ user: CurrentUser }>().user.email).toBe("fa.rock@example.com");

    expect((await app.inject({ method: "GET", url: "/api/v1/me" })).statusCode).toBe(401);
    expect((await me("A".repeat(43))).statusCode).toBe(401);
  });

  it("stores only the token hash", async () => {
    const token = sessionCookie(await login("fa.rock@example.com"));
    const stored = await db.select({ tokenHash: sessions.tokenHash }).from(sessions);
    expect(stored.some((row) => row.tokenHash === token)).toBe(false);
  });

  it("logout revokes the session, clears the cookie and is idempotent", async () => {
    const token = sessionCookie(await login("fa.rock@example.com"));
    const res = await app.inject({ method: "POST", url: "/api/v1/auth/logout", cookies: { [COOKIE]: token } });
    expect(res.statusCode).toBe(204);
    expect(res.cookies.find((item) => item.name === COOKIE)?.value).toBe("");
    expect((await me(token)).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/v1/auth/logout", cookies: { [COOKIE]: token } })).statusCode).toBe(204);
  });

  it("rejects expired and idle sessions", async () => {
    const expired = sessionCookie(await login("fa.rock@example.com"));
    const idle = sessionCookie(await login("fa.rock@example.com"));
    const sessionRows = await db.select().from(sessions).orderBy(sql`created_at desc`).limit(2);
    const [idleRow, expiredRow] = sessionRows;
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.id, expiredRow!.id));
    await db.update(sessions).set({ lastSeenAt: new Date(Date.now() - 15 * 86_400_000) }).where(eq(sessions.id, idleRow!.id));
    expect((await me(expired)).statusCode).toBe(401);
    expect((await me(idle)).statusCode).toBe(401);
  });

  it("refuses sessions of disabled users", async () => {
    const res = await register("desativado@example.com");
    const token = sessionCookie(res);
    await db.update(users).set({ status: "disabled" }).where(eq(users.email, "desativado@example.com"));
    expect((await me(token)).statusCode).toBe(401);
    const attempt = await login("desativado@example.com");
    expect(attempt.statusCode).toBe(401);
  });
});

describe("login", () => {
  it("returns the same 401 for wrong password and unknown email", async () => {
    const wrong = await login("fa.rock@example.com", "senha-errada-123");
    const unknown = await login("ninguem@example.com");
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json<ErrorResponse>().error.message).toBe(unknown.json<ErrorResponse>().error.message);
    expect(wrong.cookies).toHaveLength(0);
  });

  it("issues a new session per login and records last login", async () => {
    const first = sessionCookie(await login("fa.rock@example.com"));
    const second = sessionCookie(await login("fa.rock@example.com"));
    expect(first).not.toBe(second);
    const [row] = await db.select().from(users).where(eq(users.email, "fa.rock@example.com"));
    expect(row?.lastLoginAt).toBeInstanceOf(Date);
  });

  it("blocks login posted from a foreign origin", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { origin: "https://evil.example" },
      payload: { email: "fa.rock@example.com", password: PASSWORD },
    });
    expect(res.statusCode).toBe(403);
  });

  it("exposes effective permissions for staff roles", async () => {
    await db.insert(users).values({ email: "admin@example.com", name: "Admin", passwordHash: await hashPassword(PASSWORD), roles: ["admin"] });
    const res = await me(sessionCookie(await login("admin@example.com")));
    expect(res.json<{ user: CurrentUser }>().user.permissions).toEqual([...permissions]);
  });
});

describe("password reset", () => {
  it("answers identically for unknown emails and sends nothing", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/auth/password/forgot", payload: { email: "ninguem@example.com" } });
    expect(res.statusCode).toBe(202);
    expect(mailer.messages).toHaveLength(0);
  });

  it("emails a single-use link, resets the password and signs out everywhere", async () => {
    const oldSession = sessionCookie(await login("fa.rock@example.com"));
    const forgot = await app.inject({ method: "POST", url: "/api/v1/auth/password/forgot", payload: { email: "FA.ROCK@example.com" } });
    expect(forgot.statusCode).toBe(202);
    expect(mailer.messages).toHaveLength(1);
    const message = mailer.messages[0]!;
    expect(message.to).toBe("fa.rock@example.com");
    const token = /redefinir-senha\?token=([A-Za-z0-9_-]{43})/.exec(message.text)?.[1];
    expect(message.text).toContain("http://localhost:3000/conta/redefinir-senha?token=");
    expect(token).toBeDefined();

    const stored = await db.select().from(passwordResetTokens);
    expect(stored.some((row) => row.tokenHash === token)).toBe(false);

    const reset = await app.inject({ method: "POST", url: "/api/v1/auth/password/reset", payload: { token, password: "nova-senha-segura" } });
    expect(reset.statusCode).toBe(204);
    expect((await me(oldSession)).statusCode).toBe(401);
    expect((await login("fa.rock@example.com")).statusCode).toBe(401);
    expect((await login("fa.rock@example.com", "nova-senha-segura")).statusCode).toBe(200);

    const reuse = await app.inject({ method: "POST", url: "/api/v1/auth/password/reset", payload: { token, password: "outra-senha-segura" } });
    expect(reuse.statusCode).toBe(400);
    expect(reuse.json<ErrorResponse>().error.details?.[0]?.code).toBe("invalid_token");
  });

  it("invalidates older links and rejects expired ones", async () => {
    await app.inject({ method: "POST", url: "/api/v1/auth/password/forgot", payload: { email: "fa.rock@example.com" } });
    await app.inject({ method: "POST", url: "/api/v1/auth/password/forgot", payload: { email: "fa.rock@example.com" } });
    const [older, newer] = mailer.messages.map((message) => /token=([A-Za-z0-9_-]{43})/.exec(message.text)?.[1]);

    const reuseOlder = await app.inject({ method: "POST", url: "/api/v1/auth/password/reset", payload: { token: older, password: "nova-senha-segura-2" } });
    expect(reuseOlder.statusCode).toBe(400);

    await db.update(passwordResetTokens).set({ expiresAt: new Date(Date.now() - 1000) });
    const expired = await app.inject({ method: "POST", url: "/api/v1/auth/password/reset", payload: { token: newer, password: "nova-senha-segura-2" } });
    expect(expired.statusCode).toBe(400);
  });
});

describe("change password", () => {
  it("requires the current password and keeps only the current session", async () => {
    const other = sessionCookie(await login("fa.rock@example.com", "nova-senha-segura"));
    const current = sessionCookie(await login("fa.rock@example.com", "nova-senha-segura"));

    const wrong = await app.inject({
      method: "POST",
      url: "/api/v1/me/password",
      cookies: { [COOKIE]: current },
      payload: { currentPassword: "nao-e-essa", newPassword: "senha-alterada-ok" },
    });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json<ErrorResponse>().error.details?.[0]?.path).toBe("body.currentPassword");

    const ok = await app.inject({
      method: "POST",
      url: "/api/v1/me/password",
      cookies: { [COOKIE]: current },
      payload: { currentPassword: "nova-senha-segura", newPassword: "senha-alterada-ok" },
    });
    expect(ok.statusCode).toBe(204);
    expect((await me(current)).statusCode).toBe(200);
    expect((await me(other)).statusCode).toBe(401);
  });

  it("requires authentication", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/me/password", payload: { currentPassword: "x", newPassword: "senha-alterada-ok" } });
    expect(res.statusCode).toBe(401);
  });
});

describe("rate limiting", () => {
  it("limits auth attempts per IP and per email", async () => {
    const { app: limited } = await buildTestApp({ database, mailer, env: { AUTH_RATE_LIMIT_MAX: "3" } });
    try {
      const attempt = (email: string, remoteAddress: string) =>
        limited.inject({ method: "POST", url: "/api/v1/auth/login", remoteAddress, payload: { email, password: "senha-errada-123" } });

      // Per IP: 3 attempts with different emails, the 4th from the same IP is blocked.
      for (const n of [1, 2, 3]) expect((await attempt(`ip-${n}@example.com`, "10.0.0.1")).statusCode).toBe(401);
      const blockedIp = await attempt("ip-4@example.com", "10.0.0.1");
      expect(blockedIp.statusCode).toBe(429);
      expect(blockedIp.json<ErrorResponse>().error.code).toBe("RATE_LIMITED");

      // Per email: the same account attacked from rotating IPs.
      for (const n of [1, 2, 3]) expect((await attempt("alvo@example.com", `10.0.1.${n}`)).statusCode).toBe(401);
      expect((await attempt("alvo@example.com", "10.0.1.99")).statusCode).toBe(429);
    } finally {
      await limited.close();
    }
  });
});
