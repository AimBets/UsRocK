import { relations, sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "../../db/columns.js";
import { orders } from "../orders/orders.schema.js";

/**
 * Payment attempts. A Checkout Pro preference is created per attempt; when the provider reports a
 * payment for it, `provider_payment_id` is filled. Status values are the provider's own
 * (`pending`, `approved`, `rejected`, ...) and are only ever written from the provider API,
 * never from data sent by the browser.
 */
export const payments = pgTable(
  "payments",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    provider: text().notNull(),
    /** sandbox | production */
    environment: text().notNull(),
    providerPreferenceId: text(),
    providerPaymentId: text(),
    checkoutUrl: text(),
    status: text().notNull().default("created"),
    statusDetail: text(),
    amountMinor: integer().notNull(),
    liveMode: boolean(),
    approvedAt: timestamp({ withTimezone: true }),
    lastSyncedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    check("payments_amount_non_negative", sql`${table.amountMinor} >= 0`),
    uniqueIndex("payments_provider_payment_unique").on(table.provider, table.providerPaymentId),
    index("payments_order_idx").on(table.orderId, table.createdAt),
  ],
);

/**
 * Every provider notification received, deduplicated by the provider's event identity. The
 * payload is not stored (it may carry personal data); only identifiers needed for processing.
 */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    provider: text().notNull(),
    eventKey: text().notNull(),
    topic: text().notNull(),
    resourceId: text(),
    status: text().$type<"received" | "processed" | "ignored" | "failed">().notNull().default("received"),
    attempts: integer().notNull().default(0),
    lastError: text(),
    receivedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp({ withTimezone: true }),
  },
  (table) => [uniqueIndex("webhook_events_provider_key_unique").on(table.provider, table.eventKey)],
);

export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, { fields: [payments.orderId], references: [orders.id] }),
}));
