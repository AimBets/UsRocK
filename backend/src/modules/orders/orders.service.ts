import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { Db, DbTransaction } from "../../db/client.js";
import { errors } from "../../shared/errors.js";
import { inventoryLevels, inventoryMovements } from "../catalog/catalog.schema.js";
import { coupons } from "../marketing/marketing.schema.js";
import { enqueueEmail } from "../notifications/notifications.service.js";
import type { PaymentGateway, ProviderPayment } from "../payments/mercadopago.client.js";
import { payments } from "../payments/payments.schema.js";
import { canTransition, paymentOutcome } from "./order-status.js";
import {
  couponRedemptions,
  orderItems,
  orders,
  orderStatusHistory,
  stockReservations,
  type OrderStatus,
} from "./orders.schema.js";

export type OrderRow = typeof orders.$inferSelect;
type Actor = (typeof orderStatusHistory.$inferInsert)["actor"];

/** Statuses after which the customer is told by e-mail (paid has its own template). */
const notifyOnStatus: ReadonlySet<OrderStatus> = new Set(["in_fulfillment", "shipped", "delivered", "cancelled", "expired", "refunded"]);

export async function lockOrder(tx: DbTransaction, orderId: string): Promise<OrderRow | undefined> {
  const [row] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
  return row;
}

/**
 * Applies a state change validated by the state machine, records it in the history and queues
 * the customer e-mail. Returns the updated row. The caller must hold the order lock.
 */
export async function transitionOrder(
  tx: DbTransaction,
  order: OrderRow,
  to: OrderStatus,
  by: { actor: Actor; actorUserId?: string | null; note?: string | null; emailDetail?: string | null },
): Promise<OrderRow> {
  if (!canTransition(order.status, to)) {
    throw errors.conflict(`Transição de ${order.status} para ${to} não permitida.`, [
      { path: "body.to", message: "Transição inválida.", code: "invalid_transition" },
    ]);
  }
  const now = new Date();
  const [updated] = await tx
    .update(orders)
    .set({
      status: to,
      ...(to === "paid" ? { paidAt: now } : {}),
      ...(to === "cancelled" ? { cancelledAt: now } : {}),
    })
    .where(eq(orders.id, order.id))
    .returning();
  await tx.insert(orderStatusHistory).values({
    orderId: order.id,
    fromStatus: order.status,
    toStatus: to,
    actor: by.actor,
    actorUserId: by.actorUserId ?? null,
    note: by.note ?? null,
  });
  if (to === "paid") {
    await enqueueEmail(tx, { template: "order_paid", orderId: order.id, recipient: order.customerEmail, dedupeKey: `order:${order.id}:paid` });
  } else if (notifyOnStatus.has(to)) {
    await enqueueEmail(tx, {
      template: "order_status_changed",
      orderId: order.id,
      recipient: order.customerEmail,
      dedupeKey: `order:${order.id}:status:${to}`,
      data: { status: to, ...(by.emailDetail ? { detail: by.emailDetail } : {}) },
    });
  }
  return updated!;
}

export async function flagAttention(tx: DbTransaction, orderId: string, reason: string) {
  await tx.update(orders).set({ attentionReason: reason }).where(eq(orders.id, orderId));
}

/** Gives back held stock and the coupon use of an order that will not be paid. */
export async function releaseOrderHolds(tx: DbTransaction, orderId: string): Promise<void> {
  const active = await tx
    .update(stockReservations)
    .set({ status: "released", resolvedAt: new Date() })
    .where(and(eq(stockReservations.orderId, orderId), eq(stockReservations.status, "active")))
    .returning();
  for (const reservation of active.sort((a, b) => a.variantId.localeCompare(b.variantId))) {
    await tx
      .update(inventoryLevels)
      .set({ reserved: sql`${inventoryLevels.reserved} - ${reservation.quantity}` })
      .where(eq(inventoryLevels.variantId, reservation.variantId));
  }
  const [redemption] = await tx
    .update(couponRedemptions)
    .set({ status: "released" })
    .where(and(eq(couponRedemptions.orderId, orderId), eq(couponRedemptions.status, "active")))
    .returning();
  if (redemption) {
    await tx
      .update(coupons)
      .set({ timesRedeemed: sql`GREATEST(${coupons.timesRedeemed} - 1, 0)` })
      .where(eq(coupons.id, redemption.couponId));
  }
}

/** Payment approved: held units leave the stock for good (on hand and reserved both decrease). */
async function consumeReservations(tx: DbTransaction, order: OrderRow): Promise<void> {
  const active = await tx
    .update(stockReservations)
    .set({ status: "consumed", resolvedAt: new Date() })
    .where(and(eq(stockReservations.orderId, order.id), eq(stockReservations.status, "active")))
    .returning();
  for (const reservation of active.sort((a, b) => a.variantId.localeCompare(b.variantId))) {
    await tx
      .update(inventoryLevels)
      .set({
        onHand: sql`${inventoryLevels.onHand} - ${reservation.quantity}`,
        reserved: sql`${inventoryLevels.reserved} - ${reservation.quantity}`,
      })
      .where(eq(inventoryLevels.variantId, reservation.variantId));
    await tx.insert(inventoryMovements).values({ variantId: reservation.variantId, delta: -reservation.quantity, reason: "sale", note: order.number });
  }
}

/**
 * Late approval of an expired order: takes the units straight from available stock if every
 * line still fits; otherwise nothing changes (savepoint) and the caller flags the order.
 */
