import { and, eq, gt, isNull } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { Env } from "../../config/env.js";
import type { Db } from "../../db/client.js";
import { errors } from "../../shared/errors.js";
import { hasPermission, permissions } from "../auth/auth.types.js";
import type { Mailer } from "../mail/mailer.js";
import { passwordResetEmail } from "../mail/templates.js";
import type { CurrentUser } from "./accounts.contracts.js";
import { consents, passwordResetTokens, users } from "./accounts.schema.js";
import { generateToken, hashPassword, hashToken, verifyAgainstDummy, verifyPassword } from "./security.js";
import { createSession, revokeUserSessions } from "./sessions.js";

export const PASSWORD_RESET_TTL_MINUTES = 60;

export interface AccountsDeps {
  db: Db;
  env: Env;
  mailer: Mailer;
  log: FastifyBaseLogger;
}

type UserRow = typeof users.$inferSelect;

export function toCurrentUser(user: UserRow): CurrentUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    roles: user.roles,
    permissions: permissions.filter((permission) => hasPermission(user.roles, permission)),
    emailVerified: user.emailVerifiedAt !== null,
    createdAt: user.createdAt.toISOString(),
  };
}

const invalidCredentials = () => errors.unauthenticated("E-mail ou senha inválidos.");

export async function registerCustomer(
  { db, env }: AccountsDeps,
  input: { email: string; password: string; name: string; marketingEmailOptIn: boolean },
) {
  const passwordHash = await hashPassword(input.password);
  const user = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({ email: input.email, passwordHash, name: input.name, roles: ["customer"] })
      .onConflictDoNothing({ target: users.email })
      .returning();
    if (!created) throw errors.conflict("Já existe uma conta com este e-mail.");

    const record = { userId: created.id, policyVersion: env.LEGAL_POLICY_VERSION, source: "register" };
    await tx.insert(consents).values([
      { ...record, purpose: "terms", granted: true },
      { ...record, purpose: "privacy", granted: true },
      { ...record, purpose: "marketing_email", granted: input.marketingEmailOptIn },
    ]);
    return created;
  });
  const session = await createSession(db, user.id, env);
  return { user, token: session.token };
}

export async function authenticate({ db, env }: AccountsDeps, input: { email: string; password: string }) {
  const [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
  if (!user) {
    await verifyAgainstDummy(input.password);
    throw invalidCredentials();
  }
  const valid = await verifyPassword(user.passwordHash, input.password);
  if (!valid || user.status !== "active") throw invalidCredentials();

  const [updated] = await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id)).returning();
  const session = await createSession(db, user.id, env);
  return { user: updated ?? user, token: session.token };
}

export async function findActiveUser(db: Db, userId: string): Promise<UserRow | undefined> {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.status, "active")))
    .limit(1);
  return user;
}

/**
 * Always completes the same way regardless of whether the email exists (no account enumeration).
 * The email is sent in the background so response time does not leak existence either; failures
 * are logged without the address.
 */
export async function requestPasswordReset({ db, env, mailer, log }: AccountsDeps, email: string): Promise<void> {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), eq(users.status, "active")))
    .limit(1);
  if (!user) return;

  const { token, tokenHash } = generateToken();
  await db.transaction(async (tx) => {
    // Only the most recent link is valid.
    await tx.delete(passwordResetTokens).where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));
    await tx.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60_000),
    });
  });

  const resetUrl = `${env.APP_PUBLIC_URL}/conta/redefinir-senha?token=${token}`;
  void mailer
    .send(passwordResetEmail({ to: user.email, name: user.name, resetUrl, expiresInMinutes: PASSWORD_RESET_TTL_MINUTES }))
    .catch((error: unknown) => log.error({ err: error, userId: user.id }, "password reset email failed"));
}

const invalidResetToken = () =>
  errors.validation([{ path: "body.token", message: "Link de redefinição inválido ou expirado.", code: "invalid_token" }]);

/** Consumes a single-use reset token, sets the new password and signs the user out everywhere. */
export async function resetPassword({ db }: AccountsDeps, input: { token: string; password: string }): Promise<void> {
  const passwordHash = await hashPassword(input.password);
  await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(passwordResetTokens.tokenHash, hashToken(input.token)),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, new Date()),
        ),
      )
      .returning({ userId: passwordResetTokens.userId });
    if (!claimed) throw invalidResetToken();

    const [user] = await tx
      .update(users)
      .set({ passwordHash })
      .where(and(eq(users.id, claimed.userId), eq(users.status, "active")))
      .returning({ id: users.id });
    if (!user) throw invalidResetToken();

    await revokeUserSessions(tx, user.id);
  });
}

export async function changePassword(
  { db }: AccountsDeps,
  input: { userId: string; sessionId: string; currentPassword: string; newPassword: string },
): Promise<void> {
  const user = await findActiveUser(db, input.userId);
  if (!user) throw errors.unauthenticated();
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw errors.validation([{ path: "body.currentPassword", message: "Senha atual incorreta.", code: "invalid_password" }]);
  }
  const passwordHash = await hashPassword(input.newPassword);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, user.id));
    await revokeUserSessions(tx, user.id, input.sessionId);
  });
}
