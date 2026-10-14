import { existsSync } from "node:fs";
import { buildApp } from "./app.js";
import { EnvValidationError, loadEnv, type Env } from "./config/env.js";
import { createDatabase } from "./db/client.js";

if (existsSync(".env")) process.loadEnvFile(".env");

function readEnv(): Env {
  try {
    return loadEnv();
  } catch (error) {
    if (error instanceof EnvValidationError) {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}

const env = readEnv();

const database = createDatabase(env.DATABASE_URL, {
  poolMax: env.DATABASE_POOL_MAX,
  onPoolError: (error) => app.log.error({ err: error }, "idle database client error"),
});

const app = await buildApp({ env, database });

app.addHook("onClose", async () => {
  await database.close();
});

let shuttingDown = false;
async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "shutting down");
  // Stop accepting requests, let in-flight ones finish, then release the pool.
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();
  try {
    await app.close();
    process.exit(0);
  } catch (error) {
    app.log.error({ err: error }, "error during shutdown");
    process.exit(1);
  }
}

process.on("SIGINT", (signal) => void shutdown(signal));
process.on("SIGTERM", (signal) => void shutdown(signal));

try {
  await app.listen({ host: env.HOST, port: env.PORT });
  if (env.API_DOCS_ENABLED) app.log.info(`API docs: http://${env.HOST}:${env.PORT}/docs`);
} catch (error) {
  app.log.fatal({ err: error }, "failed to start");
  await database.close();
  process.exit(1);
}
