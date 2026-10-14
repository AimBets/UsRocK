import { and, asc, eq, gt, inArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../../db/client.js";
import { errors } from "../../shared/errors.js";
import { buildPage, decodeCursor, type PageInfo } from "../../shared/pagination.js";
import type { ListProductsQuery, ProductSort } from "./catalog.contracts.js";
import { categories, collections, products } from "./catalog.schema.js";

const productCursorSchema = z.object({
  s: z.enum(["newest", "price_asc", "price_desc", "name_asc"]),
  v: z.union([z.string().max(300), z.number().int()]),
  id: z.uuid(),
});

const collectionCursorSchema = z.object({ p: z.number().int(), id: z.uuid() });

interface ProductKeyRow extends Record<string, unknown> {
  id: string;
  name: string;
  published_key: string;
  min_price: number;
}

/** Escapes LIKE wildcards so user input is matched literally. */
function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function sortKey(sort: ProductSort, row: ProductKeyRow): string | number {
  switch (sort) {
    case "newest":
      return row.published_key;
    case "price_asc":
    case "price_desc":
      return row.min_price;
    case "name_asc":
      return row.name;
  }
}

function keysetCondition(sort: ProductSort, value: string | number, id: string): SQL {
  const invalid = () =>
    errors.validation([{ path: "querystring.cursor", message: "Cursor inválido ou expirado.", code: "invalid_cursor" }]);
  switch (sort) {
    case "newest":
      if (typeof value !== "string") throw invalid();
      return sql`(p.published_at, p.id) < (${value}::timestamptz, ${id}::uuid)`;
    case "price_asc":
      if (typeof value !== "number") throw invalid();
      return sql`(agg.min_price, p.id) > (${value}::integer, ${id}::uuid)`;
    case "price_desc":
      if (typeof value !== "number") throw invalid();
      return sql`(agg.min_price, p.id) < (${value}::integer, ${id}::uuid)`;
    case "name_asc":
      if (typeof value !== "string") throw invalid();
      return sql`(p.name, p.id) > (${value}::text, ${id}::uuid)`;
  }
}

const orderBy: Record<ProductSort, SQL> = {
  newest: sql`p.published_at DESC, p.id DESC`,
  price_asc: sql`agg.min_price ASC, p.id ASC`,
  price_desc: sql`agg.min_price DESC, p.id DESC`,
  name_asc: sql`p.name ASC, p.id ASC`,
};

/**
 * Selects one page of active product ids with keyset pagination. Only products with at least
 * one active variant are listed (a product without variants has no price and cannot be bought).
 * Variant filters (size, price, stock) must all match the same variant.
 */
export async function findProductPage(db: Db, query: ListProductsQuery): Promise<{ ids: string[]; pageInfo: PageInfo }> {
  const conditions: SQL[] = [sql`p.status = 'active'`];

  if (query.q) {
    conditions.push(
      sql`(p.search_vector @@ websearch_to_tsquery('portuguese', ${query.q}) OR p.name ILIKE ${likePattern(query.q)})`,
    );
  }
  if (query.category) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM categories c LEFT JOIN categories parent ON parent.id = c.parent_id
      WHERE c.id = p.category_id AND c.is_active AND (c.slug = ${query.category} OR (parent.slug = ${query.category} AND parent.is_active))
    )`);
  }
  if (query.collection) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM product_collections pc JOIN collections col ON col.id = pc.collection_id
      WHERE pc.product_id = p.id AND col.slug = ${query.collection} AND col.status = 'published'
    )`);
  }

  const variantConditions: SQL[] = [];
  if (query.size) variantConditions.push(sql`v.size = ${query.size}`);
  if (query.priceMin !== undefined) variantConditions.push(sql`v.price_minor >= ${query.priceMin}`);
  if (query.priceMax !== undefined) variantConditions.push(sql`v.price_minor <= ${query.priceMax}`);
  if (query.inStock) variantConditions.push(sql`coalesce(il.on_hand - il.reserved, 0) > 0`);
  if (variantConditions.length > 0) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM product_variants v LEFT JOIN inventory_levels il ON il.variant_id = v.id
      WHERE v.product_id = p.id AND v.is_active AND ${sql.join(variantConditions, sql` AND `)}
    )`);
  }

  if (query.cursor) {
    const cursor = decodeCursor(query.cursor, productCursorSchema);
    if (cursor.s !== query.sort) {
      throw errors.validation([
        { path: "querystring.cursor", message: "O cursor pertence a outra ordenação.", code: "invalid_cursor" },
      ]);
    }
    conditions.push(keysetCondition(query.sort, cursor.v, cursor.id));
  }

  const result = await db.execute<ProductKeyRow>(sql`
    SELECT p.id, p.name, p.published_at::text AS published_key, agg.min_price
    FROM products p
    JOIN LATERAL (
      SELECT min(v.price_minor) AS min_price FROM product_variants v WHERE v.product_id = p.id AND v.is_active
    ) agg ON agg.min_price IS NOT NULL
    WHERE ${sql.join(conditions, sql` AND `)}
    ORDER BY ${orderBy[query.sort]}
    LIMIT ${query.limit + 1}
  `);

  const page = buildPage(
    result.rows,
    query.limit,
    (row) => ({ s: query.sort, v: sortKey(query.sort, row), id: row.id }),
    (row) => row.id,
  );
  return { ids: page.data, pageInfo: page.pageInfo };
}

export async function findProductsByIds(db: Db, ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await db.query.products.findMany({
    where: inArray(products.id, ids),
    with: {
      category: true,
      collections: { with: { collection: true }, orderBy: (pc, { asc: ascending }) => [ascending(pc.position)] },
      variants: {
        where: (v, { eq: equals }) => equals(v.isActive, true),
        orderBy: (v, { asc: ascending }) => [ascending(v.position), ascending(v.size)],
        with: { inventory: true },
      },
      media: { orderBy: (m, { asc: ascending }) => [ascending(m.position)], limit: 1 },
    },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter((row) => row !== undefined);
}

export async function findActiveProductBySlug(db: Db, slug: string) {
  return db.query.products.findFirst({
    where: and(eq(products.slug, slug), eq(products.status, "active")),
    with: {
      category: true,
      collections: { with: { collection: true }, orderBy: (pc, { asc: ascending }) => [ascending(pc.position)] },
      variants: {
        where: (v, { eq: equals }) => equals(v.isActive, true),
        orderBy: (v, { asc: ascending }) => [ascending(v.position), ascending(v.size)],
        with: { inventory: true },
      },
      media: { orderBy: (m, { asc: ascending }) => [ascending(m.position)] },
    },
  });
}

export type ProductWithRelations = NonNullable<Awaited<ReturnType<typeof findActiveProductBySlug>>>;

export async function findPublishedCollections(db: Db, limit: number, cursor?: string) {
  const conditions: SQL[] = [eq(collections.status, "published")];
  if (cursor) {
    const { p, id } = decodeCursor(cursor, collectionCursorSchema);
    const after = or(gt(collections.position, p), and(eq(collections.position, p), gt(collections.id, id)));
    if (after) conditions.push(after);
  }
  const rows = await db
    .select()
    .from(collections)
    .where(and(...conditions))
    .orderBy(asc(collections.position), asc(collections.id))
    .limit(limit + 1);
  return buildPage(rows, limit, (row) => ({ p: row.position, id: row.id }), (row) => row);
}

export async function findPublishedCollectionBySlug(db: Db, slug: string) {
  const [row] = await db
    .select()
    .from(collections)
    .where(and(eq(collections.slug, slug), eq(collections.status, "published")))
    .limit(1);
  return row;
}

export const MAX_CATEGORIES = 500;

export async function findActiveCategories(db: Db) {
  return db
    .select()
    .from(categories)
    .where(eq(categories.isActive, true))
    .orderBy(asc(categories.position), asc(categories.name))
    .limit(MAX_CATEGORIES);
}
