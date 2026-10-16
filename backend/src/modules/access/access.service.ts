import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Db, DbTransaction } from "../../db/client.js";
import { errors } from "../../shared/errors.js";
import { buildPage, decodeCursor } from "../../shared/pagination.js";
import { users } from "../accounts/accounts.schema.js";
import { revokeUserSessions } from "../accounts/sessions.js";
import { recordAudit, type AuditActor } from "../audit/audit.service.js";
import { hasPermission, permissions, rolePermissions, type Role } from "../auth/auth.types.js";
import { staffRoles, type AdminUser, type AdminUserListQuery } from "./access.contracts.js";

type UserRow = typeof users.$inferSelect;

export function toAdminUser(row: UserRow): AdminUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    roles: [...row.roles],
    permissions: permissions.filter((permission) => hasPermission(row.roles, permission)),
    status: row.status,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

const cursorShape = z.object({ c: z.iso.datetime(), id: z.uuid() });
const createdKey = sql`date_trunc('milliseconds', ${users.createdAt})`;
const staffRoleArray = sql.raw(`ARRAY[${staffRoles.map((role) => `'${role}'`).join(",")}]::user_role[]`);

/** Staff list, or an exact e-mail lookup across every account (to grant access to a customer). */
export async function listAdminUsers(db: Db, query: AdminUserListQuery) {
  const conditions: (SQL | undefined)[] = [
    query.email ? eq(users.email, query.email) : sql`${users.roles} && ${staffRoleArray}`,
    query.role ? sql`${query.role}::user_role = ANY(${users.roles})` : undefined,
    query.status ? eq(users.status, query.status) : undefined,
  ];
  if (query.cursor) {
    const after = decodeCursor(query.cursor, cursorShape);
    conditions.push(sql`(${createdKey}, ${users.id}) < (${after.c}::timestamptz, ${after.id}::uuid)`);
  }
  const rows = await db
    .select()
    .from(users)
    .where(and(...conditions))
    .orderBy(desc(createdKey), desc(users.id))
    .limit(query.limit + 1);
  return buildPage(rows, query.limit, (row) => ({ c: row.createdAt.toISOString(), id: row.id }), toAdminUser);
}

// --- Changes ---------------------------------------------------------------------------------

function rejection(code: string, message: string) {
  return errors.conflict(message, [{ path: "params.id", message, code }]);
}

/**
 * Locks every active administrator (stable order, so concurrent requests cannot deadlock) and the
 * target account. Holding the admin rows serialises changes that could otherwise leave the store
 * without any active administrator (e.g. two admins demoting each other at the same time).
 */
async function lockForAccessChange(
  tx: DbTransaction,
  actor: AuditActor,
  targetId: string,
): Promise<{ target: UserRow; actorRoles: readonly Role[]; activeAdminIds: string[] }> {
  const admins = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(sql`'admin'::user_role = ANY(${users.roles})`, eq(users.status, "active")))
    .orderBy(asc(users.id))
    .for("update");
  const [target] = await tx.select().from(users).where(eq(users.id, targetId)).for("update");
  if (!target) throw errors.notFound("Conta não encontrada.");
  // The session's roles were read before the lock; a concurrent change may have revoked them.
  const [current] = actor.userId
    ? await tx.select({ roles: users.roles, status: users.status }).from(users).where(eq(users.id, actor.userId))
    : [];
  if (!current || current.status !== "active" || !hasPermission(current.roles, "users:manage")) throw errors.forbidden();
  return { target, actorRoles: current.roles, activeAdminIds: admins.map((row) => row.id) };
}

/**
 * Guards shared by every access change:
 * - nobody changes their own access (no self-escalation, no accidental self-lockout);
 * - the actor must currently hold every permission involved, so access can never be granted or
 *   taken beyond the actor's own reach.
 */
function assertActorMayChange(actor: AuditActor, actorRoles: readonly Role[], target: UserRow, involvedRoles: readonly Role[]) {
  if (actor.userId === target.id) throw rejection("cannot_modify_self", "Não é possível alterar o próprio acesso.");
  const required = new Set(involvedRoles.flatMap((role) => rolePermissions[role]));
  for (const permission of required) {
    if (!hasPermission(actorRoles, permission)) throw errors.forbidden("Você não pode conceder ou retirar acessos que não possui.");
  }
}

function leavesNoActiveAdmin(target: UserRow, activeAdminIds: readonly string[], stillActiveAdmin: boolean): boolean {
  const isActiveAdmin = activeAdminIds.includes(target.id);
  return isActiveAdmin && !stillActiveAdmin && activeAdminIds.length <= 1;
}

export async function updateUserRoles(db: Db, actor: AuditActor, targetId: string, nextRoles: Role[]): Promise<AdminUser> {
  return db.transaction(async (tx) => {
    const { target, actorRoles, activeAdminIds } = await lockForAccessChange(tx, actor, targetId);
    assertActorMayChange(actor, actorRoles, target, [...new Set([...target.roles, ...nextRoles])]);

    const current = [...target.roles].sort();
    if (JSON.stringify(current) === JSON.stringify([...nextRoles].sort())) return toAdminUser(target);
    if (leavesNoActiveAdmin(target, activeAdminIds, nextRoles.includes("admin"))) {
      throw rejection("last_admin", "A loja precisa manter ao menos um administrador ativo.");
    }

    const [updated] = await tx.update(users).set({ roles: nextRoles }).where(eq(users.id, target.id)).returning();
    await recordAudit(tx, actor, {
      action: "user.roles_update",
      resourceType: "user",
      resourceId: target.id,
      changes: { roles: { from: [...target.roles], to: nextRoles } },
    });
    return toAdminUser(updated!);
  });
}

export async function updateUserStatus(
  db: Db,
  actor: AuditActor,
  targetId: string,
  status: UserRow["status"],
): Promise<AdminUser> {
  return db.transaction(async (tx) => {
    const { target, actorRoles, activeAdminIds } = await lockForAccessChange(tx, actor, targetId);
    assertActorMayChange(actor, actorRoles, target, target.roles);

    if (target.status === status) return toAdminUser(target);
    if (status === "disabled" && leavesNoActiveAdmin(target, activeAdminIds, false)) {
      throw rejection("last_admin", "A loja precisa manter ao menos um administrador ativo.");
    }

    const [updated] = await tx.update(users).set({ status }).where(eq(users.id, target.id)).returning();
    // Sessions are already refused for disabled accounts; revoking them makes it permanent.
    if (status === "disabled") await revokeUserSessions(tx, target.id);
    await recordAudit(tx, actor, {
      action: "user.status_update",
      resourceType: "user",
      resourceId: target.id,
      changes: { status: { from: target.status, to: status } },
      metadata: status === "disabled" ? { sessionsRevoked: true } : null,
    });
    return toAdminUser(updated!);
  });
}
