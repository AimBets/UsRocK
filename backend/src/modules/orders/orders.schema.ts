import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSequence,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { timestamps } from "../../db/columns.js";
import { users } from "../accounts/accounts.schema.js";
import { carts } from "../cart/cart.schema.js";
import { productVariants } from "../catalog/catalog.schema.js";
import { coupons } from "../marketing/marketing.schema.js";

export const orderStatuses = [
  "pending_payment",
  "paid",
  "in_fulfillment",
  "shipped",
  "delivered",
  "cancelled",
  "expired",
  "refunded",
] as const;
export type OrderStatus = (typeof orderStatuses)[number];

export const orderStatus = pgEnum("order_status", orderStatuses);
export const orderActor = pgEnum("order_actor", ["customer", "system", "payment_provider", "shipping_provider", "admin"]);
export const reservationStatus = pgEnum("stock_reservation_status", ["active", "consumed", "released"]);
export const redemptionStatus = pgEnum("coupon_redemption_status", ["active", "released"]);

/** Human-friendly order number: UR001001, UR001002, ... */
export const orderNumberSeq = pgSequence("order_number_seq", { startWith: 1001, increment: 1 });

/** Snapshot types stored as jsonb (validated by the service before writing). */
export interface ShippingAddressSnapshot {
  recipientName: string;
  recipientDocument: string;
  recipientPhone: string;
  postalCode: string;
  street: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  state: string;
}

export interface QuoteOptionSnapshot {
  serviceId: string;
  name: string;
  carrier: string;
  priceMinor: number;
  deliveryDaysMin: number;
  deliveryDaysMax: number;
}

/**
 * Freight quote for the current cart contents and destination. The checkout accepts only a
 * quote id + service id: the price always comes from this row, never from the client. The
 * fingerprint ties the quote to the exact cart lines it was computed for.
 */
export const shippingQuotes = pgTable(
  "shipping_quotes",
  {
    id: uuid().primaryKey().defaultRandom(),
    cartId: uuid()
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    provider: text().notNull(),
    postalCode: text().notNull(),
    cartFingerprint: text().notNull(),
    options: jsonb().$type<QuoteOptionSnapshot[]>().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("shipping_quotes_postal_code_format", sql`${table.postalCode} ~ '^[0-9]{8}$'`),
    index("shipping_quotes_cart_idx").on(table.cartId, table.createdAt),
  ],
);

export const orders = pgTable(
  "orders",
  {
    id: uuid().primaryKey().defaultRandom(),
    number: text()
      .notNull()
      .unique("orders_number_unique")
      .default(sql`('UR' || lpad(nextval('order_number_seq')::text, 6, '0'))`),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: orderStatus().notNull().default("pending_payment"),
    customerName: text().notNull(),
    customerEmail: text().notNull(),
    shippingAddress: jsonb().$type<ShippingAddressSnapshot>().notNull(),
    shippingProvider: text().notNull(),
    shippingServiceId: text().notNull(),
    shippingServiceName: text().notNull(),
    shippingCarrier: text().notNull(),
    shippingDeliveryDaysMin: integer().notNull(),
    shippingDeliveryDaysMax: integer().notNull(),
    couponId: uuid().references(() => coupons.id, { onDelete: "set null" }),
    couponCode: text(),
    subtotalMinor: integer().notNull(),
    discountMinor: integer().notNull(),
    shippingMinor: integer().notNull(),
    totalMinor: integer().notNull(),
    currencyCode: text().notNull().default("BRL"),
    /** True when any item came from the demonstration catalog. */
    isDemo: boolean().notNull().default(false),
    /** Stock is held until this moment while the order waits for payment. */
    reservationExpiresAt: timestamp({ withTimezone: true }).notNull(),
    paidAt: timestamp({ withTimezone: true }),
    cancelledAt: timestamp({ withTimezone: true }),
    /** Set when an operator must act (amount mismatch, payment after expiry without stock, chargeback). */
    attentionReason: text(),
    ...timestamps,
  },
  (table) => [
    check(
      "orders_amounts",
      sql`${table.subtotalMinor} >= 0 AND ${table.discountMinor} >= 0 AND ${table.shippingMinor} >= 0
        AND ${table.discountMinor} <= ${table.subtotalMinor}
        AND ${table.totalMinor} = ${table.subtotalMinor} - ${table.discountMinor} + ${table.shippingMinor}`,
    ),
    check("orders_currency", sql`${table.currencyCode} = 'BRL'`),
    index("orders_user_idx").on(table.userId, table.createdAt),
    index("orders_status_idx").on(table.status, table.createdAt),
    index("orders_pending_expiry_idx").on(table.reservationExpiresAt).where(sql`${table.status} = 'pending_payment'`),
  ],
);

