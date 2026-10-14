import { afterAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../src/app.js";
import { createDatabase } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { captureLogs, testEnv } from "./helpers/app.js";

const url = inject("testDatabaseUrl");
const database = createDatabase(url, { poolMax: 2 });

afterAll(async () => {
  await database.close();
});

describe("migrations", () => {
  it("applies the baseline migration to a clean database", async () => {
    const applied = await database.pool.query<{ count: string }>("select count(*) from drizzle.__drizzle_migrations");
    expect(Number(applied.rows[0]?.count)).toBeGreaterThanOrEqual(1);

    const extension = await database.pool.query("select 1 from pg_extension where extname = 'citext'");
    expect(extension.rowCount).toBe(1);
  });

  it("is idempotent when run again", async () => {
    await runMigrations(url);
    const applied = await database.pool.query<{ count: string }>("select count(*) from drizzle.__drizzle_migrations");
    const files = await import("../drizzle/meta/_journal.json", { with: { type: "json" } });
    expect(Number(applied.rows[0]?.count)).toBe(files.default.entries.length);
  });
});

describe("health against a real PostgreSQL", () => {
  it("reports the database as up", async () => {
    const app = await buildApp({
      env: testEnv(),
      logStream: captureLogs().stream,
      healthChecks: [{ name: "database", check: () => database.ping() }],
    });
    try {
      const res = await app.inject({ method: "GET", url: "/api/v1/health" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: "ok", checks: { database: { status: "up" } } });
    } finally {
      await app.close();
    }
  });

  it("reports 503 when the database is unreachable", async () => {
    const unreachable = createDatabase("postgres://usrock:wrong@127.0.0.1:1/usrock_test", { poolMax: 1 });
    const logs = captureLogs();
    const app = await buildApp({
      env: testEnv(),
      logStream: logs.stream,
      healthChecks: [{ name: "database", check: () => unreachable.ping() }],
    });
    try {
      const res = await app.inject({ method: "GET", url: "/api/v1/health" });
      expect(res.statusCode).toBe(503);
      expect(res.json()).toMatchObject({ status: "degraded", checks: { database: { status: "down" } } });
      expect(res.body).not.toContain("wrong");
    } finally {
      await app.close();
      await unreachable.close();
    }
  });
});
