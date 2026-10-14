import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  categories,
  collections,
  inventoryLevels,
  inventoryMovements,
  productCollections,
  productMedia,
  products,
  productVariants,
} from "../modules/catalog/catalog.schema.js";
import { createDatabase, type Db } from "./client.js";
import { demoCategory, demoCollections, demoImageSize, demoProducts, demoSku } from "./seed-data/demo-catalog.js";

/** Fixed publication dates keep "newest" ordering deterministic across runs. */
const NEWEST_PUBLISHED_AT = Date.UTC(2026, 9, 1, 12, 0, 0);
const DAY_MS = 86_400_000;

export interface SeedResult {
  products: number;
  skippedRealProducts: string[];
  stockInitialised: number;
}

/**
 * Idempotent demo catalog seed. It only ever updates rows flagged `is_demo`: a real product that
 * happens to share a slug is left untouched, and existing stock levels are never overwritten.
 */
export async function seedDemoCatalog(db: Db): Promise<SeedResult> {
  return db.transaction(async (tx) => {
    const [category] = await tx
      .insert(categories)
      .values({ ...demoCategory, position: 0 })
      .onConflictDoUpdate({ target: categories.slug, set: { name: demoCategory.name, description: demoCategory.description } })
      .returning({ id: categories.id });
    if (!category) throw new Error("category upsert returned no row");

    const collectionIds = new Map<string, string>();
    for (const collection of demoCollections) {
      const [row] = await tx
        .insert(collections)
        .values({ ...collection, status: "published", publishedAt: new Date(NEWEST_PUBLISHED_AT) })
        .onConflictDoUpdate({
          target: collections.slug,
          set: {
            title: collection.title,
            description: collection.description,
            position: collection.position,
            status: "published",
            publishedAt: sql`coalesce(${collections.publishedAt}, now())`,
          },
        })
        .returning({ id: collections.id });
      if (!row) throw new Error(`collection upsert returned no row for ${collection.slug}`);
      collectionIds.set(collection.slug, row.id);
    }

    const result: SeedResult = { products: 0, skippedRealProducts: [], stockInitialised: 0 };

    for (const [index, demo] of demoProducts.entries()) {
      const values = {
        slug: demo.slug,
        name: demo.name,
        description: demo.description,
        status: "active" as const,
        categoryId: category.id,
        label: demo.label,
        tone: demo.tone,
        isDemo: true,
        publishedAt: new Date(NEWEST_PUBLISHED_AT - index * DAY_MS),
      };
      const [product] = await tx
        .insert(products)
        .values(values)
        .onConflictDoUpdate({ target: products.slug, set: values, setWhere: eq(products.isDemo, true) })
        .returning({ id: products.id });
      if (!product) {
        result.skippedRealProducts.push(demo.slug);
        continue;
      }
      result.products += 1;

      const collectionId = collectionIds.get(demo.collection);
      if (!collectionId) throw new Error(`unknown demo collection ${demo.collection}`);
      await tx.delete(productCollections).where(eq(productCollections.productId, product.id));
      await tx.insert(productCollections).values({ productId: product.id, collectionId, position: index });

      await tx.delete(productMedia).where(eq(productMedia.productId, product.id));
      await tx.insert(productMedia).values({ productId: product.id, url: demo.image, alt: demo.imageAlt, ...demoImageSize, position: 0 });

      for (const [position, [size, quantity]] of Object.entries(demo.stock).entries()) {
        const variantValues = {
          productId: product.id,
          sku: demoSku(demo.slug, size),
          size,
          priceMinor: demo.priceMinor,
          compareAtPriceMinor: demo.compareAtPriceMinor ?? null,
          position,
          isActive: true,
        };
        const [variant] = await tx
          .insert(productVariants)
          .values(variantValues)
          .onConflictDoUpdate({ target: productVariants.sku, set: variantValues })
          .returning({ id: productVariants.id });
        if (!variant) throw new Error(`variant upsert returned no row for ${variantValues.sku}`);

        const inserted = await tx
          .insert(inventoryLevels)
          .values({ variantId: variant.id, onHand: quantity })
          .onConflictDoNothing()
          .returning({ variantId: inventoryLevels.variantId });
        if (inserted.length > 0) {
          result.stockInitialised += 1;
          if (quantity > 0) {
            await tx.insert(inventoryMovements).values({
              variantId: variant.id,
              delta: quantity,
              reason: "initial",
              note: "Estoque demonstrativo (seed)",
            });
          }
        }
      }
    }
    return result;
  });
}

const isEntryPoint = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (isEntryPoint) {
  if (existsSync(".env")) process.loadEnvFile(".env");
  if (process.env.NODE_ENV === "production") {
    console.error("Seed demonstrativo recusado: NODE_ENV=production.");
    process.exit(1);
  }
  const url = z.url({ protocol: /^postgres(ql)?$/ }).safeParse(process.env.DATABASE_URL);
  if (!url.success) {
    console.error("DATABASE_URL ausente ou inválida.");
    process.exit(1);
  }
  const database = createDatabase(url.data, { poolMax: 1 });
  seedDemoCatalog(database.db)
    .then((result) => {
      console.log(`Seed demonstrativo aplicado: ${result.products} produtos, ${result.stockInitialised} estoques iniciados.`);
      if (result.skippedRealProducts.length > 0) {
        console.warn(`Ignorados (produto real com o mesmo slug): ${result.skippedRealProducts.join(", ")}`);
      }
    })
    .catch((error: unknown) => {
      console.error("Falha no seed:", error instanceof Error ? error.message : "erro desconhecido");
      process.exitCode = 1;
    })
    .finally(() => void database.close());
}
