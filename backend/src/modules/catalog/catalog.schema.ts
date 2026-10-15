import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { citext, SLUG_PATTERN_SQL, timestamps, tsvector } from "../../db/columns.js";

export const productStatus = pgEnum("product_status", ["draft", "active", "archived"]);
export const collectionStatus = pgEnum("collection_status", ["draft", "published", "archived"]);
/** Merchandising hint for the storefront card background; purely presentational. */
export const productTone = pgEnum("product_tone", ["black", "graphite", "bone"]);
export const inventoryMovementReason = pgEnum("inventory_movement_reason", [
  "initial",
  "adjustment",
  "sale",
  "return",
  "correction",
]);

export const categories = pgTable(
  "categories",
  {
    id: uuid().primaryKey().defaultRandom(),
    slug: citext().notNull().unique(),
    name: text().notNull(),
    description: text(),
    parentId: uuid().references((): AnyPgColumn => categories.id, { onDelete: "set null" }),
    position: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (table) => [
    check("categories_slug_format", sql`${table.slug} ~ ${sql.raw(`'${SLUG_PATTERN_SQL}'`)}`),
    check("categories_not_own_parent", sql`${table.parentId} IS NULL OR ${table.parentId} <> ${table.id}`),
  ],
);

export const collections = pgTable(
  "collections",
  {
    id: uuid().primaryKey().defaultRandom(),
    slug: citext().notNull().unique(),
    title: text().notNull(),
    description: text(),
    status: collectionStatus().notNull().default("draft"),
    heroMediaUrl: text(),
    heroMediaAlt: text(),
    position: integer().notNull().default(0),
    publishedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    check("collections_slug_format", sql`${table.slug} ~ ${sql.raw(`'${SLUG_PATTERN_SQL}'`)}`),
    check("collections_published_has_date", sql`${table.status} <> 'published' OR ${table.publishedAt} IS NOT NULL`),
    check("collections_hero_has_alt", sql`${table.heroMediaUrl} IS NULL OR length(trim(${table.heroMediaAlt})) > 0`),
    index("collections_status_position_idx").on(table.status, table.position, table.id),
  ],
);

export const products = pgTable(
  "products",
  {
    id: uuid().primaryKey().defaultRandom(),
    slug: citext().notNull().unique(),
    name: text().notNull(),
    description: text().notNull().default(""),
    status: productStatus().notNull().default("draft"),
    categoryId: uuid().references(() => categories.id, { onDelete: "set null" }),
    label: text(),
    tone: productTone(),
    /** Demonstration content (seed). Never real commercial data. */
    isDemo: boolean().notNull().default(false),
    seoTitle: text(),
    seoDescription: text(),
    publishedAt: timestamp({ withTimezone: true }),
    searchVector: tsvector().generatedAlwaysAs(
      sql`to_tsvector('portuguese'::regconfig, coalesce(name, '') || ' ' || coalesce(description, ''))`,
    ),
    ...timestamps,
  },
  (table) => [
    check("products_slug_format", sql`${table.slug} ~ ${sql.raw(`'${SLUG_PATTERN_SQL}'`)}`),
    check("products_active_has_date", sql`${table.status} <> 'active' OR ${table.publishedAt} IS NOT NULL`),
    check("products_name_length", sql`length(${table.name}) BETWEEN 1 AND 200`),
    check("products_label_length", sql`${table.label} IS NULL OR length(${table.label}) <= 40`),
    index("products_listing_idx").on(table.status, table.publishedAt, table.id),
    index("products_category_idx").on(table.categoryId),
    index("products_search_idx").using("gin", table.searchVector),
  ],
);

export const productCollections = pgTable(
  "product_collections",
  {
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    collectionId: uuid()
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    position: integer().notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.productId, table.collectionId] }),
    index("product_collections_collection_idx").on(table.collectionId, table.position),
  ],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sku: citext().notNull().unique(),
    size: text().notNull(),
    color: text(),
    /** Price in centavos. */
    priceMinor: integer().notNull(),
    /** Previous price in centavos, shown struck through; must be higher than the price. */
    compareAtPriceMinor: integer(),
    position: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    /** Packed shipping weight and dimensions (E5). Null: the store default per item is used. */
    weightGrams: integer(),
    heightCm: integer(),
    widthCm: integer(),
    lengthCm: integer(),
    ...timestamps,
  },
  (table) => [
    check(
      "product_variants_shipping_positive",
      sql`(${table.weightGrams} IS NULL OR ${table.weightGrams} > 0) AND (${table.heightCm} IS NULL OR ${table.heightCm} > 0)
        AND (${table.widthCm} IS NULL OR ${table.widthCm} > 0) AND (${table.lengthCm} IS NULL OR ${table.lengthCm} > 0)`,
    ),
    check("product_variants_price_non_negative", sql`${table.priceMinor} >= 0`),
    check(
      "product_variants_compare_at_above_price",
      sql`${table.compareAtPriceMinor} IS NULL OR ${table.compareAtPriceMinor} > ${table.priceMinor}`,
    ),
    unique("product_variants_options_unique").on(table.productId, table.size, table.color).nullsNotDistinct(),
    index("product_variants_product_idx").on(table.productId, table.position),
  ],
);

