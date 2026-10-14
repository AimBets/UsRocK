import { afterEach, describe, expect, it } from "vitest";
import type { App } from "../src/app.js";
import { generateToken, hashPassword, hashToken, verifyAgainstDummy, verifyPassword } from "../src/modules/accounts/security.js";
import { passwordResetEmail } from "../src/modules/mail/templates.js";
import type { ErrorResponse } from "../src/shared/errors.js";
import { buildTestApp } from "./helpers/app.js";

describe("password hashing", () => {
  it("uses Argon2id and verifies only the right password", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verifyPassword(hash, "correct horse battery")).toBe(true);
    expect(await verifyPassword(hash, "wrong horse battery")).toBe(false);
    expect(await verifyPassword("not-a-hash", "anything")).toBe(false);
    expect(await verifyAgainstDummy("anything")).toBe(false);
  });
});

describe("tokens", () => {
  it("are 256-bit base64url secrets stored only as SHA-256", () => {
    const { token, tokenHash } = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).toBe(hashToken(token));
    expect(generateToken().token).not.toBe(token);
  });
});

describe("password reset email", () => {
  it("escapes user-controlled content in HTML", () => {
    const message = passwordResetEmail({ to: "a@b.c", name: "<script>x</script>", resetUrl: "https://usrock.com.br/r?token=abc", expiresInMinutes: 60 });
    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("&#60;script&#62;");
    expect(message.text).toContain("https://usrock.com.br/r?token=abc");
  });
});

describe("accounts request validation (no database involved)", () => {
  let app: App;
  afterEach(async () => {
    await app.close();
  });

  const valid = { email: "fa@example.com", password: "uma-senha-longa", name: "Fã", acceptTerms: true };

  it.each([
    [{ ...valid, acceptTerms: false }, "body.acceptTerms"],
    [{ ...valid, acceptTerms: undefined }, "body.acceptTerms"],
    [{ ...valid, password: "curta" }, "body.password"],
    [{ ...valid, password: "x".repeat(129) }, "body.password"],
    [{ ...valid, password: "FA@EXAMPLE.COM" }, "body.password"],
    [{ ...valid, email: "não-é-email" }, "body.email"],
    [{ ...valid, name: "   " }, "body.name"],
  ])("rejects invalid registration %#", async (payload, path) => {
    ({ app } = await buildTestApp());
    const res = await app.inject({ method: "POST", url: "/api/v1/auth/register", payload });
    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorResponse>().error.details?.map((detail) => detail.path)).toContain(path);
  });

  it("rejects a malformed reset token", async () => {
    ({ app } = await buildTestApp());
    const res = await app.inject({ method: "POST", url: "/api/v1/auth/password/reset", payload: { token: "abc", password: "uma-senha-longa" } });
    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorResponse>().error.details?.[0]?.path).toBe("body.token");
  });

  it("ignores malformed session cookies without querying the database", async () => {
    ({ app } = await buildTestApp());
    const res = await app.inject({ method: "GET", url: "/api/v1/me", cookies: { usrock_session: "'; drop table sessions; --" } });
    expect(res.statusCode).toBe(401);
  });
});
