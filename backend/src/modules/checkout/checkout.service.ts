import { createHash } from "node:crypto";
import { and, count, desc, eq, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import { z } from "zod";
import type { Db, DbExecutor, DbTransaction } from "../../db/client.js";
import { pgError, PG_UNIQUE_VIOLATION } from "../../shared/db-errors.js";
import { errors, type ErrorDetail } from "../../shared/errors.js";
import { brl, formatBrl, moneySchema, type Money } from "../../shared/money.js";
import { users } from "../accounts/accounts.schema.js";
import { addresses } from "../addresses/addresses.schema.js";
import { couponStateIssue, type CouponIssue } from "../cart/cart.pricing.js";
import { cartItems, carts } from "../cart/cart.schema.js";
import { couponIssueMessage, lockCart } from "../cart/cart.service.js";
import { inventoryLevels } from "../catalog/catalog.schema.js";
import { coupons } from "../marketing/marketing.schema.js";
import { enqueueEmail } from "../notifications/notifications.service.js";
import { toOrderView, type OrderView } from "../orders/orders.contracts.js";
import {
  couponRedemptions,
  idempotencyKeys,
  orderItems,
  orders,
  orderStatusHistory,
  shippingQuotes,
  stockReservations,
  type QuoteOptionSnapshot,
} from "../orders/orders.schema.js";
import { PaymentGatewayError, type PaymentGateway } from "../payments/mercadopago.client.js";
import { payments } from "../payments/payments.schema.js";
import { assertCartPurchasable, cartFingerprint, priceCartById, type PricedCartLines } from "../shipping/shipping.service.js";

export const checkoutBodySchema = z.object({
  addressId: z.uuid(),
  quoteId: z.uuid().describe("`id` de `POST /shipping/quotes` para o CEP do endereço escolhido."),
  serviceId: z.string().min(1).max(10).describe("`serviceId` de uma das opções da cotação."),
  expectedTotal: moneySchema
    .optional()
    .describe("Total exibido ao cliente. Se divergir do total do servidor, o pedido NÃO é criado (409 `total_changed`). Nunca é usado como valor cobrado."),
});

export type CheckoutBody = z.infer<typeof checkoutBodySchema>;

export const checkoutSummarySchema = z
  .object({
    items: z.array(
      z.object({
        variantId: z.uuid(),
        productName: z.string(),
        size: z.string(),
        quantity: z.number().int(),
        unitPrice: moneySchema,
        lineTotal: moneySchema,
      }),
    ),
    coupon: z.object({ code: z.string(), discount: moneySchema }).nullable(),
    shipping: z.object({ serviceId: z.string(), name: z.string(), carrier: z.string(), price: moneySchema, deliveryDays: z.object({ min: z.number().int(), max: z.number().int() }) }),
    totals: z.object({ subtotal: moneySchema, discount: moneySchema, shipping: moneySchema, total: moneySchema }),
    reservationMinutes: z.number().int().describe("Tempo de reserva do estoque após criar o pedido."),
    isDemo: z.boolean(),
  })
  .meta({ id: "CheckoutSummary" });

export const paymentSessionSchema = z
  .object({
    provider: z.literal("mercado_pago"),
    environment: z.enum(["sandbox", "production"]),
    checkoutUrl: z.string().describe("Redirecionar o cliente para esta URL (Checkout Pro). Não confirma nada por si só."),
    expiresAt: z.iso.datetime(),
  })
  .meta({ id: "PaymentSession" });

export type PaymentSession = z.infer<typeof paymentSessionSchema>;

export interface CheckoutDeps {
  db: Db;
  gateway: PaymentGateway | null;
  log: FastifyBaseLogger;
  reservationMinutes: number;
  appPublicUrl: string;
}

const conflict = (message: string, code: string, path = "body") => errors.conflict(message, [{ path, message, code }]);

// --- Pricing the checkout --------------------------------------------------------------------

interface CheckoutPricing {
  priced: PricedCartLines;
  option: QuoteOptionSnapshot;
  quoteProvider: string;
  address: typeof addresses.$inferSelect;
  subtotalMinor: number;
  discountMinor: number;
  shippingMinor: number;
  totalMinor: number;
}

function couponConflict(issue: CouponIssue, coupon?: { minSubtotalMinor: number }) {
  const message = couponIssueMessage(issue, coupon);
  return errors.conflict(message, [{ path: "cart.coupon", message, code: issue }]);
}

/**
 * Recomputes everything from server data: cart lines and prices, stock, coupon, address and the
 * stored freight quote. Nothing priced comes from the request.
 */
async function priceCheckout(db: DbExecutor, userId: string, cart: { id: string; couponId: string | null }, body: CheckoutBody): Promise<CheckoutPricing> {
  const [address] = await db.select().from(addresses).where(and(eq(addresses.id, body.addressId), eq(addresses.userId, userId))).limit(1);
  if (!address) throw errors.validation([{ path: "body.addressId", message: "Endereço não encontrado.", code: "address_not_found" }]);

  const priced = await priceCartById(db, cart.id, cart.couponId, { authenticated: true });
  assertCartPurchasable(priced);
  if (priced.pricing.coupon && !priced.pricing.coupon.ok) throw couponConflict(priced.pricing.coupon.issue, priced.coupon ?? undefined);

  const [quote] = await db.select().from(shippingQuotes).where(eq(shippingQuotes.id, body.quoteId)).limit(1);
  if (!quote || quote.cartId !== cart.id || quote.expiresAt <= new Date() || quote.cartFingerprint !== cartFingerprint(priced.lines)) {
    throw conflict("A cotação de frete expirou ou a sacola mudou. Cote o frete novamente.", "shipping_quote_expired", "body.quoteId");
  }
  if (quote.postalCode !== address.postalCode) {
    throw conflict("A cotação de frete foi feita para outro CEP.", "shipping_quote_mismatch", "body.quoteId");
  }
  const option = quote.options.find((candidate) => candidate.serviceId === body.serviceId);
  if (!option) throw errors.validation([{ path: "body.serviceId", message: "Modalidade de frete indisponível.", code: "shipping_option_invalid" }]);

  const subtotalMinor = priced.pricing.subtotalMinor;
  const discountMinor = priced.pricing.discountMinor;
  return {
    priced,
    option,
    quoteProvider: quote.provider,
    address,
    subtotalMinor,
    discountMinor,
    shippingMinor: option.priceMinor,
    totalMinor: subtotalMinor - discountMinor + option.priceMinor,
  };
}

function toSummary(pricing: CheckoutPricing, reservationMinutes: number): z.infer<typeof checkoutSummarySchema> {
  const { priced, option } = pricing;
  return {
    items: priced.lines.map((line, index) => ({
      variantId: line.variantId,
      productName: line.variant.product.name,
      size: line.variant.size,
      quantity: line.quantity,
      unitPrice: brl(line.variant.priceMinor),
      lineTotal: brl(priced.pricing.lines[index]!.lineTotalMinor),
    })),
    coupon: priced.coupon && pricing.discountMinor > 0 ? { code: priced.coupon.code, discount: brl(pricing.discountMinor) } : null,
    shipping: {
      serviceId: option.serviceId,
      name: option.name,
      carrier: option.carrier,
      price: brl(option.priceMinor),
      deliveryDays: { min: option.deliveryDaysMin, max: option.deliveryDaysMax },
    },
    totals: {
      subtotal: brl(pricing.subtotalMinor),
      discount: brl(pricing.discountMinor),
      shipping: brl(pricing.shippingMinor),
      total: brl(pricing.totalMinor),
    },
    reservationMinutes,
    isDemo: priced.lines.some((line) => line.variant.product.isDemo),
  };
}

export async function previewCheckout(deps: CheckoutDeps, userId: string, cart: { id: string; couponId: string | null }, body: CheckoutBody) {
  return toSummary(await priceCheckout(deps.db, userId, cart, body), deps.reservationMinutes);
}

function assertExpectedTotal(expected: Money | undefined, totalMinor: number) {
  if (expected && expected.amountMinor !== totalMinor) {
    throw conflict(`O total foi atualizado para ${formatBrl(totalMinor)}. Revise o pedido antes de continuar.`, "total_changed", "body.expectedTotal");
  }
}

// --- Placing the order -----------------------------------------------------------------------

/** Holds stock for each line; fails the whole transaction when any line no longer fits. */
async function reserveStock(tx: DbTransaction, orderId: string, lines: PricedCartLines["lines"], expiresAt: Date) {
  const sorted = [...lines].sort((a, b) => a.variantId.localeCompare(b.variantId));
  const shortages: ErrorDetail[] = [];
  for (const line of sorted) {
    const held = await tx
      .update(inventoryLevels)
      .set({ reserved: sql`${inventoryLevels.reserved} + ${line.quantity}` })
      .where(and(eq(inventoryLevels.variantId, line.variantId), sql`${inventoryLevels.onHand} - ${inventoryLevels.reserved} >= ${line.quantity}`))
      .returning({ variantId: inventoryLevels.variantId });
    if (held.length === 0) {
      shortages.push({ path: `cart.items.${lines.indexOf(line)}`, message: `${line.variant.product.name} (${line.variant.size}) sem estoque suficiente.`, code: "insufficient_stock" });
    }
  }
  if (shortages.length > 0) {
    throw errors.conflict("Alguns itens acabaram de esgotar. Revise a sacola.", shortages);
  }
  await tx.insert(stockReservations).values(sorted.map((line) => ({ orderId, variantId: line.variantId, quantity: line.quantity, expiresAt })));
}

/** Locks the coupon row so the total and per-customer limits cannot be exceeded concurrently. */
async function redeemCoupon(tx: DbTransaction, couponId: string, userId: string, orderId: string, discountMinor: number) {
  const [coupon] = await tx.select().from(coupons).where(eq(coupons.id, couponId)).for("update");
  if (!coupon) throw couponConflict("coupon_invalid");
  const stateIssue = couponStateIssue(coupon, { now: new Date(), authenticated: true });
  if (stateIssue) throw couponConflict(stateIssue, coupon);
  if (coupon.perCustomerLimit !== null) {
    const [{ used } = { used: 0 }] = await tx
      .select({ used: count() })
      .from(couponRedemptions)
      .where(and(eq(couponRedemptions.couponId, couponId), eq(couponRedemptions.userId, userId), eq(couponRedemptions.status, "active")));
    if (used >= coupon.perCustomerLimit) throw couponConflict("coupon_usage_exhausted", coupon);
  }
  await tx.insert(couponRedemptions).values({ couponId, userId, orderId, discountMinor });
  await tx.update(coupons).set({ timesRedeemed: sql`${coupons.timesRedeemed} + 1` }).where(eq(coupons.id, couponId));
  return coupon;
}

/**
 * Creates the order atomically: cart lock → server pricing → stock reservation → coupon use →
 * immutable snapshots → history → confirmation e-mail queued → cart emptied. Any failure rolls
 * everything back.
 */
export async function placeOrder(deps: CheckoutDeps, userId: string, cartId: string, body: CheckoutBody) {
  return deps.db.transaction(async (tx) => {
    const cart = await lockCart(tx, cartId);
    if (cart.userId !== userId) throw errors.notFound("Sacola não encontrada.");
    const pricing = await priceCheckout(tx, userId, cart, body);
    assertExpectedTotal(body.expectedTotal, pricing.totalMinor);

    const [customer] = await tx.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    if (!customer) throw errors.unauthenticated();

    const reservationExpiresAt = new Date(Date.now() + deps.reservationMinutes * 60_000);
    const { address, option, priced } = pricing;
    const [order] = await tx
      .insert(orders)
      .values({
        userId,
        customerName: customer.name,
        customerEmail: customer.email,
        shippingAddress: {
          recipientName: address.recipientName,
          recipientDocument: address.recipientDocument,
          recipientPhone: address.recipientPhone,
          postalCode: address.postalCode,
          street: address.street,
          number: address.number,
          complement: address.complement,
          district: address.district,
          city: address.city,
          state: address.state,
        },
        shippingProvider: pricing.quoteProvider,
        shippingServiceId: option.serviceId,
        shippingServiceName: option.name,
        shippingCarrier: option.carrier,
        shippingDeliveryDaysMin: option.deliveryDaysMin,
        shippingDeliveryDaysMax: option.deliveryDaysMax,
        couponId: pricing.discountMinor > 0 ? priced.coupon!.id : null,
        couponCode: pricing.discountMinor > 0 ? priced.coupon!.code : null,
        subtotalMinor: pricing.subtotalMinor,
        discountMinor: pricing.discountMinor,
        shippingMinor: pricing.shippingMinor,
        totalMinor: pricing.totalMinor,
        isDemo: priced.lines.some((line) => line.variant.product.isDemo),
        reservationExpiresAt,
      })
      .returning();
    if (!order) throw new Error("order insert returned no row");

    await tx.insert(orderItems).values(
      priced.lines.map((line, index) => {
        const [media] = line.variant.product.media;
        return {
          orderId: order.id,
          variantId: line.variantId,
          productId: line.variant.product.id,
          productSlug: line.variant.product.slug,
          productName: line.variant.product.name,
          sku: line.variant.sku,
          size: line.variant.size,
          color: line.variant.color,
          imageUrl: media?.url ?? null,
          imageAlt: media?.alt ?? null,
          unitPriceMinor: line.variant.priceMinor,
          compareAtUnitPriceMinor: line.variant.compareAtPriceMinor,
          quantity: line.quantity,
          lineTotalMinor: priced.pricing.lines[index]!.lineTotalMinor,
          isDemo: line.variant.product.isDemo,
        };
      }),
    );
    await reserveStock(tx, order.id, priced.lines, reservationExpiresAt);
    if (order.couponId) await redeemCoupon(tx, order.couponId, userId, order.id, pricing.discountMinor);

    await tx.insert(orderStatusHistory).values({ orderId: order.id, fromStatus: null, toStatus: "pending_payment", actor: "customer", actorUserId: userId });
    await enqueueEmail(tx, { template: "order_received", orderId: order.id, recipient: customer.email, dedupeKey: `order:${order.id}:received` });

    await tx.delete(cartItems).where(eq(cartItems.cartId, cart.id));
    await tx.update(carts).set({ couponId: null, updatedAt: new Date() }).where(eq(carts.id, cart.id));
    return order;
  });
}

// --- Payment ---------------------------------------------------------------------------------

/**
 * Opens (or reuses) a Checkout Pro session for a pending order. The provider idempotency key is
 * derived from the order and attempt number, so a retried call after a timeout does not create a
 * second preference.
 */
export async function startPayment(deps: CheckoutDeps, order: typeof orders.$inferSelect): Promise<PaymentSession> {
  if (!deps.gateway) {
    throw errors.serviceUnavailable("Pagamento indisponível no momento.", [{ path: "payment", message: "Provedor desativado.", code: "payment_unavailable" }]);
  }
  if (order.status !== "pending_payment" || order.reservationExpiresAt <= new Date()) {
    throw conflict("Este pedido não aceita mais pagamento.", "order_not_payable");
  }
  const [latest] = await deps.db.select().from(payments).where(eq(payments.orderId, order.id)).orderBy(desc(payments.createdAt)).limit(1);
  if (latest?.status === "approved") throw conflict("Este pedido já foi pago.", "order_not_payable");
  if (latest?.checkoutUrl && (latest.status === "created" || latest.status === "pending" || latest.status === "in_process")) {
    return { provider: "mercado_pago", environment: deps.gateway.environment, checkoutUrl: latest.checkoutUrl, expiresAt: order.reservationExpiresAt.toISOString() };
  }

  const [{ attempts } = { attempts: 0 }] = await deps.db.select({ attempts: count() }).from(payments).where(eq(payments.orderId, order.id));
  let session;
  try {
    session = await deps.gateway.createCheckout({
      orderId: order.id,
      orderNumber: order.number,
      totalMinor: order.totalMinor,
      payer: { email: order.customerEmail, name: order.customerName },
      expiresAt: order.reservationExpiresAt,
      returnUrl: `${deps.appPublicUrl}/checkout/retorno?pedido=${order.id}`,
      idempotencyKey: `usrock-${order.id}-${attempts + 1}`,
    });
  } catch (error) {
    if (error instanceof PaymentGatewayError) {
      deps.log.warn({ orderId: order.id, paymentError: error.kind, providerStatus: error.status }, "payment checkout creation failed");
      throw errors.serviceUnavailable("Não foi possível abrir o pagamento agora. Tente novamente em instantes.", [
        { path: "payment", message: "Provedor de pagamento indisponível.", code: "payment_unavailable" },
      ]);
    }
    throw error;
  }
  await deps.db.insert(payments).values({
    orderId: order.id,
    provider: deps.gateway.provider,
    environment: deps.gateway.environment,
    providerPreferenceId: session.preferenceId,
    checkoutUrl: session.checkoutUrl,
    status: "created",
    amountMinor: order.totalMinor,
  });
  return { provider: "mercado_pago", environment: deps.gateway.environment, checkoutUrl: session.checkoutUrl, expiresAt: order.reservationExpiresAt.toISOString() };
}

// --- Idempotency -----------------------------------------------------------------------------

export const IDEMPOTENCY_SCOPE = "checkout";
export const IDEMPOTENCY_TTL_HOURS = 24;
export const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9_:-]{16,128}$/, "Idempotency-Key deve ter 16–128 caracteres [A-Za-z0-9_:-].");