export const productMedia = pgTable(
  "product_media",
  {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    /** Site-relative path (`/images/...`) or absolute https URL. */
    url: text().notNull(),
    alt: text().notNull(),
    width: integer(),
    height: integer(),
    position: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("product_media_url_safe", sql`${table.url} ~ '^(/[^/]|https://)'`),
    check("product_media_alt_present", sql`length(trim(${table.alt})) > 0`),
    check("product_media_dimensions_positive", sql`(${table.width} IS NULL OR ${table.width} > 0) AND (${table.height} IS NULL OR ${table.height} > 0)`),
    index("product_media_product_idx").on(table.productId, table.position),
  ],
);

/** Current stock per variant. `reserved` is held by checkouts in progress (E5). */
export const inventoryLevels = pgTable(
  "inventory_levels",
  {
    variantId: uuid()
      .primaryKey()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    onHand: integer().notNull().default(0),
    reserved: integer().notNull().default(0),
    lowStockThreshold: integer().notNull().default(3),
    updatedAt: timestamps.updatedAt,
  },
  (table) => [
    check("inventory_levels_on_hand_non_negative", sql`${table.onHand} >= 0`),
    check("inventory_levels_reserved_range", sql`${table.reserved} >= 0 AND ${table.reserved} <= ${table.onHand}`),
    check("inventory_levels_threshold_non_negative", sql`${table.lowStockThreshold} >= 0`),
  ],
);

/** Append-only stock history. Variants with history cannot be deleted (archive the product instead). */
export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: uuid().primaryKey().defaultRandom(),
    variantId: uuid()
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    delta: integer().notNull(),
    reason: inventoryMovementReason().notNull(),
    note: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("inventory_movements_delta_non_zero", sql`${table.delta} <> 0`),
    index("inventory_movements_variant_idx").on(table.variantId, table.createdAt),
  ],
);

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, { fields: [categories.parentId], references: [categories.id], relationName: "category_parent" }),
  children: many(categories, { relationName: "category_parent" }),
  products: many(products),
}));

export const collectionsRelations = relations(collections, ({ many }) => ({
  products: many(productCollections),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  collections: many(productCollections),
  variants: many(productVariants),
  media: many(productMedia),
}));

export const productCollectionsRelations = relations(productCollections, ({ one }) => ({
  product: one(products, { fields: [productCollections.productId], references: [products.id] }),
  collection: one(collections, { fields: [productCollections.collectionId], references: [collections.id] }),
}));

export const productVariantsRelations = relations(productVariants, ({ one, many }) => ({
  product: one(products, { fields: [productVariants.productId], references: [products.id] }),
  inventory: one(inventoryLevels, { fields: [productVariants.id], references: [inventoryLevels.variantId] }),
  movements: many(inventoryMovements),
}));

export const productMediaRelations = relations(productMedia, ({ one }) => ({
  product: one(products, { fields: [productMedia.productId], references: [products.id] }),
}));

export const inventoryLevelsRelations = relations(inventoryLevels, ({ one }) => ({
  variant: one(productVariants, { fields: [inventoryLevels.variantId], references: [productVariants.id] }),
}));

export const inventoryMovementsRelations = relations(inventoryMovements, ({ one }) => ({
  variant: one(productVariants, { fields: [inventoryMovements.variantId], references: [productVariants.id] }),
}));