/** Immutable copy of each line at purchase time. */
export const orderItems = pgTable(
  "order_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    variantId: uuid()
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    productId: uuid().notNull(),
    productSlug: text().notNull(),
    productName: text().notNull(),
    sku: text().notNull(),
    size: text().notNull(),
    color: text(),
    imageUrl: text(),
    imageAlt: text(),
    unitPriceMinor: integer().notNull(),
    compareAtUnitPriceMinor: integer(),
    quantity: integer().notNull(),
    lineTotalMinor: integer().notNull(),
    isDemo: boolean().notNull().default(false),
  },
  (table) => [
    check("order_items_quantity_positive", sql`${table.quantity} > 0`),
    check("order_items_line_total", sql`${table.lineTotalMinor} = ${table.unitPriceMinor} * ${table.quantity}`),
    index("order_items_order_idx").on(table.orderId),
  ],
);

/** Append-only status trail (who changed what and when). */
export const orderStatusHistory = pgTable(
  "order_status_history",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    fromStatus: orderStatus(),
    toStatus: orderStatus().notNull(),
    actor: orderActor().notNull(),
    actorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    note: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("order_status_history_order_idx").on(table.orderId, table.createdAt)],
);

/**
 * Stock held by a pending order. Creating one increments `inventory_levels.reserved` in the same
 * transaction; payment consumes it (on hand and reserved both decrease) and expiry or
 * cancellation releases it.
 */
export const stockReservations = pgTable(
  "stock_reservations",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    variantId: uuid()
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    quantity: integer().notNull(),
    status: reservationStatus().notNull().default("active"),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    resolvedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("stock_reservations_quantity_positive", sql`${table.quantity} > 0`),
    unique("stock_reservations_order_variant_unique").on(table.orderId, table.variantId),
    index("stock_reservations_active_idx").on(table.status, table.expiresAt),
  ],
);

/** One per order that used a coupon. `released` when the order expires or is cancelled unpaid. */
export const couponRedemptions = pgTable(
  "coupon_redemptions",
  {
    id: uuid().primaryKey().defaultRandom(),
    couponId: uuid()
      .notNull()
      .references(() => coupons.id, { onDelete: "restrict" }),
    orderId: uuid()
      .notNull()
      .unique("coupon_redemptions_order_unique")
      .references(() => orders.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    discountMinor: integer().notNull(),
    status: redemptionStatus().notNull().default("active"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("coupon_redemptions_coupon_user_idx").on(table.couponId, table.userId, table.status)],
);

/**
 * Idempotency for POST /checkouts. The same key with the same request replays the stored
 * response; with a different request it is refused.
 */
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scope: text().notNull(),
    key: text().notNull(),
    requestHash: text().notNull(),
    status: text().$type<"processing" | "completed">().notNull().default("processing"),
    responseStatus: integer(),
    responseBody: jsonb(),
    orderId: uuid().references(() => orders.id, { onDelete: "set null" }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idempotency_keys_user_scope_key_unique").on(table.userId, table.scope, table.key),
    index("idempotency_keys_expires_idx").on(table.expiresAt),
  ],
);

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  items: many(orderItems),
  history: many(orderStatusHistory),
  reservations: many(stockReservations),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
}));

export const orderStatusHistoryRelations = relations(orderStatusHistory, ({ one }) => ({
  order: one(orders, { fields: [orderStatusHistory.orderId], references: [orders.id] }),
}));

export const stockReservationsRelations = relations(stockReservations, ({ one }) => ({
  order: one(orders, { fields: [stockReservations.orderId], references: [orders.id] }),
}));
