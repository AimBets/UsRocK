import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "../../db/columns.js";
import { orders } from "../orders/orders.schema.js";

export const notificationChannel = pgEnum("notification_channel", ["email", "whatsapp"]);
export const notificationStatus = pgEnum("notification_status", ["pending", "sent", "failed", "skipped"]);

export const notificationTemplates = ["order_received", "order_paid", "order_status_changed"] as const;
export type NotificationTemplate = (typeof notificationTemplates)[number];

/**
 * Transactional outbox: rows are written in the same transaction as the business change and sent
 * later by the dispatcher, with retries. The message is rendered at send time from the order, so
 * only identifiers and the recipient are stored.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid().primaryKey().defaultRandom(),
    channel: notificationChannel().notNull(),
    template: text().$type<NotificationTemplate>().notNull(),
    orderId: uuid().references(() => orders.id, { onDelete: "cascade" }),
    recipient: text().notNull(),
    data: jsonb().$type<Record<string, string>>().notNull().default({}),
    /** Prevents the same notification from being queued twice (e.g. duplicated webhooks). */
    dedupeKey: text().notNull(),
    status: notificationStatus().notNull().default("pending"),
    attempts: integer().notNull().default(0),
    nextAttemptAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastError: text(),
    sentAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    check("notifications_attempts_non_negative", sql`${table.attempts} >= 0`),
    uniqueIndex("notifications_dedupe_unique").on(table.dedupeKey),
    index("notifications_pending_idx").on(table.status, table.nextAttemptAt),
  ],
);
