// Creates the first administrator, or grants the admin role to an existing account.
//   npm run user:create-admin -- --email admin@usrock.com.br --name "Nome"
//   (compiled) node dist/cli/create-admin.js --email ... --name ...
// The password comes from ADMIN_PASSWORD. Outside production, when it is absent, a random
// password is generated and printed once; in production ADMIN_PASSWORD is mandatory.
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { createDatabase } from "../db/client.js";
import { emailSchema } from "../modules/accounts/accounts.contracts.js";
import { users } from "../modules/accounts/accounts.schema.js";
import { hashPassword, passwordSchema } from "../modules/accounts/security.js";

if (existsSync(".env")) process.loadEnvFile(".env");

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const { values } = parseArgs({ options: { email: { type: "string" }, name: { type: "string" } } });
const email = emailSchema.safeParse(values.email);
if (!email.success) fail("Informe --email com um e-mail válido.");
const name = z.string().trim().min(1).max(120).safeParse(values.name ?? "Administrador");
if (!name.success) fail("--name deve ter entre 1 e 120 caracteres.");
const url = z.url({ protocol: /^postgres(ql)?$/ }).safeParse(process.env.DATABASE_URL);
if (!url.success) fail("DATABASE_URL ausente ou inválida.");

const production = process.env.NODE_ENV === "production";
let password = process.env.ADMIN_PASSWORD;
let generated = false;
if (password === undefined) {
  if (production) fail("Em produção, defina ADMIN_PASSWORD (não é gerada automaticamente).");
  password = randomBytes(18).toString("base64url");
  generated = true;
}
const checked = passwordSchema.safeParse(password);
if (!checked.success) fail(checked.error.issues[0]?.message ?? "Senha inválida.");

const database = createDatabase(url.data, { poolMax: 1 });
try {
  const [existing] = await database.db.select().from(users).where(eq(users.email, email.data)).limit(1);
  if (existing) {
    await database.db
      .update(users)
      .set({ roles: sql`(SELECT array_agg(DISTINCT r) FROM unnest(${users.roles} || ARRAY['admin']::user_role[]) AS r)` })
      .where(eq(users.id, existing.id));
    console.log(`Conta existente promovida a admin: ${email.data} (senha mantida).`);
  } else {
    await database.db.insert(users).values({
      email: email.data,
      name: name.data,
      passwordHash: await hashPassword(checked.data),
      roles: ["admin"],
    });
    console.log(`Administrador criado: ${email.data}`);
    if (generated) console.log(`Senha gerada (exibida apenas agora; troque após o primeiro acesso): ${checked.data}`);
  }
} catch (error) {
  fail(`Falha: ${error instanceof Error ? error.message : "erro desconhecido"}`);
} finally {
  await database.close();
}
