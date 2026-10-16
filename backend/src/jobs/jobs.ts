import { and, asc, eq, lte } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { Db } from "../db/client.js";
import type { Mailer } from "../modules/mail/mailer.js";
import { dispatchNotifications } from "../modules/notifications/notifications.service.js";
import type { WhatsAppSender } from "../modules/notifications/whatsapp.js";
import { idempotencyKeys, orders, shippingQuotes } from "../modules/orders/orders.schema.js";
import { lockOrder, releaseOrderHolds, syncOrderPayments, transitionOrder } from "../modules/orders/orders.service.js";
import type { PaymentGateway } from "../modules/payments/mercadopago.client.js";
import { payments } from "../modules/payments/payments.schema.js";

export interface JobDeps {
  db: Db;
  gateway: PaymentGateway | null;
  mailer: Mailer;
  whatsapp: WhatsAppSender;
  log: FastifyBaseLogger;
  appPublicUrl: string;
}

/**
 * Expires unpaid orders whose reservation ended: stock and coupon use are released. Before
 * expiring, orders that opened a payment are reconciled with the provider once, so a payment
 * approved just before the deadline (webhook delayed) is honoured instead of expired.
 */
export async function expirePendingOrders(deps: Pick<JobDeps, "db" | "gateway" | "log">, now = new Date(), limit = 50): Promise<number> {
  const due = await deps.db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.status, "pending_payment"), lte(orders.reservationExpiresAt, now)))
    .orderBy(asc(orders.reservationExpiresAt))
    .limit(limit);

  let expired = 0;
  for (const { id } of due) {
    if (deps.gateway) {
      const [attempt] = await deps.db.select({ id: payments.id }).from(payments).where(eq(payments.orderId, id)).limit(1);
      if (attempt) {
        try {
          await syncOrderPayments(deps.db, deps.gateway, id, deps.log);
        } catch (error) {
          // Expire anyway: a later approval is still handled (stock re-taken or order flagged).
          deps.log.warn({ orderId: id, err: error instanceof Error ? error.name : "unknown" }, "payment reconciliation before expiry failed");
        }
      }
    }
    const changed = await deps.db.transaction(async (tx) => {
      const order = await lockOrder(tx, id);
      if (!order || order.status !== "pending_payment" || order.reservationExpiresAt > now) return false;
      await releaseOrderHolds(tx, order.id);
      await transitionOrder(tx, order, "expired", { actor: "system", note: "reserva expirada sem pagamento" });
      return true;
    });
    if (changed) expired += 1;
  }
  return expired;
}

/** Removes short-lived rows that no longer serve any purpose. */
export async function cleanupExpiredRecords(db: Db, now = new Date()) {
  const dayAgo = new Date(now.getTime() - 86_400_000);
  await db.delete(shippingQuotes).where(lte(shippingQuotes.expiresAt, dayAgo));
  await db.delete(idempotencyKeys).where(lte(idempotencyKeys.expiresAt, now));
}

export async function runJobsOnce(deps: JobDeps) {
  const expired = await expirePendingOrders(deps);
  const notifications = await dispatchNotifications(deps);
  await cleanupExpiredRecords(deps.db);
  return { expired, notifications };
}

/** In-process scheduler. Safe with several instances: rows are claimed with locks/SKIP LOCKED. */
export function startJobScheduler(deps: JobDeps, intervalSeconds: number): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await runJobsOnce(deps);
      if (result.expired > 0 || result.notifications.sent > 0 || result.notifications.failed > 0) {
        deps.log.info({ job: "checkout", ...result }, "background jobs ran");
      }
    } catch (error) {
      deps.log.error({ err: error }, "background jobs failed");
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), intervalSeconds * 1000);
  timer.unref();
  return () => clearInterval(timer);
}
