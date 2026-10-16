import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { userRole } from "../accounts/accounts.schema.js";

/** `{ field: { from, to } }` for the fields an operation changed (sensitive values redacted). */
export type AuditChanges = Record<string, { from: unknown; to: unknown }>;

/**
 * Append-only trail of administrative operations (E6). Rows are written in the same transaction
 * as the change they describe. UPDATE and DELETE are rejected by a database trigger (migration
 * 0005_admin), so not even the application can rewrite history.
 *
 * `actor_user_id` deliberately has no foreign key: the trail must outlive the account, and an
 * `ON DELETE SET NULL` would be an UPDATE blocked by the trigger. Personal data of the actor is
 * not copied here; the name is joined from `users` while the account exists.
 */
export const adminAuditLogs = pgTable(
  "admin_audit_logs",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Millisecond precision, matching the ISO timestamps in pagination cursors (keyset uses the index). */
    occurredAt: timestamp({ withTimezone: true, precision: 3 }).notNull().defaultNow(),
    actorUserId: uuid(),
    /** Roles the actor held when acting (they may change later). */
    actorRoles: userRole().array().notNull(),
    /** `<resource>.<verb>`, e.g. `coupon.update`. */
    action: text().notNull(),
    resourceType: text().notNull(),
    resourceId: text().notNull(),
    changes: jsonb().$type<AuditChanges>(),
    metadata: jsonb().$type<Record<string, unknown>>(),
    /** Same value as the X-Request-Id header, to correlate with the structured logs. */
    requestId: text(),
  },
  (table) => [
    check("admin_audit_logs_action_format", sql`${table.action} ~ '^[a-z_]+\\.[a-z_]+$'`),
    check("admin_audit_logs_resource_type_format", sql`${table.resourceType} ~ '^[a-z_]+$'`),
    index("admin_audit_logs_occurred_idx").on(table.occurredAt, table.id),
    index("admin_audit_logs_resource_idx").on(table.resourceType, table.resourceId, table.occurredAt),
    index("admin_audit_logs_actor_idx").on(table.actorUserId, table.occurredAt),
  ],
);
