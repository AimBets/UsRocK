import { and, asc, count, desc, eq, ne, sql } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Db, DbExecutor } from "../../db/client.js";
import { brazilianStates, cpfSchema, maskCpf, maskPhone, phoneSchema, postalCodeSchema } from "../../shared/br.js";
import { errorResponseSchema, errors } from "../../shared/errors.js";
import { requireAuth } from "../auth/auth.plugin.js";
import { addresses, MAX_ADDRESSES_PER_USER } from "./addresses.schema.js";

export interface AddressesRoutesOptions {
  db: Db;
}

type AddressRow = typeof addresses.$inferSelect;

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

export const addressInputSchema = z.object({
  label: text(1, 40).nullish().describe("Apelido opcional (ex.: Casa)."),
  recipientName: text(3, 120),
  recipientDocument: cpfSchema,
  recipientPhone: phoneSchema,
  postalCode: postalCodeSchema,
  street: text(2, 200),
  number: text(1, 20).describe("Número; use `S/N` quando não houver."),
  complement: text(1, 100).nullish(),
  district: text(2, 100),
  city: text(2, 100),
  state: z.string().trim().toUpperCase().pipe(z.enum(brazilianStates)),
  isDefault: z.boolean().optional(),
});

const addressUpdateSchema = addressInputSchema.partial();

export const addressSchema = z
  .object({
    id: z.uuid(),
    label: z.string().nullable(),
    recipientName: z.string(),
    recipientDocumentMasked: z.string().describe("CPF mascarado (`***.***.789-09`). O número completo nunca é devolvido."),
    recipientPhoneMasked: z.string(),
    postalCode: z.string().describe("8 dígitos."),
    street: z.string(),
    number: z.string(),
    complement: z.string().nullable(),
    district: z.string(),
    city: z.string(),
    state: z.string(),
    isDefault: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "Address" });

const addressListSchema = z.object({ data: z.array(addressSchema) }).meta({ id: "AddressList" });
const idParamsSchema = z.object({ id: z.uuid() });
const sessionSecurity = [{ sessionCookie: [] }];

export function toAddressView(row: AddressRow): z.infer<typeof addressSchema> {
  return {
    id: row.id,
    label: row.label,
    recipientName: row.recipientName,
    recipientDocumentMasked: maskCpf(row.recipientDocument),
    recipientPhoneMasked: maskPhone(row.recipientPhone),
    postalCode: row.postalCode,
    street: row.street,
    number: row.number,
    complement: row.complement,
    district: row.district,
    city: row.city,
    state: row.state,
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The customer's own address; other customers' ids are reported as not found. */
export async function findOwnAddress(db: DbExecutor, userId: string, id: string): Promise<AddressRow | undefined> {
  const [row] = await db.select().from(addresses).where(and(eq(addresses.id, id), eq(addresses.userId, userId))).limit(1);
  return row;
}

const notFound = () => errors.notFound("Endereço não encontrado.");

export const addressesRoutes: FastifyPluginAsyncZod<AddressesRoutesOptions> = async (app, { db }) => {
  app.addHook("preValidation", requireAuth);
  app.addHook("onSend", async (_request, reply) => {
    reply.header("cache-control", "no-store");
  });

  async function list(userId: string) {
    const rows = await db
      .select()
      .from(addresses)
      .where(eq(addresses.userId, userId))
      .orderBy(desc(addresses.isDefault), asc(addresses.createdAt), asc(addresses.id));
    return { data: rows.map(toAddressView) };
  }

  app.get(
    "/me/addresses",
    {
      schema: {
        tags: ["addresses"],
        summary: "Endereços de entrega do cliente (padrão primeiro)",
        security: sessionSecurity,
        response: { 200: addressListSchema, 401: errorResponseSchema },
      },
    },
    async (request) => list(request.principal!.userId),
  );

  app.post(
    "/me/addresses",
    {
      schema: {
        tags: ["addresses"],
        summary: "Cadastra endereço de entrega",
        description: `Até ${MAX_ADDRESSES_PER_USER} endereços. O primeiro vira padrão automaticamente. CPF validado pelos dígitos verificadores.`,
        security: sessionSecurity,
        body: addressInputSchema,
        response: { 201: addressSchema, 401: errorResponseSchema, 409: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const userId = request.principal!.userId;
      const row = await db.transaction(async (tx) => {
        // Serialises concurrent creations for the same customer (limit and single default).
        await tx.execute(sqlLockUser(userId));
        const [{ total } = { total: 0 }] = await tx.select({ total: count() }).from(addresses).where(eq(addresses.userId, userId));
        if (total >= MAX_ADDRESSES_PER_USER) {
          throw errors.conflict(`Limite de ${MAX_ADDRESSES_PER_USER} endereços atingido.`, [
            { path: "body", message: "Limite de endereços.", code: "addresses_full" },
          ]);
        }
        const isDefault = total === 0 || request.body.isDefault === true;
        if (isDefault) await tx.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, userId));
        const [created] = await tx
          .insert(addresses)
          .values({ ...request.body, label: request.body.label ?? null, complement: request.body.complement ?? null, userId, isDefault })
          .returning();
        return created!;
      });
      return reply.status(201).send(toAddressView(row));
    },
  );

  app.patch(
    "/me/addresses/:id",
    {
      schema: {
        tags: ["addresses"],
        summary: "Altera endereço (pedidos já feitos mantêm a cópia original)",
        security: sessionSecurity,
        params: idParamsSchema,
        body: addressUpdateSchema,
        response: { 200: addressSchema, 401: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request) => {
      const userId = request.principal!.userId;
      const row = await db.transaction(async (tx) => {
        await tx.execute(sqlLockUser(userId));
        const current = await findOwnAddress(tx, userId, request.params.id);
        if (!current) throw notFound();
        const { isDefault, ...changes } = request.body;
        if (isDefault === true) {
          await tx.update(addresses).set({ isDefault: false }).where(and(eq(addresses.userId, userId), ne(addresses.id, current.id)));
        }
        const [updated] = await tx
          .update(addresses)
          // Unsetting the default is ignored: one address always stays the default.
          .set({ ...changes, ...(isDefault === true ? { isDefault: true } : {}) })
          .where(eq(addresses.id, current.id))
          .returning();
        return updated!;
      });
      return toAddressView(row);
    },
  );

  app.delete(
    "/me/addresses/:id",
    {
      schema: {
        tags: ["addresses"],
        summary: "Remove endereço (idempotente para o próprio cliente)",
        description: "Se o removido era o padrão, o mais antigo restante passa a ser o padrão.",
        security: sessionSecurity,
        params: idParamsSchema,
        response: { 204: z.null(), 401: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const userId = request.principal!.userId;
      await db.transaction(async (tx) => {
        await tx.execute(sqlLockUser(userId));
        const [removed] = await tx
          .delete(addresses)
          .where(and(eq(addresses.id, request.params.id), eq(addresses.userId, userId)))
          .returning();
        if (removed?.isDefault) {
          const [next] = await tx.select().from(addresses).where(eq(addresses.userId, userId)).orderBy(asc(addresses.createdAt)).limit(1);
          if (next) await tx.update(addresses).set({ isDefault: true }).where(eq(addresses.id, next.id));
        }
      });
      return reply.status(204).send(null);
    },
  );
};

/** Transaction-scoped advisory lock per customer for address bookkeeping. */
function sqlLockUser(userId: string) {
  return sql`SELECT pg_advisory_xact_lock(hashtext(${`addresses:${userId}`}))`;
}
