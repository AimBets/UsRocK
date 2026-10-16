import { afterEach, describe, expect, it } from "vitest";
import type { App } from "../src/app.js";
import { roleInfo } from "../src/modules/access/access.contracts.js";
import { diffChanges, REDACTED, sanitizeAuditValue } from "../src/modules/audit/audit.service.js";
import { rolePermissions, roles, type Principal, type SessionResolver } from "../src/modules/auth/auth.types.js";
import type { ErrorResponse } from "../src/shared/errors.js";
import { buildTestApp, TEST_ORIGIN } from "./helpers/app.js";

/** Test resolver: the `x-test-roles` header stands in for a real session cookie. */
const headerResolver: SessionResolver = {
  resolve: (request) => {
    const header = request.headers["x-test-roles"];
    if (typeof header !== "string") return Promise.resolve(null);
    return Promise.resolve({
      userId: "00000000-0000-4000-8000-000000000001",
      sessionId: "session-1",
      roles: header.split(",") as Principal["roles"],
    });
  },
};

let app: App | undefined;
let logs: Awaited<ReturnType<typeof buildTestApp>>["logs"];
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function setup(): Promise<App> {
  const built = await buildTestApp({ sessionResolver: headerResolver });
  ({ app, logs } = built);
  await built.app.ready();
  return built.app;
}

const someId = "11111111-1111-4111-8111-111111111111";

describe("audit sanitising", () => {
  it("redacts credentials and personal data at any depth", () => {
    const value = sanitizeAuditValue({
      code: "ROCK10",
      passwordHash: "$argon2id$...",
      nested: { customerEmail: "fa@example.com", recipientDocument: "12345678909", phone: "11999999999", ok: 1 },
      list: [{ token: "abc" }],
    });
    expect(value).toEqual({
      code: "ROCK10",
      passwordHash: REDACTED,
      nested: { customerEmail: REDACTED, recipientDocument: REDACTED, phone: REDACTED, ok: 1 },
      list: [{ token: REDACTED }],
    });
  });

  it("keeps values JSON-safe and bounded", () => {
    const date = new Date("2026-10-16T12:00:00.000Z");
    expect(sanitizeAuditValue(date)).toBe("2026-10-16T12:00:00.000Z");
    expect(sanitizeAuditValue(undefined)).toBeNull();
    expect((sanitizeAuditValue("x".repeat(2_000)) as string).length).toBe(501);
    expect((sanitizeAuditValue(Array.from({ length: 80 }, (_, i) => i)) as unknown[]).length).toBe(50);
    expect(sanitizeAuditValue({ a: { b: { c: { d: { e: 1 } } } } })).toEqual({ a: { b: { c: { d: "[truncated]" } } } });
    expect(sanitizeAuditValue(10n)).toBe("[bigint]");
  });
});

describe("audit diff", () => {
  const before = { id: "x", code: "ROCK10", isActive: true, endsAt: null, updatedAt: new Date(1), passwordHash: "a" };

  it("reports only changed fields, ignoring bookkeeping columns", () => {
    const after = { ...before, isActive: false, updatedAt: new Date(2) };
    expect(diffChanges(before, after)).toEqual({ isActive: { from: true, to: false } });
  });

  it("returns null when nothing changed", () => {
    expect(diffChanges(before, { ...before, updatedAt: new Date(3) })).toBeNull();
  });

  it("reports creation as null → value and hides sensitive values", () => {
    const changes = diffChanges(null, { id: "x", code: "ROCK10", endsAt: new Date("2026-12-01T00:00:00.000Z"), passwordHash: "b" });
    expect(changes).toEqual({
      code: { from: null, to: "ROCK10" },
      endsAt: { from: null, to: "2026-12-01T00:00:00.000Z" },
      passwordHash: { from: REDACTED, to: REDACTED },
    });
  });

  it("compares arrays and nested objects by value", () => {
    expect(diffChanges({ roles: ["operator"] }, { roles: ["operator"] })).toBeNull();
    expect(diffChanges({ roles: ["operator"] }, { roles: ["admin"] })).toEqual({ roles: { from: ["operator"], to: ["admin"] } });
  });
});

