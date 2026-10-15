import { and, count, desc, eq, inArray } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Db } from "../../db/client.js";
import { errorResponseSchema, errors } from "../../shared/errors.js";
import { requireAuth } from "../auth/auth.plugin.js";
import { productSummarySchema } from "../catalog/catalog.contracts.js";
import { toProductSummary } from "../catalog/catalog.mappers.js";
import { findProductsByIds } from "../catalog/catalog.repository.js";
import { products } from "../catalog/catalog.schema.js";
import { favorites, MAX_FAVORITES } from "./favorites.schema.js";

export interface FavoritesRoutesOptions {
  db: Db;
}

const favoriteSchema = z
  .object({ product: productSummarySchema, addedAt: z.iso.datetime() })
  .meta({ id: "Favorite" });

const favoriteListSchema = z
  .object({ data: z.array(favoriteSchema).describe(`Mais recentes primeiro; máximo ${MAX_FAVORITES}. Somente produtos à venda.`) })
  .meta({ id: "FavoriteList" });

const productParamsSchema = z.object({ productId: z.uuid() });

const importBodySchema = z.object({
  productIds: z.array(z.uuid()).min(1).max(MAX_FAVORITES).describe("Favoritos locais (prévia). Produtos fora de venda são ignorados."),
});

const sessionSecurity = [{ sessionCookie: [] }];

async function listFavorites(db: Db, userId: string) {
  const rows = await db
    .select({ productId: favorites.productId, createdAt: favorites.createdAt })
    .from(favorites)
    .where(eq(favorites.userId, userId))
    .orderBy(desc(favorites.createdAt), desc(favorites.productId))
    .limit(MAX_FAVORITES);
  // findProductsByIds keeps only products that can be listed publicly (active with active variants).
  const listed = await findProductsByIds(db, rows.map((row) => row.productId));
  const byId = new Map(listed.filter((product) => product.status === "active" && product.variants.length > 0).map((p) => [p.id, p]));
  return {
    data: rows.flatMap((row) => {
      const product = byId.get(row.productId);
      return product ? [{ product: toProductSummary(product), addedAt: row.createdAt.toISOString() }] : [];
    }),
  };
}

/** Only products currently for sale can be favourited. */
async function sellableProductIds(db: Db, ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ id: products.id })
    .from(products)
    .where(and(inArray(products.id, [...ids]), eq(products.status, "active")));
  return new Set(rows.map((row) => row.id));
}

async function favoriteCount(db: Db, userId: string): Promise<number> {
  const [row] = await db.select({ total: count() }).from(favorites).where(eq(favorites.userId, userId));
  return row?.total ?? 0;
}

const limitReached = () =>
  errors.conflict(`Limite de ${MAX_FAVORITES} favoritos atingido.`, [
    { path: "params.productId", message: "Limite de favoritos.", code: "favorites_full" },
  ]);

export const favoritesRoutes: FastifyPluginAsyncZod<FavoritesRoutesOptions> = async (app, { db }) => {
  app.addHook("preHandler", requireAuth);
  app.addHook("onSend", async (_request, reply) => {
    reply.header("cache-control", "no-store");
  });

  app.get(
    "/me/favorites",
    {
      schema: {
        tags: ["favorites"],
        summary: "Favoritos da conta",
        security: sessionSecurity,
        response: { 200: favoriteListSchema, 401: errorResponseSchema },
      },
    },
    async (request) => listFavorites(db, request.principal!.userId),
  );

  app.put(
    "/me/favorites/:productId",
    {
      schema: {
        tags: ["favorites"],
        summary: "Adiciona um produto aos favoritos (idempotente)",
        security: sessionSecurity,
        params: productParamsSchema,
        response: { 204: z.null().describe("Sem conteúdo."), 401: errorResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const userId = request.principal!.userId;
      const { productId } = request.params;
      if (!(await sellableProductIds(db, [productId])).has(productId)) throw errors.notFound("Produto não encontrado.");
      const [existing] = await db
        .select({ productId: favorites.productId })
        .from(favorites)
        .where(and(eq(favorites.userId, userId), eq(favorites.productId, productId)))
        .limit(1);
      if (!existing) {
        if ((await favoriteCount(db, userId)) >= MAX_FAVORITES) throw limitReached();
        await db.insert(favorites).values({ userId, productId }).onConflictDoNothing();
      }
      return reply.status(204).send(null);
    },
  );

  app.delete(
    "/me/favorites/:productId",
    {
      schema: {
        tags: ["favorites"],
        summary: "Remove um produto dos favoritos (idempotente)",
        security: sessionSecurity,
        params: productParamsSchema,
        response: { 204: z.null().describe("Sem conteúdo."), 401: errorResponseSchema },
      },
    },
    async (request, reply) => {
      await db
        .delete(favorites)
        .where(and(eq(favorites.userId, request.principal!.userId), eq(favorites.productId, request.params.productId)));
      return reply.status(204).send(null);
    },
  );

  app.post(
    "/me/favorites/import",
    {
      schema: {
        tags: ["favorites"],
        summary: "Importa favoritos locais (união com os da conta) e retorna a lista resultante",
        security: sessionSecurity,
        body: importBodySchema,
        response: { 200: favoriteListSchema, 401: errorResponseSchema },
      },
    },
    async (request) => {
      const userId = request.principal!.userId;
      const ids = [...new Set(request.body.productIds)];
      const sellable = await sellableProductIds(db, ids);
      const existing = await db
        .select({ productId: favorites.productId })
        .from(favorites)
        .where(and(eq(favorites.userId, userId), inArray(favorites.productId, ids)));
      const already = new Set(existing.map((row) => row.productId));
      const room = MAX_FAVORITES - (await favoriteCount(db, userId));
      const toInsert = ids.filter((id) => sellable.has(id) && !already.has(id)).slice(0, Math.max(0, room));
      if (toInsert.length > 0) {
        await db.insert(favorites).values(toInsert.map((productId) => ({ userId, productId }))).onConflictDoNothing();
      }
      return listFavorites(db, userId);
    },
  );
};
