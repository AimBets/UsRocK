// Writes the OpenAPI document to `openapi/openapi.json` (the contract consumed by the frontend).
// `--check` fails when the committed file is out of date, so CI catches contract drift.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";

const outputFile = join(dirname(fileURLToPath(import.meta.url)), "..", "openapi", "openapi.json");
const checkOnly = process.argv.includes("--check");

// No connection is opened: the document is derived from route schemas only.
const env = loadEnv({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  DATABASE_URL: "postgres://openapi:unused@127.0.0.1:5432/unused",
  API_DOCS_ENABLED: "false",
});

const app = await buildApp({ env });
await app.ready();
const document = `${JSON.stringify(app.swagger(), null, 2)}\n`;
await app.close();

if (checkOnly) {
  let current = "";
  try {
    current = readFileSync(outputFile, "utf8").replace(/\r\n/g, "\n");
  } catch {
    // missing file is reported below as out of date
  }
  if (current !== document) {
    console.error("openapi/openapi.json está desatualizado. Rode `npm run openapi:generate` e versione o resultado.");
    process.exit(1);
  }
  console.log("openapi/openapi.json está atualizado.");
} else {
  mkdirSync(dirname(outputFile), { recursive: true });
  writeFileSync(outputFile, document);
  console.log(`OpenAPI gerado em ${outputFile}`);
}
