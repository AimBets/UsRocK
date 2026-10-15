import { and, eq, gt } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { Env } from "../../config/env.js";
import type { Db, DbTransaction } from "../../db/client.js";
import { errors } from "../../shared/errors.js";
import { consents, users } from "../accounts/accounts.schema.js";
import { generateToken, hashToken } from "../accounts/security.js";
import type { Mailer } from "../mail/mailer.js";
import { newsletterConfirmationEmail } from "../mail/templates.js";
import { newsletterEvents, newsletterSubscriptions } from "./newsletter.schema.js";

export const CONFIRMATION_TTL_HOURS = 48;
/** A pending address does not get another confirmation email sooner than this. */
export const RESEND_INTERVAL_MS = 60_000;

export interface NewsletterDeps {
  db: Db;
  env: Env;
  mailer: Mailer;
  log: FastifyBaseLogger;
}

type SubscriptionRow = typeof newsletterSubscriptions.$inferSelect;

/** Mirrors the newsletter choice into the account consent ledger when the email has an account. */
async function recordAccountConsent(tx: DbTransaction, row: SubscriptionRow, granted: boolean, source: string, policyVersion: string) {
  const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.email, row.email)).limit(1);
  if (!user) return;
  if (row.userId !== user.id) await tx.update(newsletterSubscriptions).set({ userId: user.id }).where(eq(newsletterSubscriptions.id, row.id));
  await tx.insert(consents).values({ userId: user.id, purpose: "marketing_email", granted, policyVersion, source });
}

/**
 * Starts (or restarts) double opt-in. Completes identically whether or not the address is already
 * subscribed, so the endpoint cannot be used to discover who is on the list. Confirmed addresses
 * receive nothing; pending ones are not re-sent within RESEND_INTERVAL_MS.
 */
export async function requestSubscription({ db, env, mailer, log }: NewsletterDeps, input: { email: string; source: string }): Promise<void> {
  const [existing] = await db.select().from(newsletterSubscriptions).where(eq(newsletterSubscriptions.email, input.email)).limit(1);
  if (existing?.status === "confirmed") return;
  if (
    existing?.status === "pending" &&
    existing.confirmationSentAt &&
    Date.now() - existing.confirmationSentAt.getTime() < RESEND_INTERVAL_MS
  ) {
    return;
  }

  const confirm = generateToken();
  // Nothing has been sent to a non-confirmed address yet, so rotating the unsubscribe secret is safe.
  const unsubscribe = generateToken();
  const now = new Date();
  const values = {
    status: "pending" as const,
    confirmTokenHash: confirm.tokenHash,
    confirmExpiresAt: new Date(now.getTime() + CONFIRMATION_TTL_HOURS * 3_600_000),
    unsubscribeTokenHash: unsubscribe.tokenHash,
    policyVersion: env.LEGAL_POLICY_VERSION,
    source: input.source,
    confirmationSentAt: now,
  };

  const subscriptionId = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(newsletterSubscriptions)
      .values({ email: input.email, ...values })
      .onConflictDoUpdate({ target: newsletterSubscriptions.email, set: values })
      .returning({ id: newsletterSubscriptions.id });
    if (!row) throw new Error("newsletter upsert returned no row");
    await tx.insert(newsletterEvents).values({
      subscriptionId: row.id,
      event: "subscribe_requested",
      policyVersion: env.LEGAL_POLICY_VERSION,
      source: input.source,
    });
    return row.id;
  });

  void mailer
    .send(
      newsletterConfirmationEmail({
        to: input.email,
        confirmUrl: `${env.APP_PUBLIC_URL}/newsletter/confirmar?token=${confirm.token}`,
        unsubscribeUrl: `${env.APP_PUBLIC_URL}/newsletter/cancelar?token=${unsubscribe.token}`,
        expiresInHours: CONFIRMATION_TTL_HOURS,
      }),
    )
    .catch((error: unknown) => log.error({ err: error, subscriptionId }, "newsletter confirmation email failed"));
}

const invalidToken = () =>
  errors.validation([{ path: "body.token", message: "Link inválido ou expirado.", code: "invalid_token" }], "Link inválido ou expirado.");

/** Second step of double opt-in. The confirmation link is single-use. */
export async function confirmSubscription({ db }: Pick<NewsletterDeps, "db">, token: string): Promise<void> {
  await db.transaction(async (tx) => {
    const now = new Date();
    const [row] = await tx
      .update(newsletterSubscriptions)
      .set({ status: "confirmed", confirmedAt: now, unsubscribedAt: null, confirmTokenHash: null, confirmExpiresAt: null })
      .where(
        and(
          eq(newsletterSubscriptions.confirmTokenHash, hashToken(token)),
          eq(newsletterSubscriptions.status, "pending"),
          gt(newsletterSubscriptions.confirmExpiresAt, now),
        ),
      )
      .returning();
    if (!row) throw invalidToken();
    await tx.insert(newsletterEvents).values({ subscriptionId: row.id, event: "confirmed", policyVersion: row.policyVersion, source: row.source });
    await recordAccountConsent(tx, row, true, "newsletter_confirm", row.policyVersion);
  });
}

/** Idempotent: an already unsubscribed address answers the same way. Also cancels a pending request. */
export async function unsubscribe({ db }: Pick<NewsletterDeps, "db">, token: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(newsletterSubscriptions)
      .where(eq(newsletterSubscriptions.unsubscribeTokenHash, hashToken(token)))
      .for("update");
    if (!row) throw invalidToken();
    if (row.status === "unsubscribed") return;

    await tx
      .update(newsletterSubscriptions)
      .set({ status: "unsubscribed", unsubscribedAt: new Date(), confirmTokenHash: null, confirmExpiresAt: null })
      .where(eq(newsletterSubscriptions.id, row.id));
    await tx.insert(newsletterEvents).values({ subscriptionId: row.id, event: "unsubscribed", policyVersion: row.policyVersion, source: "unsubscribe_link" });
    if (row.status === "confirmed") await recordAccountConsent(tx, row, false, "newsletter_unsubscribe", row.policyVersion);
  });
}
