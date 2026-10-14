import { existsSync } from "node:fs";
import pg from "pg";
import type { TestProject } from "vitest/node";
import { runMigrations } from "../../src/db/migrate.js";

declare module "vitest" {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}

/**
 * Resets the dedicated test database and applies every migration from scratch, so the suite
 * also proves that the migration history builds a clean database.
 */
export default async function setup(project: TestProject) {
  if (!process.env.TEST_DATABASE_URL && existsSync(".env")) process.loadEnvFile(".env");
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL não definida. Suba o banco com `npm run db:up` e configure backend/.env (ver .env.example).");
  }
  const databaseName = new URL(url).pathname.slice(1);
  if (!databaseName.endsWith("_test")) {
    throw new Error(`Recusado: o banco de testes é apagado a cada execução e deve terminar em "_test" (recebido "${databaseName}").`);
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");
  } finally {
    await client.end();
  }

  await runMigrations(url);
  project.provide("testDatabaseUrl", url);
}
