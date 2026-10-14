import { afterEach, describe, expect, it } from "vitest";
import type { App } from "../src/app.js";
import { buildTestApp } from "./helpers/app.js";

let app: App | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("GET /api/v1/health", () => {
  it("returns 200 when every dependency is up", async () => {
    ({ app } = await buildTestApp({ healthChecks: [{ name: "database", check: () => Promise.resolve() }], env: { APP_VERSION: "abc123" } }));
    const res = await app.inject({ method: "GET", url: "/api/v1/health" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.json()).toMatchObject({ status: "ok", version: "abc123", checks: { database: { status: "up" } } });
  });

  it("returns 503 without leaking the failure reason", async () => {
    let logs;
    ({ app, logs } = await buildTestApp({
      healthChecks: [{ name: "database", check: () => Promise.reject(new Error("password authentication failed for user usrock")) }],
    }));
    const res = await app.inject({ method: "GET", url: "/api/v1/health" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ status: "degraded", checks: { database: { status: "down" } } });
    expect(res.body).not.toContain("password");
    expect(logs.raw()).toContain("health check failed");
  });

  it("reports a hanging dependency as down after the timeout", async () => {
    ({ app } = await buildTestApp({ healthChecks: [{ name: "database", check: () => new Promise<void>(() => {}) }] }));
    const started = Date.now();
    const res = await app.inject({ method: "GET", url: "/api/v1/health" });
    expect(res.statusCode).toBe(503);
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});

describe("GET /api/v1/health/live", () => {
  it("does not depend on external services", async () => {
    ({ app } = await buildTestApp({ healthChecks: [{ name: "database", check: () => Promise.reject(new Error("down")) }] }));
    const res = await app.inject({ method: "GET", url: "/api/v1/health/live" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });
});
