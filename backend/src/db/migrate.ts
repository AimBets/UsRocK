import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { z } from "zod";
import { createDatabase } from "./client.js";

export const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

export async function runMigrations(connectionString: string): Promise<void> {
  const database = createDatabase(connectionString, { poolMax: 1 });
  try {
    await migrate(database.db, { migrationsFolder });
  } finally {
    await database.close();
  }
}

const isEntryPoint = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (isEntryPoint) {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const url = z.url({ protocol: /^postgres(ql)?$/ }).safeParse(process.env.DATABASE_URL);
  if (!url.success) {
    console.error("DATABASE_URL ausente ou inválida.");
    process.exit(1);
  }
  runMigrations(url.data)
    .then(() => console.log("Migrações aplicadas."))
    .catch((error: unknown) => {
      // Log only the message: driver errors can embed the connection string.
      console.error("Falha ao aplicar migrações:", error instanceof Error ? error.message : "erro desconhecido");
      process.exit(1);
    });
}