async function takeStockAgain(tx: DbTransaction, order: OrderRow): Promise<boolean> {
  const lines = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(asc(orderItems.variantId));
  try {
    await tx.transaction(async (savepoint) => {
      for (const line of lines) {
        const taken = await savepoint
          .update(inventoryLevels)
          .set({ onHand: sql`${inventoryLevels.onHand} - ${line.quantity}` })
          .where(and(eq(inventoryLevels.variantId, line.variantId), sql`${inventoryLevels.onHand} - ${inventoryLevels.reserved} >= ${line.quantity}`))
          .returning({ variantId: inventoryLevels.variantId });
        if (taken.length === 0) throw new Error("stock_unavailable");
        await savepoint.insert(inventoryMovements).values({ variantId: line.variantId, delta: -line.quantity, reason: "sale", note: order.number });
      }
    });
    return true;
  } catch (error) {
    if (error instanceof Error && error.message === "stock_unavailable") return false;
    throw error;
  }
}

/** Restock of a paid order cancelled by an operator (refund is handled manually in the provider). */
export async function restockOrder(tx: DbTransaction, order: OrderRow): Promise<void> {
  const lines = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(asc(orderItems.variantId));
  for (const line of lines) {
    await tx
      .update(inventoryLevels)
      .set({ onHand: sql`${inventoryLevels.onHand} + ${line.quantity}` })
      .where(eq(inventoryLevels.variantId, line.variantId));
    await tx.insert(inventoryMovements).values({ variantId: line.variantId, delta: line.quantity, reason: "return", note: order.number });
  }
}

export type PaymentApplyResult =
  | "unknown_order"
  | "recorded"
  | "paid"
  | "already_paid"
  | "attention"
  | "refunded";

/**
 * Reconciles one payment fetched from the provider API (never from browser data or webhook body)
 * with its order. Idempotent and serialised by the order lock, so duplicated or concurrent
 * notifications converge on the same state.
 */
export async function applyProviderPayment(
  db: Db,
  gateway: Pick<PaymentGateway, "provider" | "environment">,
  payment: ProviderPayment,
  log: FastifyBaseLogger,
): Promise<PaymentApplyResult> {
  const orderId = payment.externalReference;
  if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) return "unknown_order";

  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (!order) return "unknown_order";

    // Attach to the attempt row: same provider payment id, else the latest preference without one.
    const [existing] = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.provider, gateway.provider), eq(payments.providerPaymentId, payment.id)))
      .limit(1);
    const [openAttempt] = existing
      ? [existing]
      : await tx
          .select()
          .from(payments)
          .where(and(eq(payments.orderId, order.id), isNull(payments.providerPaymentId)))
          .orderBy(desc(payments.createdAt))
          .limit(1);
    const values = {
      providerPaymentId: payment.id,
      status: payment.status,
      statusDetail: payment.statusDetail,
      liveMode: payment.liveMode,
      approvedAt: payment.approvedAt,
      lastSyncedAt: new Date(),
    };
    if (openAttempt) {
      await tx.update(payments).set(values).where(eq(payments.id, openAttempt.id));
    } else {
      await tx.insert(payments).values({ ...values, orderId: order.id, provider: gateway.provider, environment: gateway.environment, amountMinor: payment.amountMinor });
    }

    const outcome = paymentOutcome(payment.status);
    if (outcome === "approved") {
      if (payment.currencyCode !== "BRL" || payment.amountMinor !== order.totalMinor) {
        // Never confirm an order whose charge does not match exactly what the server computed.
        await flagAttention(tx, order.id, "payment_amount_mismatch");
        log.error({ orderId: order.id, paymentId: payment.id }, "approved payment amount does not match order total");
        return "attention";
      }
      if (order.status === "pending_payment") {
        await consumeReservations(tx, order);
        await transitionOrder(tx, order, "paid", { actor: "payment_provider", note: `pagamento ${payment.id}` });
        return "paid";
      }
      if (order.status === "expired") {
        if (await takeStockAgain(tx, order)) {
          // The coupon use released at expiry counts again: the customer paid the discounted total.
          const [redemption] = await tx
            .update(couponRedemptions)
            .set({ status: "active" })
            .where(and(eq(couponRedemptions.orderId, order.id), eq(couponRedemptions.status, "released")))
            .returning();
          if (redemption) {
            await tx.update(coupons).set({ timesRedeemed: sql`${coupons.timesRedeemed} + 1` }).where(eq(coupons.id, redemption.couponId));
          }
          await transitionOrder(tx, order, "paid", { actor: "payment_provider", note: `pagamento ${payment.id} após expiração` });
          return "paid";
        }
        await flagAttention(tx, order.id, "paid_after_expiry_without_stock");
        log.error({ orderId: order.id, paymentId: payment.id }, "payment approved after expiry and stock is gone; refund required");
        return "attention";
      }
      if (order.status === "cancelled") {
        await flagAttention(tx, order.id, "paid_after_cancellation");
        log.error({ orderId: order.id, paymentId: payment.id }, "payment approved for a cancelled order; refund required");
        return "attention";
      }
      return "already_paid";
    }

    if (outcome === "reversed") {
      if (payment.status === "charged_back") {
        await flagAttention(tx, order.id, "chargeback");
        return "attention";
      }
      if (canTransition(order.status, "refunded")) {
        await transitionOrder(tx, order, "refunded", { actor: "payment_provider", note: `pagamento ${payment.id} estornado` });
        return "refunded";
      }
    }
    return "recorded";
  });
}

/** Fetches every payment of an order from the provider and applies them (approved last wins). */
export async function syncOrderPayments(db: Db, gateway: PaymentGateway, orderId: string, log: FastifyBaseLogger) {
  const found = await gateway.findPaymentsByOrder(orderId);
  const ordered = [...found].sort((a, b) => Number(a.status === "approved") - Number(b.status === "approved"));
  const results: PaymentApplyResult[] = [];
  for (const payment of ordered) results.push(await applyProviderPayment(db, gateway, payment, log));
  return results;
}
