import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { App } from "../src/app.js";
import { createDatabase } from "../src/db/client.js";
import { seedDemoCatalog } from "../src/db/seed.js";
import { demoProducts, demoSku } from "../src/db/seed-data/demo-catalog.js";
import type { Collection, ProductDetail, ProductSummary } from "../src/modules/catalog/catalog.contracts.js";
import {
  categories,
  collections,
  inventoryLevels,
  productCollections,
  products,
  productVariants,
} from "../src/modules/catalog/catalog.schema.js";
import type { ErrorResponse } from "../src/shared/errors.js";
import type { PageInfo } from "../src/shared/pagination.js";
import { buildTestApp } from "./helpers/app.js";

const database = createDatabase(inject("testDatabaseUrl"), { poolMax: 3 });
const { db } = database;
let app: App;

type ListBody = { data: ProductSummary[]; pageInfo: PageInfo };

async function list(query = ""): Promise<ListBody> {
  const res = await app.inject({ method: "GET", url: `/api/v1/products${query}` });
  expect(res.statusCode, res.body).toBe(200);
  return res.json<ListBody>();
}

async function listAllPages(query: string, limit: number): Promise<string[]> {
  const slugs: string[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 20; guard += 1) {
    const separator = query ? "&" : "";
    const body = await list(`?${query}${separator}limit=${limit}${cursor ? `&cursor=${cursor}` : ""}`);
    slugs.push(...body.data.map((product) => product.slug));
    if (!body.pageInfo.hasNextPage) return slugs;
    cursor = body.pageInfo.nextCursor;
  }
  throw new Error("pagination did not terminate");
}

beforeAll(async () => {
  await db.execute(sql`TRUNCATE inventory_movements, inventory_levels, product_media, product_variants, product_collections, products, collections, categories RESTART IDENTITY CASCADE`);
  await seedDemoCatalog(db);

  // Fixtures that must never be visible publicly.
  const [category] = await db.select().from(categories).where(eq(categories.slug, "camisetas"));
  const [draft] = await db
    .insert(products)
    .values({ slug: "rascunho-secreto", name: "Rascunho Secreto", status: "draft", categoryId: category?.id })
    .returning();
  await db.insert(productVariants).values({ productId: draft!.id, sku: "TEST-DRAFT-M", size: "M", priceMinor: 100 });
  await db.insert(products).values({
    slug: "sem-variantes",
    name: "Sem Variantes",
    status: "active",
    publishedAt: new Date(),
  });
  const [archived] = await db
    .insert(collections)
    .values({ slug: "colecao-arquivada", title: "Coleção Arquivada", status: "archived" })
    .returning();
  const [nocturne] = await db.select().from(products).where(eq(products.slug, "nocturne-wings-oversized"));
  await db.insert(productCollections).values({ productId: nocturne!.id, collectionId: archived!.id });

  ({ app } = await buildTestApp({ database }));
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await database.close();
});

