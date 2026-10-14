import { relations, sql } from "drizzle-orm";
import { boolean, check, index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { citext, timestamps } from "../../db/columns.js";
import { roles } from "../auth/auth.types.js";

export const userRole = pgEnum("user_role", roles);
export const userStatus = pgEnum("user_status", ["active", "disabled"]);
export const consentPurpose = pgEnum("consent_purpose", ["terms", "privacy", "marketing_email", "marketing_whatsapp"]);

export const users = pgTable(
  "users",
  {
    id: uuid().primaryKey().defaultRandom(),
    email: citext().notNull().unique(),
    /** Argon2id PHC string. Never returned by the API or written to logs. */
    passwordHash: text().notNull(),
    name: text().notNull(),
    roles: userRole().array().notNull().default(sql`ARRAY['customer']::user_role[]`),
    status: userStatus().notNull().default("active"),
    emailVerifiedAt: timestamp({ withTimezone: true }),
    lastLoginAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    check("users_roles_not_empty", sql`cardinality(${table.roles}) > 0`),
    check("users_name_length", sql`length(${table.name}) BETWEEN 1 AND 120`),
  ],
);

/**
 * Server-side sessions. Only the SHA-256 of the cookie token is stored, so a database leak
 * does not expose usable session cookies.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text().notNull().unique("sessions_token_hash_unique"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),
  },
  (table) => [index("sessions_user_idx").on(table.userId)],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text().notNull().unique("password_reset_tokens_token_hash_unique"),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    usedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("password_reset_tokens_user_idx").on(table.userId)],
);

/** Append-only consent ledger (LGPD): every grant or withdrawal is a new row. */
export const consents = pgTable(
  "consents",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: consentPurpose().notNull(),
    granted: boolean().notNull(),
    policyVersion: text().notNull(),
    source: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("consents_user_purpose_idx").on(table.userId, table.purpose, table.createdAt)],
);

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  consents: many(consents),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const consentsRelations = relations(consents, ({ one }) => ({
  user: one(users, { fields: [consents.userId], references: [users.id] }),
}));