describe("admin route protection (no database)", () => {
  const routes: { method: "GET" | "PUT" | "PATCH" | "POST"; url: string; payload?: Record<string, unknown> }[] = [
    { method: "GET", url: "/api/v1/admin/roles" },
    { method: "GET", url: "/api/v1/admin/users?limit=abc" },
    { method: "PUT", url: "/api/v1/admin/users/not-a-uuid/roles", payload: { roles: ["root"] } },
    { method: "PATCH", url: "/api/v1/admin/users/not-a-uuid/status", payload: { status: "x" } },
    { method: "GET", url: "/api/v1/admin/audit-logs?from=yesterday" },
    // Existing E4 scope now validates permission before the body (was 400 for anonymous callers).
    { method: "POST", url: "/api/v1/admin/coupons", payload: { code: 1 } },
  ];

  it("answers 401 to anonymous callers before validating input, without caching", async () => {
    const app = await setup();
    for (const route of routes) {
      const res = await app.inject({ ...route, headers: { origin: TEST_ORIGIN } });
      expect(res.statusCode, `${route.method} ${route.url}`).toBe(401);
      expect(res.headers["cache-control"]).toBe("no-store");
    }
  });

  it("answers 403 to roles without the permission and logs the denial without personal data", async () => {
    const app = await setup();
    for (const role of ["customer", "operator", "content_editor"]) {
      for (const route of routes.slice(0, 5)) {
        const res = await app.inject({ ...route, headers: { origin: TEST_ORIGIN, "x-test-roles": role } });
        expect(res.statusCode, `${role} ${route.method} ${route.url}`).toBe(403);
        expect(res.json<ErrorResponse>().error.code).toBe("FORBIDDEN");
      }
    }
    const denial = logs.lines.find((line) => line.msg === "permission denied");
    expect(denial).toMatchObject({ actorId: "00000000-0000-4000-8000-000000000001", permission: "users:manage" });
    expect(logs.raw()).not.toMatch(/@/);
  });

  it("serves the role catalog consistent with the permission matrix", async () => {
    const app = await setup();
    const res = await app.inject({ method: "GET", url: "/api/v1/admin/roles", headers: { "x-test-roles": "admin" } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    const body = res.json<{ roles: { role: string; label: string; permissions: string[] }[]; permissions: { permission: string }[] }>();
    expect(body.roles.map((item) => item.role)).toEqual([...roles]);
    for (const item of body.roles) {
      expect(item.permissions).toEqual(rolePermissions[item.role as keyof typeof rolePermissions]);
      expect(item.label).toBe(roleInfo[item.role as keyof typeof roleInfo].label);
    }
    expect(body.permissions).toHaveLength(10);
  });

  it("validates admin input after authorisation", async () => {
    const app = await setup();
    const headers = { origin: TEST_ORIGIN, "x-test-roles": "admin" };
    const badRoles = await app.inject({ method: "PUT", url: `/api/v1/admin/users/${someId}/roles`, headers, payload: { roles: [] } });
    expect(badRoles.statusCode).toBe(400);
    const unknownRole = await app.inject({ method: "PUT", url: `/api/v1/admin/users/${someId}/roles`, headers, payload: { roles: ["root"] } });
    expect(unknownRole.statusCode).toBe(400);
    const badPeriod = await app.inject({
      method: "GET",
      url: "/api/v1/admin/audit-logs?from=2026-10-16T00:00:00Z&to=2026-10-01T00:00:00Z",
      headers,
    });
    expect(badPeriod.statusCode).toBe(400);
    const badCursor = await app.inject({ method: "GET", url: "/api/v1/admin/users?cursor=@@@", headers });
    expect(badCursor.statusCode).toBe(400);
  });
});
