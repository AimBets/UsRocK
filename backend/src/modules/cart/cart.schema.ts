import { relations, sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "../../db/columns.js";
import { users } from "../accounts/accounts.schema.js";
import { productVariants } from "../catalog/catalog.schema.js";
import { coupons } from "../marketing/marketing.schema.js";

/** Business limits shared by validation, services and database checks. */
export const MAX_ITEM_QUANTITY = 10;
export const MAX_CART_LINES = 50;

/**
 * A cart belongs either to a customer (one per account) or to a guest identified by an opaque
 * httpOnly cookie, of which only the SHA-256 is stored. Guest carts expire; the guest cart is
 * merged into the account cart on the first cart request after sign-in.
 */
export const carts = pgTable(
  "carts",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .unique("carts_user_unique")
      .references(() => users.id, { onDelete: "cascade" }),
    guestTokenHash: text().unique("carts_guest_token_hash_unique"),
    couponId: uuid().references(() => coupons.id, { onDelete: "set null" }),
    /** Guest carts only; refreshed on every change. */
    expiresAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    check(
      "carts_single_owner",
      sql`(${table.userId} IS NOT NULL AND ${table.guestTokenHash} IS NULL AND ${table.expiresAt} IS NULL)
        OR (${table.userId} IS NULL AND ${table.guestTokenHash} IS NOT NULL AND ${table.expiresAt} IS NOT NULL)`,
    ),
    index("carts_expires_idx").on(table.expiresAt),
  ],
);

export const cartItems = pgTable(
  "cart_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    cartId: uuid()
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    variantId: uuid()
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    quantity: integer().notNull(),
    /** Unit price (centavos) when the line was last changed; used to flag price changes. */
    unitPriceMinorSnapshot: integer().notNull(),
    ...timestamps,
  },
  (table) => [
    check("cart_items_quantity_range", sql`${table.quantity} BETWEEN 1 AND ${sql.raw(String(MAX_ITEM_QUANTITY))}`),
    check("cart_items_snapshot_non_negative", sql`${table.unitPriceMinorSnapshot} >= 0`),
    unique("cart_items_cart_variant_unique").on(table.cartId, table.variantId),
    index("cart_items_variant_idx").on(table.variantId),
  ],
);

export const cartsRelations = relations(carts, ({ one, many }) => ({
  user: one(users, { fields: [carts.userId], references: [users.id] }),
  coupon: one(coupons, { fields: [carts.couponId], references: [coupons.id] }),
  items: many(cartItems),
}));

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  cart: one(carts, { fields: [cartItems.cartId], references: [carts.id] }),
  variant: one(productVariants, { fields: [cartItems.variantId], references: [productVariants.id] }),
}));
