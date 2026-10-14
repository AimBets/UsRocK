import { buildApp, type AppDependencies } from "../../src/app.js";
import { loadEnv, type Env } from "../../src/config/env.js";
import { createDatabase } from "../../src/db/client.js";

export const TEST_ORIGIN = "http://localhost:3000";

/** Points at a closed port: unit tests must never reach a real database. */
const UNREACHABLE_DATABASE_URL = "postgres://usrock:unused@127.0.0.1:1/unused";

export function testEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({
    NODE_ENV: "test",
    LOG_LEVEL: "info",
    DATABASE_URL: UNREACHABLE_DATABASE_URL,
    CORS_ORIGINS: TEST_ORIGIN,
    API_DOCS_ENABLED: "false",
    ...overrides,
  });
}

/** Collects every log line emitted by the app as parsed JSON. */
export function captureLogs() {
  const lines: Record<string, unknown>[] = [];
  return {
    lines,
    raw: () => lines.map((line) => JSON.stringify(line)).join("\n"),
    stream: { write: (line: string) => void lines.push(JSON.parse(line) as Record<string, unknown>) },
  };
}

/**
 * Builds the app with captured logs. Without `database`, a lazy pool to an unreachable address
 * is used (closed together with the app); integration tests pass a real one.
 */
export async function buildTestApp(
  options: Partial<Omit<AppDependencies, "env">> & { env?: Record<string, string> } = {},
) {
  const logs = captureLogs();
  const { env, database, ...deps } = options;
  const resolvedEnv = testEnv(env);
  const ownDatabase = database ? undefined : createDatabase(resolvedEnv.DATABASE_URL, { poolMax: 1 });
  const app = await buildApp({ env: resolvedEnv, database: database ?? ownDatabase!, logStream: logs.stream, ...deps });
  if (ownDatabase) app.addHook("onClose", () => ownDatabase.close());
  return { app, logs };
}