describe("GET /api/v1/products", () => {
  it("lists only active products that have active variants, newest first", async () => {
    const body = await list();
    expect(body.data.map((product) => product.slug)).toEqual(demoProducts.map((product) => product.slug));
    expect(body.pageInfo).toEqual({ limit: 24, hasNextPage: false, nextCursor: null });
  });

  it("returns prices in centavos, demo flag, references and primary media", async () => {
    const { data } = await list("?q=Eclipse");
    expect(data).toHaveLength(1);
    const [product] = data;
    expect(product).toMatchObject({
      slug: "eclipse-serpent-heavy-tee",
      isDemo: true,
      category: { slug: "camisetas" },
      collections: [{ slug: "ritual-collection" }],
      priceRange: { min: { amountMinor: 13990, currencyCode: "BRL" }, max: { amountMinor: 13990, currencyCode: "BRL" } },
      primaryMedia: { url: "/images/product-serpent.png", width: 1254, height: 1254 },
    });
    expect(product?.variants.map((variant) => variant.size)).toEqual(["P", "M", "G", "GG", "XG"]);
    expect(product?.variants[0]?.compareAtPrice).toEqual({ amountMinor: 15990, currencyCode: "BRL" });
    expect(JSON.stringify(product)).not.toMatch(/onHand|reserved/);
  });

  it("hides archived collections from product references", async () => {
    const { data } = await list("?q=Nocturne");
    expect(data[0]?.collections.map((collection) => collection.slug)).toEqual(["nocturne-series"]);
  });

  it.each(["newest", "price_asc", "price_desc", "name_asc"])("paginates %s with a stable cursor", async (sort) => {
    const unpaginated = (await list(`?sort=${sort}`)).data.map((product) => product.slug);
    for (const limit of [1, 2, 4]) {
      expect(await listAllPages(`sort=${sort}`, limit)).toEqual(unpaginated);
    }
  });

  it("orders by price and name", async () => {
    const asc = (await list("?sort=price_asc")).data.map((product) => product.priceRange.min.amountMinor);
    expect(asc).toEqual([...asc].sort((a, b) => a - b));
    const desc = (await list("?sort=price_desc")).data.map((product) => product.priceRange.min.amountMinor);
    expect(desc).toEqual([...desc].sort((a, b) => b - a));
    expect((await list("?sort=name_asc")).data[0]?.slug).toBe("black-signal-essential");
  });

  it("rejects a cursor from another sort order", async () => {
    const first = await list("?sort=newest&limit=1");
    const res = await app.inject({ method: "GET", url: `/api/v1/products?sort=price_asc&cursor=${first.pageInfo.nextCursor}` });
    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorResponse>().error.details?.[0]?.code).toBe("invalid_cursor");
  });

  it("filters by text, collection, category, size, price and stock", async () => {
    const slugs = async (query: string) => (await list(query)).data.map((product) => product.slug).sort();

    expect(await slugs("?q=serpente")).toEqual(["eclipse-serpent-heavy-tee"]);
    expect(await slugs("?q=ONDA%20SONORA")).toEqual(["moon-static-washed-tee", "static-star-essential"]);
    expect(await slugs("?collection=noise-division")).toEqual(["moon-static-washed-tee", "static-star-essential"]);
    expect(await slugs("?collection=colecao-arquivada")).toEqual([]);
    expect(await slugs("?category=camisetas")).toHaveLength(6);
    expect(await slugs("?size=XG")).toEqual(["eclipse-serpent-heavy-tee", "moon-static-washed-tee"]);
    // Moon Static has an XG variant, but it has no stock.
    expect(await slugs("?size=XG&inStock=true")).toEqual(["eclipse-serpent-heavy-tee"]);
    expect(await slugs("?priceMin=12990&priceMax=13990")).toEqual([
      "eclipse-serpent-heavy-tee",
      "moon-static-washed-tee",
      "nocturne-wings-oversized",
    ]);
  });

  it("treats search input literally (wildcards and quotes)", async () => {
    for (const q of ["%", "_", "'; DROP TABLE products; --", "\\", "\"unterminated"]) {
      const res = await app.inject({ method: "GET", url: `/api/v1/products?q=${encodeURIComponent(q)}` });
      expect(res.statusCode, q).toBe(200);
      expect(res.json<ListBody>().data, q).toEqual([]);
    }
  });

  it("reflects reserved stock in public availability", async () => {
    const [variant] = await db.select().from(productVariants).where(eq(productVariants.sku, demoSku("black-signal-essential", "P")));
    const before = (await list("?q=Black%20Signal")).data[0]?.variants.find((item) => item.size === "P");
    expect(before?.availability).toBe("in_stock");

    await db.update(inventoryLevels).set({ reserved: 7 }).where(eq(inventoryLevels.variantId, variant!.id)); // 9 on hand → 2 left
    expect((await list("?q=Black%20Signal")).data[0]?.variants.find((item) => item.size === "P")?.availability).toBe("low_stock");

    await db.update(inventoryLevels).set({ reserved: 9 }).where(eq(inventoryLevels.variantId, variant!.id));
    expect((await list("?q=Black%20Signal")).data[0]?.variants.find((item) => item.size === "P")?.availability).toBe("out_of_stock");

    await db.update(inventoryLevels).set({ reserved: 0 }).where(eq(inventoryLevels.variantId, variant!.id));
  });

  it("sets a short public cache", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/products" });
    expect(res.headers["cache-control"]).toBe("public, max-age=60, stale-while-revalidate=300");
  });
});

