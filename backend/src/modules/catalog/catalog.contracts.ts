import { z } from "zod";
import { moneySchema } from "../../shared/money.js";
import { paginatedResponseSchema, paginationQuerySchema } from "../../shared/pagination.js";
import { slugSchema } from "../../shared/slug.js";
import { availabilityStates } from "./availability.js";

export const availabilitySchema = z
  .enum(availabilityStates)
  .describe("Estado público de estoque. Quantidades exatas nunca são expostas.")
  .meta({ id: "Availability" });

export const mediaSchema = z
  .object({
    url: z.string().describe("Caminho relativo ao site (`/images/...`) ou URL https absoluta."),
    alt: z.string(),
    width: z.number().int().nullable(),
    height: z.number().int().nullable(),
  })
  .meta({ id: "Media" });

export const categoryRefSchema = z.object({ id: z.uuid(), slug: z.string(), name: z.string() }).meta({ id: "CategoryRef" });
export const collectionRefSchema = z.object({ id: z.uuid(), slug: z.string(), title: z.string() }).meta({ id: "CollectionRef" });

export const variantSchema = z
  .object({
    id: z.uuid(),
    sku: z.string(),
    size: z.string(),
    color: z.string().nullable(),
    price: moneySchema,
    compareAtPrice: moneySchema.nullable().describe("Preço anterior (riscado). Sempre maior que `price` quando presente."),
    availability: availabilitySchema,
  })
  .meta({ id: "ProductVariant" });

const productBaseShape = {
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  label: z.string().nullable().describe("Selo curto do card, ex.: `LANÇAMENTO`."),
  tone: z.enum(["black", "graphite", "bone"]).nullable().describe("Sugestão de fundo do card; apenas apresentação."),
  isDemo: z.boolean().describe("true para conteúdo demonstrativo (seed). Nunca representa preço/estoque reais."),
  category: categoryRefSchema.nullable(),
  collections: z.array(collectionRefSchema),
  priceRange: z.object({ min: moneySchema, max: moneySchema }).describe("Menor e maior preço entre variantes ativas."),
  availability: availabilitySchema.describe("Melhor disponibilidade entre as variantes."),
  variants: z.array(variantSchema),
};

export const productSummarySchema = z
  .object({ ...productBaseShape, primaryMedia: mediaSchema.nullable() })
  .meta({ id: "ProductSummary" });

export const productDetailSchema = z
  .object({
    ...productBaseShape,
    description: z.string(),
    media: z.array(mediaSchema),
    seo: z.object({ title: z.string(), description: z.string().nullable() }),
    publishedAt: z.iso.datetime(),
  })
  .meta({ id: "ProductDetail" });

export const collectionSchema = z
  .object({
    id: z.uuid(),
    slug: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    heroMedia: z.object({ url: z.string(), alt: z.string() }).nullable(),
  })
  .meta({ id: "Collection" });

export const categorySchema = z
  .object({
    id: z.uuid(),
    slug: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    parentId: z.uuid().nullable(),
  })
  .meta({ id: "Category" });

export const productSorts = ["newest", "price_asc", "price_desc", "name_asc"] as const;
export type ProductSort = (typeof productSorts)[number];

const booleanQuery = z.enum(["true", "false"]).transform((value) => value === "true");

export const listProductsQuerySchema = paginationQuerySchema
  .extend({
    q: z.string().trim().min(1).max(100).optional().describe("Busca textual em nome e descrição."),
    category: slugSchema.optional().describe("Slug da categoria (inclui subcategorias diretas)."),
    collection: slugSchema.optional().describe("Slug de coleção publicada."),
    size: z.string().trim().min(1).max(10).optional().describe("Tamanho exato da variante, ex.: `M`."),
    priceMin: z.coerce.number().int().min(0).optional().describe("Preço mínimo em centavos."),
    priceMax: z.coerce.number().int().min(0).optional().describe("Preço máximo em centavos."),
    inStock: booleanQuery.optional().describe("`true`: somente produtos com variante disponível."),
    sort: z.enum(productSorts).default("newest"),
  })
  .refine((query) => query.priceMin === undefined || query.priceMax === undefined || query.priceMin <= query.priceMax, {
    message: "priceMin não pode ser maior que priceMax.",
    path: ["priceMin"],
  });

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

export const productListResponseSchema = paginatedResponseSchema(productSummarySchema);
export const collectionListResponseSchema = paginatedResponseSchema(collectionSchema);
export const categoryListResponseSchema = z.object({ data: z.array(categorySchema) });

export const slugParamsSchema = z.object({ slug: slugSchema });

export type ProductSummary = z.infer<typeof productSummarySchema>;
export type ProductDetail = z.infer<typeof productDetailSchema>;
export type Collection = z.infer<typeof collectionSchema>;
export type Category = z.infer<typeof categorySchema>;
