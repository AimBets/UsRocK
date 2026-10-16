import { and, desc, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db, DbExecutor } from "../../db/client.js";
import { buildPage, decodeCursor } from "../../shared/pagination.js";
import { users } from "../accounts/accounts.schema.js";
import type { Role } from "../auth/auth.types.js";
import type { AuditAction, AuditLogEntry, AuditLogQuery, AuditResourceType } from "./audit.contracts.js";
import { adminAuditLogs, type AuditChanges } from "./audit.schema.js";

export interface AuditActor {
  userId: string | null;
  roles: readonly Role[];
  requestId: string | null;
}

export interface AuditEntry {
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId: string;
  changes?: AuditChanges | null;
  metadata?: Record<string, unknown> | null;
}

/** The authenticated operator of an admin request (guards guarantee the principal exists). */
export function auditActorFrom(request: FastifyRequest): AuditActor {
  const principal = request.principal;
  if (!principal) throw new Error("audit requires an authenticated principal");
  return { userId: principal.userId, roles: principal.roles, requestId: request.id };
}

// --- Sanitising ------------------------------------------------------------------------------

export const REDACTED = "[redacted]";
/** Keys whose values never reach the trail (credentials and personal data). */
const SENSITIVE_KEY = /password|token|secret|document|cpf|phone|email/i;
/** Bookkeeping columns that change on every write and carry no audit value. */
const IGNORED_KEYS = new Set(["id", "createdAt", "updatedAt", "searchVector"]);
const MAX_STRING_LENGTH = 500;
const MAX_ARRAY_ITEMS = 50;
const MAX_DEPTH = 4;

/** JSON-safe, size-bounded copy of a value with sensitive keys redacted. */
export function sanitizeAuditValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…` : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= MAX_DEPTH) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeAuditValue(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        SENSITIVE_KEY.test(key) ? REDACTED : sanitizeAuditValue(item, depth + 1),
      ]),
    );
  }
  // bigint, symbol, function: not expected in audited records; keep the type only.
  return `[${typeof value}]`;
}

/**
 * Field-level difference between two snapshots of a record. A missing `before` (creation) reports
 * every field as `null → value`. Sensitive fields are reported as changed without their values.
 * Returns null when nothing changed.
 */
export function diffChanges(before: Record<string, unknown> | null, after: Record<string, unknown>): AuditChanges | null {
  const changes: AuditChanges = {};
  for (const key of Object.keys(after)) {
    if (IGNORED_KEYS.has(key)) continue;
    const from = sanitizeAuditValue(before?.[key]);
    const to = sanitizeAuditValue(after[key]);
    if (JSON.stringify(from) === JSON.stringify(to)) continue;
    changes[key] = SENSITIVE_KEY.test(key) ? { from: REDACTED, to: REDACTED } : { from, to };
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

// --- Writing ---------------------------------------------------------------------------------

/**
 * Appends one entry. Pass the transaction that performs the change so the entry and the change
 * commit (or roll back) together.
 */
export async function recordAudit(db: DbExecutor, actor: AuditActor, entry: AuditEntry): Promise<void> {
  const metadata = entry.metadata ? (sanitizeAuditValue(entry.metadata) as Record<string, unknown>) : null;
  await db.insert(adminAuditLogs).values({
    actorUserId: actor.userId,
    actorRoles: [...actor.roles],
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    changes: entry.changes ?? null,
    metadata,
    requestId: actor.requestId,
  });
}

// --- Reading ---------------------------------------------------------------------------------

const cursorShape = z.object({ c: z.iso.datetime(), id: z.uuid() });

export async function listAuditLogs(db: Db, query: AuditLogQuery) {
  const conditions: (SQL | undefined)[] = [
    query.action ? eq(adminAuditLogs.action, query.action) : undefined,
    query.resourceType ? eq(adminAuditLogs.resourceType, query.resourceType) : undefined,
    query.resourceId ? eq(adminAuditLogs.resourceId, query.resourceId) : undefined,
    query.actorUserId ? eq(adminAuditLogs.actorUserId, query.actorUserId) : undefined,
    query.from ? gte(adminAuditLogs.occurredAt, new Date(query.from)) : undefined,
    query.to ? lt(adminAuditLogs.occurredAt, new Date(query.to)) : undefined,
  ];
  if (query.cursor) {
    const after = decodeCursor(query.cursor, cursorShape);
    conditions.push(sql`(${adminAuditLogs.occurredAt}, ${adminAuditLogs.id}) < (${after.c}::timestamptz, ${after.id}::uuid)`);
  }

  const rows = await db
    .select({ log: adminAuditLogs, actorName: users.name })
    .from(adminAuditLogs)
    .leftJoin(users, eq(users.id, adminAuditLogs.actorUserId))
    .where(and(...conditions))
    .orderBy(desc(adminAuditLogs.occurredAt), desc(adminAuditLogs.id))
    .limit(query.limit + 1);

  return buildPage(
    rows,
    query.limit,
    ({ log }) => ({ c: log.occurredAt.toISOString(), id: log.id }),
    ({ log, actorName }): AuditLogEntry => ({
      id: log.id,
      occurredAt: log.occurredAt.toISOString(),
      actor: { userId: log.actorUserId, name: actorName, roles: log.actorRoles },
      action: log.action as AuditAction,
      resource: { type: log.resourceType as AuditResourceType, id: log.resourceId },
      changes: log.changes,
      metadata: log.metadata,
      requestId: log.requestId,
    }),
  );
}