describe("GET /api/v1/products/:slug", () => {
  it("returns the full product detail", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/products/moon-static-washed-tee" });
    expect(res.statusCode).toBe(200);
    const product = res.json<ProductDetail>();
    expect(product).toMatchObject({
      slug: "moon-static-washed-tee",
      description: expect.stringContaining("demonstrativo") as unknown,
      availability: "low_stock",
      seo: { title: "Moon Static Washed Tee", description: null },
      media: [{ url: "/images/products/moon-static.png", alt: expect.any(String) as unknown }],
    });
    expect(new Date(product.publishedAt).toISOString()).toBe(product.publishedAt);
    expect(product.variants.find((variant) => variant.size === "P")?.availability).toBe("out_of_stock");
  });

  it("matches slugs case-insensitively in storage but only accepts lowercase input", async () => {
    expect((await app.inject({ method: "GET", url: "/api/v1/products/MOON-STATIC-WASHED-TEE" })).statusCode).toBe(400);
  });

  it.each(["rascunho-secreto", "sem-variantes", "nao-existe"])("returns 404 for %s", async (slug) => {
    const res = await app.inject({ method: "GET", url: `/api/v1/products/${slug}` });
    expect(res.statusCode).toBe(404);
    expect(res.json<ErrorResponse>().error).toMatchObject({ code: "NOT_FOUND", message: "Produto não encontrado." });
  });
});

describe("collections and categories", () => {
  it("lists published collections in position order with pagination", async () => {
    const first = await app.inject({ method: "GET", url: "/api/v1/collections?limit=2" });
    const page1 = first.json<{ data: Collection[]; pageInfo: PageInfo }>();
    expect(page1.data.map((collection) => collection.slug)).toEqual(["nocturne-series", "ritual-collection"]);
    expect(page1.pageInfo.hasNextPage).toBe(true);

    const second = await app.inject({ method: "GET", url: `/api/v1/collections?limit=2&cursor=${page1.pageInfo.nextCursor}` });
    const page2 = second.json<{ data: Collection[]; pageInfo: PageInfo }>();
    expect(page2.data.map((collection) => collection.slug)).toEqual(["noise-division"]);
    expect(page2.pageInfo).toEqual({ limit: 2, hasNextPage: false, nextCursor: null });
  });

  it("returns a published collection and hides archived ones", async () => {
    const ok = await app.inject({ method: "GET", url: "/api/v1/collections/ritual-collection" });
    expect(ok.json<Collection>()).toMatchObject({ slug: "ritual-collection", title: "Ritual Collection", heroMedia: null });
    expect((await app.inject({ method: "GET", url: "/api/v1/collections/colecao-arquivada" })).statusCode).toBe(404);
  });

  it("lists active categories", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/categories" });
    expect(res.json()).toEqual({
      data: [expect.objectContaining({ slug: "camisetas", name: "Camisetas", parentId: null }) as unknown],
    });
  });
});

describe("demo seed", () => {
  it("is idempotent and never overwrites real products or existing stock", async () => {
    const [variant] = await db.select().from(productVariants).where(eq(productVariants.sku, demoSku("iron-bloom-heavy-tee", "M")));
    await db.update(inventoryLevels).set({ onHand: 42 }).where(eq(inventoryLevels.variantId, variant!.id));
    await db.update(products).set({ isDemo: false, name: "Iron Bloom (real)" }).where(eq(products.slug, "iron-bloom-heavy-tee"));

    const result = await seedDemoCatalog(db);
    expect(result).toEqual({ products: 5, skippedRealProducts: ["iron-bloom-heavy-tee"], stockInitialised: 0 });

    const [real] = await db.select().from(products).where(eq(products.slug, "iron-bloom-heavy-tee"));
    expect(real?.name).toBe("Iron Bloom (real)");
    const [stock] = await db.select().from(inventoryLevels).where(eq(inventoryLevels.variantId, variant!.id));
    expect(stock?.onHand).toBe(42);

    await db.update(products).set({ isDemo: true, name: "Iron Bloom Heavy Tee" }).where(eq(products.slug, "iron-bloom-heavy-tee"));
  });

  it("enforces catalog invariants in the database", async () => {
    const [product] = await db.select().from(products).where(eq(products.slug, "black-signal-essential"));
    await expect(
      db.insert(productVariants).values({ productId: product!.id, sku: "TEST-BAD-PRICE", size: "XXG", priceMinor: 100, compareAtPriceMinor: 90 }),
    ).rejects.toThrow();
    await expect(
      db.insert(productVariants).values({ productId: product!.id, sku: "TEST-DUP-SIZE", size: "P", priceMinor: 100 }),
    ).rejects.toThrow();
    await expect(db.insert(products).values({ slug: "Bad Slug", name: "x" })).rejects.toThrow();
    await expect(db.insert(products).values({ slug: "ativo-sem-data", name: "x", status: "active" })).rejects.toThrow();
  });
});
