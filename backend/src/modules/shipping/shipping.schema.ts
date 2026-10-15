import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "../../db/columns.js";
import { orders } from "../orders/orders.schema.js";

/**
 * Shipping label lifecycle with the carrier platform (SuperFrete). Statuses follow the provider:
 * `pending` (label in the SuperFrete cart, not paid), `released` (paid, printable),
 * `posted`, `delivered`, `cancelled`.
 */
export const shipments = pgTable(
  "shipments",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    provider: text().notNull(),
    serviceId: text().notNull(),
    providerOrderId: text(),
    status: text().notNull().default("pending"),
    trackingCode: text(),
    labelUrl: text(),
    postedAt: timestamp({ withTimezone: true }),
    deliveredAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("shipments_provider_order_unique").on(table.provider, table.providerOrderId),
    index("shipments_order_idx").on(table.orderId),
  ],
);

export const shipmentsRelations = relations(shipments, ({ one }) => ({
  order: one(orders, { fields: [shipments.orderId], references: [orders.id] }),
}));
