import type { FastifyReply } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { Db } from "../../db/client.js";
import { errorResponseSchema, errors } from "../../shared/errors.js";
import { paginationQuerySchema } from "../../shared/pagination.js";
import {
  categoryListResponseSchema,
  collectionListResponseSchema,
  collectionSchema,
  listProductsQuerySchema,
  productDetailSchema,
  productListResponseSchema,
  slugParamsSchema,
} from "./catalog.contracts.js";
import { toCategory, toCollection, toProductDetail, toProductSummary } from "./catalog.mappers.js";
import {
  findActiveCategories,
  findActiveProductBySlug,
  findProductPage,
  findProductsByIds,
  findPublishedCollectionBySlug,
  findPublishedCollections,
} from "./catalog.repository.js";

export interface CatalogRoutesOptions {
  db: Db;
}

/**
 * Public catalog data may be cached briefly by browsers/CDN. Availability can therefore lag by
 * up to a minute; carts and checkout always revalidate stock and price on the server.
 */
function publicCache(reply: FastifyReply) {
  reply.header("cache-control", "public, max-age=60, stale-while-revalidate=300");
}

export const catalogRoutes: FastifyPluginAsyncZod<CatalogRoutesOptions> = async (app, { db }) => {
  app.get(
    "/products",
    {
      schema: {
        tags: ["catalog"],
        summary: "Lista produtos ativos com busca, filtros, ordenação e paginação por cursor",
        querystring: listProductsQuerySchema,
        response: { 200: productListResponseSchema },
      },
    },
    async (request, reply) => {
      const { ids, pageInfo } = await findProductPage(db, request.query);
      const rows = await findProductsByIds(db, ids);
      publicCache(reply);
      return { data: rows.map(toProductSummary), pageInfo };
    },
  );

  app.get(
    "/products/:slug",
    {
      schema: {
        tags: ["catalog"],
        summary: "Detalhe de produto ativo por slug",
        params: slugParamsSchema,
        response: { 200: productDetailSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const product = await findActiveProductBySlug(db, request.params.slug);
      if (!product || product.variants.length === 0) throw errors.notFound("Produto não encontrado.");
      publicCache(reply);
      return toProductDetail(product);
    },
  );

  app.get(
    "/collections",
    {
      schema: {
        tags: ["catalog"],
        summary: "Lista coleções publicadas",
        querystring: paginationQuerySchema,
        response: { 200: collectionListResponseSchema },
      },
    },
    async (request, reply) => {
      const page = await findPublishedCollections(db, request.query.limit, request.query.cursor);
      publicCache(reply);
      return { data: page.data.map(toCollection), pageInfo: page.pageInfo };
    },
  );

  app.get(
    "/collections/:slug",
    {
      schema: {
        tags: ["catalog"],
        summary: "Detalhe de coleção publicada por slug (produtos via GET /products?collection=)",
        params: slugParamsSchema,
        response: { 200: collectionSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const collection = await findPublishedCollectionBySlug(db, request.params.slug);
      if (!collection) throw errors.notFound("Coleção não encontrada.");
      publicCache(reply);
      return toCollection(collection);
    },
  );

  app.get(
    "/categories",
    {
      schema: {
        tags: ["catalog"],
        summary: "Lista completa de categorias ativas (não paginada; máximo 500)",
        description: "Árvore achatada: use `parentId` para montar a hierarquia.",
        response: { 200: categoryListResponseSchema },
      },
    },
    async (_request, reply) => {
      const rows = await findActiveCategories(db);
      publicCache(reply);
      return { data: rows.map(toCategory) };
    },
  );
};
