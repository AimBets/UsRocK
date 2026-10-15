import { relations, sql } from "drizzle-orm";
import { boolean, check, index, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { citext, SLUG_PATTERN_SQL, timestamps } from "../../db/columns.js";
import { collections } from "../catalog/catalog.schema.js";

export const couponDiscountType = pgEnum("coupon_discount_type", ["percentage", "fixed_amount"]);
export const campaignStatus = pgEnum("campaign_status", ["draft", "published", "archived"]);
/** Where the storefront renders the campaign. */
export const campaignPlacement = pgEnum("campaign_placement", ["announcement_bar", "home_hero", "home_panel"]);

/** Uppercase letters, digits, `_` and `-`; 3 to 40 characters. Codes are stored uppercase. */
export const COUPON_CODE_PATTERN_SQL = "^[A-Z0-9][A-Z0-9_-]{2,39}$";

/**
 * Discount codes. Eligibility (dates, minimum subtotal, collection scope, account requirement,
 * usage limit) is always evaluated on the server when the cart is read. `times_redeemed` is
 * incremented only when an order is placed (E5).
 */
export const coupons = pgTable(
  "coupons",
  {
    id: uuid().primaryKey().defaultRandom(),
    code: citext().notNull().unique(),
    /** Public description shown in the cart, e.g. "10% off na Ritual Collection". */
    description: text().notNull(),
    discountType: couponDiscountType().notNull(),
    /** 1–100, only for `percentage`. */
    percentOff: integer(),
    /** Centavos, only for `fixed_amount`. */
    amountOffMinor: integer(),
    /** Optional cap for percentage discounts, in centavos. */
    maxDiscountMinor: integer(),
    /** Cart subtotal required before the coupon applies, in centavos. */
    minSubtotalMinor: integer().notNull().default(0),
    /** When set, only items of this collection are discounted. */
    collectionId: uuid().references(() => collections.id, { onDelete: "restrict" }),
    requiresAccount: boolean().notNull().default(false),
    startsAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp({ withTimezone: true }),
    usageLimit: integer(),
    /** Orders per customer account (E5); null = unlimited. */
    perCustomerLimit: integer(),
    timesRedeemed: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    /** Demonstration content (seed). Never a real commercial offer. */
    isDemo: boolean().notNull().default(false),
    ...timestamps,
  },
  (table) => [
    check("coupons_code_format", sql`${table.code}::text ~ ${sql.raw(`'${COUPON_CODE_PATTERN_SQL}'`)}`),
    check(
      "coupons_discount_shape",
      sql`(${table.discountType} = 'percentage' AND ${table.percentOff} BETWEEN 1 AND 100 AND ${table.amountOffMinor} IS NULL)
        OR (${table.discountType} = 'fixed_amount' AND ${table.amountOffMinor} > 0 AND ${table.percentOff} IS NULL AND ${table.maxDiscountMinor} IS NULL)`,
    ),
    check("coupons_max_discount_positive", sql`${table.maxDiscountMinor} IS NULL OR ${table.maxDiscountMinor} > 0`),
    check("coupons_min_subtotal_non_negative", sql`${table.minSubtotalMinor} >= 0`),
    check("coupons_period", sql`${table.endsAt} IS NULL OR ${table.endsAt} > ${table.startsAt}`),
    check("coupons_usage", sql`${table.timesRedeemed} >= 0 AND (${table.usageLimit} IS NULL OR ${table.usageLimit} > 0)`),
    check("coupons_per_customer_limit_positive", sql`${table.perCustomerLimit} IS NULL OR ${table.perCustomerLimit} > 0`),
    check("coupons_description_length", sql`length(trim(${table.description})) BETWEEN 1 AND 200`),
  ],
);

/** Scheduled storefront campaigns. Only `published` rows inside their period are public. */
export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid().primaryKey().defaultRandom(),
    slug: citext().notNull().unique(),
    placement: campaignPlacement().notNull(),
    status: campaignStatus().notNull().default("draft"),
    title: text().notNull(),
    subtitle: text(),
    ctaLabel: text(),
    /** Site-relative path (`/catalogo`) or absolute https URL. */
    ctaHref: text(),
    mediaUrl: text(),
    mediaAlt: text(),
    collectionId: uuid().references(() => collections.id, { onDelete: "set null" }),
    /** Coupon advertised by the campaign; shown publicly only while the coupon itself is valid. */
    couponId: uuid().references(() => coupons.id, { onDelete: "set null" }),
    /** Higher first. */
    priority: integer().notNull().default(0),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }),
    isDemo: boolean().notNull().default(false),
    ...timestamps,
  },
  (table) => [
    check("campaigns_slug_format", sql`${table.slug} ~ ${sql.raw(`'${SLUG_PATTERN_SQL}'`)}`),
    check("campaigns_period", sql`${table.endsAt} IS NULL OR ${table.endsAt} > ${table.startsAt}`),
    check("campaigns_title_length", sql`length(trim(${table.title})) BETWEEN 1 AND 120`),
    check("campaigns_subtitle_length", sql`${table.subtitle} IS NULL OR length(${table.subtitle}) <= 300`),
    check("campaigns_cta_pair", sql`(${table.ctaLabel} IS NULL) = (${table.ctaHref} IS NULL)`),
    check("campaigns_cta_href_safe", sql`${table.ctaHref} IS NULL OR ${table.ctaHref} ~ '^(/[^/]|/$|https://)'`),
    check("campaigns_media_url_safe", sql`${table.mediaUrl} IS NULL OR ${table.mediaUrl} ~ '^(/[^/]|https://)'`),
    check("campaigns_media_has_alt", sql`${table.mediaUrl} IS NULL OR length(trim(${table.mediaAlt})) > 0`),
    index("campaigns_active_idx").on(table.status, table.placement, table.startsAt),
  ],
);

export const couponsRelations = relations(coupons, ({ one }) => ({
  collection: one(collections, { fields: [coupons.collectionId], references: [collections.id] }),
}));

export const campaignsRelations = relations(campaigns, ({ one }) => ({
  collection: one(collections, { fields: [campaigns.collectionId], references: [collections.id] }),
  coupon: one(coupons, { fields: [campaigns.couponId], references: [coupons.id] }),
}));
