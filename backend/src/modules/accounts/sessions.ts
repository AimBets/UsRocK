import { and, eq, isNull, ne } from "drizzle-orm";
import type { FastifyReply } from "fastify";
import type { Env } from "../../config/env.js";
import type { Db, DbExecutor } from "../../db/client.js";
import { SESSION_COOKIE_NAME, type Principal, type SessionResolver } from "../auth/auth.types.js";
import { sessions, users } from "./accounts.schema.js";
import { generateToken, hashToken, tokenSchema } from "./security.js";

const DAY_MS = 86_400_000;
/** `last_seen_at` is refreshed at most this often, avoiding a write on every request. */
const TOUCH_INTERVAL_MS = 5 * 60_000;

export type SessionSettings = Pick<Env, "SESSION_TTL_DAYS" | "SESSION_IDLE_DAYS" | "SESSION_COOKIE_SECURE">;

export async function createSession(db: Db, userId: string, settings: SessionSettings): Promise<{ token: string; sessionId: string }> {
  const { token, tokenHash } = generateToken();
  const [row] = await db
    .insert(sessions)
    .values({ userId, tokenHash, expiresAt: new Date(Date.now() + settings.SESSION_TTL_DAYS * DAY_MS) })
    .returning({ id: sessions.id });
  if (!row) throw new Error("session insert returned no row");
  return { token, sessionId: row.id };
}

export async function revokeSession(db: Db, sessionId: string): Promise<void> {
  await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

/** Revokes every active session of a user, optionally keeping the current one. */
export async function revokeUserSessions(db: DbExecutor, userId: string, exceptSessionId?: string): Promise<void> {
  const conditions = [eq(sessions.userId, userId), isNull(sessions.revokedAt)];
  if (exceptSessionId) conditions.push(ne(sessions.id, exceptSessionId));
  await db.update(sessions).set({ revokedAt: new Date() }).where(and(...conditions));
}

export function setSessionCookie(reply: FastifyReply, token: string, settings: SessionSettings): void {
  reply.setCookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: settings.SESSION_COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: settings.SESSION_TTL_DAYS * 86_400,
  });
}

export function clearSessionCookie(reply: FastifyReply, settings: SessionSettings): void {
  reply.clearCookie(SESSION_COOKIE_NAME, { httpOnly: true, secure: settings.SESSION_COOKIE_SECURE, sameSite: "lax", path: "/" });
}

/**
 * Resolves the session cookie against PostgreSQL. A session is valid when it is not revoked,
 * not past its absolute expiry, used within the idle window, and its user is active.
 */
export function createDbSessionResolver(db: Db, settings: SessionSettings): SessionResolver {
  return {
    async resolve(request): Promise<Principal | null> {
      const token = tokenSchema.safeParse(request.cookies[SESSION_COOKIE_NAME]);
      if (!token.success) return null;

      const [row] = await db
        .select({
          sessionId: sessions.id,
          userId: users.id,
          roles: users.roles,
          status: users.status,
          expiresAt: sessions.expiresAt,
          lastSeenAt: sessions.lastSeenAt,
          revokedAt: sessions.revokedAt,
        })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(eq(sessions.tokenHash, hashToken(token.data)))
        .limit(1);

      const now = Date.now();
      if (
        !row ||
        row.revokedAt !== null ||
        row.status !== "active" ||
        row.expiresAt.getTime() <= now ||
        row.lastSeenAt.getTime() + settings.SESSION_IDLE_DAYS * DAY_MS <= now
      ) {
        return null;
      }

      if (now - row.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
        await db.update(sessions).set({ lastSeenAt: new Date(now) }).where(eq(sessions.id, row.sessionId));
      }
      return { userId: row.userId, sessionId: row.sessionId, roles: row.roles };
    },
  };
}
