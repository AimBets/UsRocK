import { afterEach, describe, expect, it } from "vitest";
import type { App } from "../src/app.js";
import { requireAuth, requirePermission } from "../src/modules/auth/auth.plugin.js";
import { hasPermission, type Principal, type SessionResolver } from "../src/modules/auth/auth.types.js";
import type { ErrorResponse } from "../src/shared/errors.js";
import { buildTestApp } from "./helpers/app.js";

/** Test resolver: the `x-test-roles` header stands in for a real session cookie. */
const headerResolver: SessionResolver = {
  resolve: (request) => {
    const header = request.headers["x-test-roles"];
    if (typeof header !== "string") return Promise.resolve(null);
    return Promise.resolve({ userId: "user-1", sessionId: "session-1", roles: header.split(",") as Principal["roles"] });
  },
};

let app: App;
afterEach(async () => {
  await app.close();
});

async function setup(sessionResolver?: SessionResolver) {
  ({ app } = await buildTestApp(sessionResolver ? { sessionResolver } : {}));
  app.get("/api/v1/probe/me", { preHandler: requireAuth }, async (request) => ({ userId: request.principal?.userId }));
  app.get("/api/v1/probe/admin/products", { preHandler: requirePermission("catalog:manage") }, async () => ({ ok: true }));
  await app.ready();
}

describe("authorization guards", () => {
  it("treats every request as anonymous until the accounts module exists", async () => {
    await setup();
    const res = await app.inject({ method: "GET", url: "/api/v1/probe/me", headers: { "x-test-roles": "admin" } });
    expect(res.statusCode).toBe(401);
    expect(res.json<ErrorResponse>().error.code).toBe("UNAUTHENTICATED");
  });

  it("requireAuth admits any authenticated principal", async () => {
    await setup(headerResolver);
    const res = await app.inject({ method: "GET", url: "/api/v1/probe/me", headers: { "x-test-roles": "customer" } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: "user-1" });
  });

  it("requirePermission distinguishes 401 from 403", async () => {
    await setup(headerResolver);
    const anonymous = await app.inject({ method: "GET", url: "/api/v1/probe/admin/products" });
    expect(anonymous.statusCode).toBe(401);

    const customer = await app.inject({ method: "GET", url: "/api/v1/probe/admin/products", headers: { "x-test-roles": "customer" } });
    expect(customer.statusCode).toBe(403);
    expect(customer.json<ErrorResponse>().error.code).toBe("FORBIDDEN");

    const operator = await app.inject({ method: "GET", url: "/api/v1/probe/admin/products", headers: { "x-test-roles": "operator" } });
    expect(operator.statusCode).toBe(200);
  });
});

describe("role → permission matrix", () => {
  it("grants least privilege per role", () => {
    expect(hasPermission(["customer"], "orders:manage")).toBe(false);
    expect(hasPermission(["content_editor"], "landing_pages:edit")).toBe(true);
    expect(hasPermission(["content_editor"], "landing_pages:publish")).toBe(false);
    expect(hasPermission(["operator"], "users:manage")).toBe(false);
    expect(hasPermission(["admin"], "users:manage")).toBe(true);
    expect(hasPermission(["customer", "content_editor"], "media:upload")).toBe(true);
  });
});
