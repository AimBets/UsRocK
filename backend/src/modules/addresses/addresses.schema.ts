import { relations, sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "../../db/columns.js";
import { users } from "../accounts/accounts.schema.js";

export const MAX_ADDRESSES_PER_USER = 10;

/**
 * Customer delivery addresses (personal data, LGPD). The recipient CPF and phone are required by
 * the carriers to issue a shipping label. Orders keep their own immutable copy, so editing or
 * deleting an address never changes a placed order.
 */
export const addresses = pgTable(
  "addresses",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text(),
    recipientName: text().notNull(),
    /** CPF, 11 digits, validated check digits. */
    recipientDocument: text().notNull(),
    /** Brazilian phone with area code, 10 or 11 digits. */
    recipientPhone: text().notNull(),
    postalCode: text().notNull(),
    street: text().notNull(),
    number: text().notNull(),
    complement: text(),
    district: text().notNull(),
    city: text().notNull(),
    state: text().notNull(),
    isDefault: boolean().notNull().default(false),
    ...timestamps,
  },
  (table) => [
    check("addresses_postal_code_format", sql`${table.postalCode} ~ '^[0-9]{8}$'`),
    check("addresses_document_format", sql`${table.recipientDocument} ~ '^[0-9]{11}$'`),
    check("addresses_phone_format", sql`${table.recipientPhone} ~ '^[0-9]{10,11}$'`),
    check("addresses_state_format", sql`${table.state} ~ '^[A-Z]{2}$'`),
    check("addresses_recipient_length", sql`length(trim(${table.recipientName})) BETWEEN 3 AND 120`),
    index("addresses_user_idx").on(table.userId, table.createdAt),
    uniqueIndex("addresses_one_default_per_user").on(table.userId).where(sql`${table.isDefault}`),
  ],
);

export const addressesRelations = relations(addresses, ({ one }) => ({
  user: one(users, { fields: [addresses.userId], references: [users.id] }),
}));