export function requestHash(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

export type IdempotencyStart = { kind: "new"; id: string } | { kind: "replay"; status: number; body: unknown };

/**
 * Registers the key before doing any work. A completed key with the same request replays the
 * stored response; a key still processing or reused with a different request is refused.
 */
export async function beginIdempotent(db: Db, userId: string, key: string, hash: string): Promise<IdempotencyStart> {
  await db.delete(idempotencyKeys).where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, key), sql`${idempotencyKeys.expiresAt} <= now()`));
  try {
    const [row] = await db
      .insert(idempotencyKeys)
      .values({ userId, scope: IDEMPOTENCY_SCOPE, key, requestHash: hash, expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_HOURS * 3_600_000) })
      .returning({ id: idempotencyKeys.id });
    return { kind: "new", id: row!.id };
  } catch (error) {
    if (pgError(error)?.code !== PG_UNIQUE_VIOLATION) throw error;
  }
  const [existing] = await db
    .select()
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.scope, IDEMPOTENCY_SCOPE), eq(idempotencyKeys.key, key)))
    .limit(1);
  if (!existing) throw conflict("Requisição em andamento. Tente novamente.", "idempotency_in_progress", "headers.idempotency-key");
  if (existing.requestHash !== hash) {
    throw conflict("Esta Idempotency-Key já foi usada com outro pedido.", "idempotency_key_reused", "headers.idempotency-key");
  }
  if (existing.status !== "completed") {
    throw conflict("Este pedido ainda está sendo processado.", "idempotency_in_progress", "headers.idempotency-key");
  }
  return { kind: "replay", status: existing.responseStatus ?? 201, body: existing.responseBody };
}

export async function completeIdempotent(db: Db, id: string, status: number, body: unknown, orderId: string) {
  await db.update(idempotencyKeys).set({ status: "completed", responseStatus: status, responseBody: body, orderId }).where(eq(idempotencyKeys.id, id));
}

/** Business failures are not stored: the same key may be retried after the customer fixes the cart. */
export async function abandonIdempotent(db: Db, id: string) {
  await db.delete(idempotencyKeys).where(eq(idempotencyKeys.id, id));
}

export async function orderViewById(db: DbExecutor, orderId: string): Promise<OrderView> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw errors.notFound("Pedido não encontrado.");
  return toOrderView(db, order);
}
