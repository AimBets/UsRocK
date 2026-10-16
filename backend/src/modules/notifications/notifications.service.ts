import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { Db, DbExecutor } from "../../db/client.js";
import { formatPostalCode } from "../../shared/br.js";
import { formatBrl } from "../../shared/money.js";
import type { Mailer, MailMessage } from "../mail/mailer.js";
import { orderPaidEmail, orderReceivedEmail, orderStatusEmail, type OrderEmailData } from "../mail/templates.js";
import { orderStatusLabel } from "../orders/order-status.js";
import { orderItems, orders } from "../orders/orders.schema.js";
import { notifications, type NotificationTemplate } from "./notifications.schema.js";
import type { WhatsAppSender } from "./whatsapp.js";

/** Minutes to wait before attempt n+1 (index = attempts already made). */
export const RETRY_BACKOFF_MINUTES = [1, 5, 30, 120, 360];
export const MAX_ATTEMPTS = RETRY_BACKOFF_MINUTES.length;
/** A claimed row is invisible to other dispatchers for this long (covers slow SMTP). */
const CLAIM_MINUTES = 5;

export interface EnqueueInput {
  template: NotificationTemplate;
  orderId: string;
  recipient: string;
  dedupeKey: string;
  data?: Record<string, string>;
}

/** Queues an e-mail in the caller's transaction. Duplicates (same dedupe key) are ignored. */
export async function enqueueEmail(tx: DbExecutor, input: EnqueueInput): Promise<void> {
  await tx
    .insert(notifications)
    .values({ channel: "email", template: input.template, orderId: input.orderId, recipient: input.recipient, dedupeKey: input.dedupeKey, data: input.data ?? {} })
    .onConflictDoNothing({ target: notifications.dedupeKey });
}

export interface DispatchDeps {
  db: Db;
  mailer: Mailer;
  whatsapp: WhatsAppSender;
  log: FastifyBaseLogger;
  appPublicUrl: string;
}

type NotificationRow = typeof notifications.$inferSelect;

async function renderEmail(db: Db, row: NotificationRow, appPublicUrl: string): Promise<MailMessage | null> {
  if (!row.orderId) return null;
  const order = await db.query.orders.findFirst({ where: eq(orders.id, row.orderId), with: { items: { orderBy: [asc(orderItems.productName)] } } });
  if (!order) return null;
  const address = order.shippingAddress;
  const data: OrderEmailData = {
    to: row.recipient,
    customerName: order.customerName,
    orderNumber: order.number,
    orderUrl: `${appPublicUrl}/conta/pedidos/${order.id}`,
    items: order.items.map((item) => ({ name: item.productName, size: item.size, quantity: item.quantity, lineTotal: formatBrl(item.lineTotalMinor) })),
    subtotal: formatBrl(order.subtotalMinor),
    discount: order.discountMinor > 0 ? formatBrl(order.discountMinor) : null,
    shipping: formatBrl(order.shippingMinor),
    shippingService: order.shippingServiceName,
    total: formatBrl(order.totalMinor),
    destination: `${address.city}/${address.state} — CEP ${formatPostalCode(address.postalCode)}`,
    isDemo: order.isDemo,
  };
  switch (row.template) {
    case "order_received":
      return orderReceivedEmail({
        ...data,
        payUntil: order.reservationExpiresAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }),
      });
    case "order_paid":
      return orderPaidEmail(data);
    case "order_status_changed": {
      const status = (row.data.status ?? order.status) as keyof typeof orderStatusLabel;
      return orderStatusEmail({ ...data, statusLabel: orderStatusLabel[status], detail: row.data.detail ?? null });
    }
  }
}

/**
 * Sends due notifications. Rows are first claimed (attempts + 1, next attempt pushed forward) in a
 * short transaction with SKIP LOCKED, so several instances never send the same message, and the
 * slow network call happens outside any transaction. Errors are retried with backoff; after
 * MAX_ATTEMPTS the row is `failed` for an operator to inspect. Logs never include the recipient.
 */
export async function dispatchNotifications(deps: DispatchDeps, limit = 20): Promise<{ sent: number; failed: number; skipped: number }> {
  const now = new Date();
  const claimed = await deps.db.transaction(async (tx) => {
    const due = await tx
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.status, "pending"), lte(notifications.nextAttemptAt, now)))
      .orderBy(asc(notifications.nextAttemptAt))
      .limit(limit)
      .for("update", { skipLocked: true });
    if (due.length === 0) return [];
    return tx
      .update(notifications)
      .set({ attempts: sql`${notifications.attempts} + 1`, nextAttemptAt: new Date(now.getTime() + CLAIM_MINUTES * 60_000) })
      .where(inArray(notifications.id, due.map((row) => row.id)))
      .returning();
  });

  const result = { sent: 0, failed: 0, skipped: 0 };
  for (const row of claimed) {
    try {
      if (row.channel === "whatsapp") {
        const outcome = await deps.whatsapp.send({ to: row.recipient, template: row.template, parameters: [] });
        const sent = outcome.status === "sent";
        await deps.db
          .update(notifications)
          .set(sent ? { status: "sent", sentAt: new Date() } : { status: "skipped", lastError: outcome.reason })
          .where(eq(notifications.id, row.id));
        result[sent ? "sent" : "skipped"] += 1;
        continue;
      }
      const message = await renderEmail(deps.db, row, deps.appPublicUrl);
      if (!message) {
        await deps.db.update(notifications).set({ status: "skipped", lastError: "order_not_found" }).where(eq(notifications.id, row.id));
        result.skipped += 1;
        continue;
      }
      await deps.mailer.send(message);
      await deps.db.update(notifications).set({ status: "sent", sentAt: new Date(), lastError: null }).where(eq(notifications.id, row.id));
      result.sent += 1;
    } catch (error) {
      const exhausted = row.attempts >= MAX_ATTEMPTS;
      const delay = RETRY_BACKOFF_MINUTES[Math.min(row.attempts, MAX_ATTEMPTS - 1)]!;
      await deps.db
        .update(notifications)
        .set({
          status: exhausted ? "failed" : "pending",
          nextAttemptAt: new Date(Date.now() + delay * 60_000),
          lastError: error instanceof Error ? error.name : "unknown_error",
        })
        .where(eq(notifications.id, row.id));
      deps.log.warn({ notificationId: row.id, template: row.template, attempts: row.attempts, exhausted }, "notification delivery failed");
      result.failed += 1;
    }
  }
  return result;
}
