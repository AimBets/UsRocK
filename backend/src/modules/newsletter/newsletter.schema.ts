import { relations } from "drizzle-orm";
import { index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { citext, timestamps } from "../../db/columns.js";
import { users } from "../accounts/accounts.schema.js";

export const newsletterStatus = pgEnum("newsletter_status", ["pending", "confirmed", "unsubscribed"]);
export const newsletterEventType = pgEnum("newsletter_event_type", ["subscribe_requested", "confirmed", "unsubscribed"]);

/**
 * Double opt-in newsletter list. Only `confirmed` addresses may receive marketing email.
 * Confirmation and unsubscribe secrets are stored as SHA-256 digests only.
 */
export const newsletterSubscriptions = pgTable("newsletter_subscriptions", {
  id: uuid().primaryKey().defaultRandom(),
  email: citext().notNull().unique(),
  status: newsletterStatus().notNull().default("pending"),
  /** Linked when an account with the same email exists at confirmation time. */
  userId: uuid().references(() => users.id, { onDelete: "set null" }),
  confirmTokenHash: text().unique("newsletter_confirm_token_hash_unique"),
  confirmExpiresAt: timestamp({ withTimezone: true }),
  unsubscribeTokenHash: text().notNull().unique("newsletter_unsubscribe_token_hash_unique"),
  /** Version of the privacy text accepted with the latest subscription request. */
  policyVersion: text().notNull(),
  source: text().notNull(),
  confirmationSentAt: timestamp({ withTimezone: true }),
  confirmedAt: timestamp({ withTimezone: true }),
  unsubscribedAt: timestamp({ withTimezone: true }),
  ...timestamps,
});

/** Append-only consent trail for the list (LGPD): no IP address or user agent is stored. */
export const newsletterEvents = pgTable(
  "newsletter_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    subscriptionId: uuid()
      .notNull()
      .references(() => newsletterSubscriptions.id, { onDelete: "cascade" }),
    event: newsletterEventType().notNull(),
    policyVersion: text().notNull(),
    source: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("newsletter_events_subscription_idx").on(table.subscriptionId, table.createdAt)],
);

export const newsletterSubscriptionsRelations = relations(newsletterSubscriptions, ({ one, many }) => ({
  user: one(users, { fields: [newsletterSubscriptions.userId], references: [users.id] }),
  events: many(newsletterEvents),
}));

export const newsletterEventsRelations = relations(newsletterEvents, ({ one }) => ({
  subscription: one(newsletterSubscriptions, { fields: [newsletterEvents.subscriptionId], references: [newsletterSubscriptions.id] }),
}));
