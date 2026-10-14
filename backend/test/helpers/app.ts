import { buildApp, type AppDependencies } from "../../src/app.js";
import { loadEnv, type Env } from "../../src/config/env.js";

export const TEST_ORIGIN = "http://localhost:3000";

export function testEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({
    NODE_ENV: "test",
    LOG_LEVEL: "info",
    DATABASE_URL: "postgres://usrock:unused@127.0.0.1:5432/unused",
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

export async function buildTestApp(
  options: Partial<Omit<AppDependencies, "env">> & { env?: Record<string, string> } = {},
) {
  const logs = captureLogs();
  const { env, ...deps } = options;
  const app = await buildApp({ env: testEnv(env), logStream: logs.stream, ...deps });
  return { app, logs };
}
