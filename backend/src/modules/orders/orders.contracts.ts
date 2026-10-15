import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { DbExecutor } from "../../db/client.js";
import { maskCpf, maskPhone } from "../../shared/br.js";
import { brl, moneySchema } from "../../shared/money.js";
import { payments } from "../payments/payments.schema.js";
import { shipments } from "../shipping/shipping.schema.js";
import { allowedTransitions, orderStatusLabel } from "./order-status.js";
import type { orders} from "./orders.schema.js";
import { orderItems, orderStatuses, orderStatusHistory } from "./orders.schema.js";

export const orderStatusSchema = z.enum(orderStatuses).meta({ id: "OrderStatus" });

const orderItemSchema = z
  .object({
    id: z.uuid(),
    productId: z.uuid(),
    productSlug: z.string(),
    productName: z.string(),
    variantId: z.uuid(),
    sku: z.string(),
    size: z.string(),
    color: z.string().nullable(),
    image: z.object({ url: z.string(), alt: z.string() }).nullable(),
    unitPrice: moneySchema.describe("Preço unitário no momento da compra (cópia imutável)."),
    compareAtUnitPrice: moneySchema.nullable(),
    quantity: z.number().int(),
    lineTotal: moneySchema,
    isDemo: z.boolean(),
  })
  .meta({ id: "OrderItem" });

const shippingAddressSchema = z
  .object({
    recipientName: z.string(),
    recipientDocumentMasked: z.string(),
    recipientPhoneMasked: z.string(),
    postalCode: z.string(),
    street: z.string(),
    number: z.string(),
    complement: z.string().nullable(),
    district: z.string(),
    city: z.string(),
    state: z.string(),
  })
  .meta({ id: "OrderShippingAddress" });

const orderPaymentSchema = z
  .object({
    provider: z.string(),
    environment: z.enum(["sandbox", "production"]).describe("`sandbox` = pagamento de teste, sem cobrança real."),
    status: z.string().describe("Estado no provedor: `created` (checkout aberto, sem pagamento), `pending`, `in_process`, `approved`, `rejected`, `cancelled`, `refunded`, `charged_back`."),
    statusDetail: z.string().nullable(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "OrderPayment" });

const trackingSchema = z
  .object({ status: z.string(), code: z.string().nullable(), carrier: z.string() })
  .meta({ id: "OrderTracking" });

export const orderSchema = z
  .object({
    id: z.uuid(),
    number: z.string().describe("Número exibido ao cliente, ex.: `UR001001`."),
    status: orderStatusSchema,
    statusLabel: z.string(),
    isDemo: z.boolean().describe("Pedido com itens do catálogo demonstrativo."),
    items: z.array(orderItemSchema),
    coupon: z.object({ code: z.string(), discount: moneySchema }).nullable(),
    shipping: z.object({
      provider: z.string(),
      serviceId: z.string(),
      name: z.string(),
      carrier: z.string(),
      price: moneySchema,
      deliveryDays: z.object({ min: z.number().int(), max: z.number().int() }),
      address: shippingAddressSchema,
      tracking: trackingSchema.nullable(),
    }),
    totals: z.object({ subtotal: moneySchema, discount: moneySchema, shipping: moneySchema, total: moneySchema }),
    payment: orderPaymentSchema.nullable().describe("Última tentativa de pagamento conhecida pelo servidor."),
    reservationExpiresAt: z.iso.datetime().describe("Enquanto `pending_payment`, os itens ficam reservados até aqui."),
    canPay: z.boolean().describe("true quando `POST /orders/{id}/payment` pode abrir/reabrir o checkout."),
    canCancel: z.boolean(),
    history: z.array(z.object({ status: orderStatusSchema, at: z.iso.datetime() })),
    createdAt: z.iso.datetime(),
    paidAt: z.iso.datetime().nullable(),
    cancelledAt: z.iso.datetime().nullable(),
  })
  .meta({ id: "Order" });

export const orderSummarySchema = z
  .object({
    id: z.uuid(),
    number: z.string(),
    status: orderStatusSchema,
    statusLabel: z.string(),
    itemCount: z.number().int(),
    total: moneySchema,
    isDemo: z.boolean(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: "OrderSummary" });

export const adminOrderSchema = orderSchema
  .extend({
    customer: z.object({ id: z.uuid(), name: z.string(), email: z.string() }),
    attentionReason: z
      .string()
      .nullable()
      .describe("`payment_amount_mismatch`, `paid_after_expiry_without_stock`, `paid_after_cancellation`, `chargeback`, `refund_required`."),
    allowedTransitions: z.array(orderStatusSchema),
    fullHistory: z.array(
      z.object({ from: orderStatusSchema.nullable(), to: orderStatusSchema, actor: z.string(), actorUserId: z.uuid().nullable(), note: z.string().nullable(), at: z.iso.datetime() }),
    ),
    payments: z.array(orderPaymentSchema.extend({ id: z.uuid(), providerPaymentId: z.string().nullable(), amount: moneySchema, liveMode: z.boolean().nullable() })),
    shipments: z.array(
      z.object({ id: z.uuid(), provider: z.string(), serviceId: z.string(), providerOrderId: z.string().nullable(), status: z.string(), trackingCode: z.string().nullable(), labelUrl: z.string().nullable() }),
    ),
  })
  .meta({ id: "AdminOrder" });

export type OrderView = z.infer<typeof orderSchema>;
export type AdminOrderView = z.infer<typeof adminOrderSchema>;

type OrderRow = typeof orders.$inferSelect;

async function loadOrderParts(db: DbExecutor, orderId: string) {
  const [items, history, paymentRows, shipmentRows] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(asc(orderItems.productName), asc(orderItems.size)),
    db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, orderId)).orderBy(asc(orderStatusHistory.createdAt)),
    db.select().from(payments).where(eq(payments.orderId, orderId)).orderBy(desc(payments.updatedAt)),
    db.select().from(shipments).where(eq(shipments.orderId, orderId)).orderBy(desc(shipments.createdAt)),
  ]);
  return { items, history, paymentRows, shipmentRows };
}

function buildView(order: OrderRow, parts: Awaited<ReturnType<typeof loadOrderParts>>, now = new Date()): OrderView {
  const address = order.shippingAddress;
  const [latestPayment] = parts.paymentRows;
  const [latestShipment] = parts.shipmentRows;
  const pending = order.status === "pending_payment" && order.reservationExpiresAt > now;
  return {
    id: order.id,
    number: order.number,
    status: order.status,
    statusLabel: orderStatusLabel[order.status],
    isDemo: order.isDemo,
    items: parts.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productSlug: item.productSlug,
      productName: item.productName,
      variantId: item.variantId,
      sku: item.sku,
      size: item.size,
      color: item.color,
      image: item.imageUrl && item.imageAlt ? { url: item.imageUrl, alt: item.imageAlt } : null,
      unitPrice: brl(item.unitPriceMinor),
      compareAtUnitPrice: item.compareAtUnitPriceMinor === null ? null : brl(item.compareAtUnitPriceMinor),
      quantity: item.quantity,
      lineTotal: brl(item.lineTotalMinor),
      isDemo: item.isDemo,
    })),
    coupon: order.couponCode ? { code: order.couponCode, discount: brl(order.discountMinor) } : null,
    shipping: {
      provider: order.shippingProvider,
      serviceId: order.shippingServiceId,
      name: order.shippingServiceName,
      carrier: order.shippingCarrier,
      price: brl(order.shippingMinor),
      deliveryDays: { min: order.shippingDeliveryDaysMin, max: order.shippingDeliveryDaysMax },
      address: {
        recipientName: address.recipientName,
        recipientDocumentMasked: maskCpf(address.recipientDocument),
        recipientPhoneMasked: maskPhone(address.recipientPhone),
        postalCode: address.postalCode,
        street: address.street,
        number: address.number,
        complement: address.complement,
        district: address.district,
        city: address.city,
        state: address.state,
      },
      tracking: latestShipment ? { status: latestShipment.status, code: latestShipment.trackingCode, carrier: order.shippingCarrier } : null,
    },
    totals: {
      subtotal: brl(order.subtotalMinor),
      discount: brl(order.discountMinor),
      shipping: brl(order.shippingMinor),
      total: brl(order.totalMinor),
    },
    payment: latestPayment
      ? {
          provider: latestPayment.provider,
          environment: latestPayment.environment === "production" ? "production" : "sandbox",
          status: latestPayment.status,
          statusDetail: latestPayment.statusDetail,
          updatedAt: latestPayment.updatedAt.toISOString(),
        }
      : null,
    reservationExpiresAt: order.reservationExpiresAt.toISOString(),
    canPay: pending && latestPayment?.status !== "approved",
    canCancel: order.status === "pending_payment",
    history: parts.history.map((entry) => ({ status: entry.toStatus, at: entry.createdAt.toISOString() })),
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
  };
}

export async function toOrderView(db: DbExecutor, order: OrderRow): Promise<OrderView> {
  return buildView(order, await loadOrderParts(db, order.id));
}

export async function toAdminOrderView(db: DbExecutor, order: OrderRow): Promise<AdminOrderView> {
  const parts = await loadOrderParts(db, order.id);
  return {
    ...buildView(order, parts),
    customer: { id: order.userId, name: order.customerName, email: order.customerEmail },
    attentionReason: order.attentionReason,
    allowedTransitions: [...allowedTransitions(order.status)],
    fullHistory: parts.history.map((entry) => ({
      from: entry.fromStatus,
      to: entry.toStatus,
      actor: entry.actor,
      actorUserId: entry.actorUserId,
      note: entry.note,
      at: entry.createdAt.toISOString(),
    })),
    payments: parts.paymentRows.map((row) => ({
      id: row.id,
      provider: row.provider,
      environment: row.environment === "production" ? "production" : "sandbox",
      status: row.status,
      statusDetail: row.statusDetail,
      updatedAt: row.updatedAt.toISOString(),
      providerPaymentId: row.providerPaymentId,
      amount: brl(row.amountMinor),
      liveMode: row.liveMode,
    })),
    shipments: parts.shipmentRows.map((row) => ({
      id: row.id,
      provider: row.provider,
      serviceId: row.serviceId,
      providerOrderId: row.providerOrderId,
      status: row.status,
      trackingCode: row.trackingCode,
      labelUrl: row.labelUrl,
    })),
  };
}

export function toOrderSummary(order: OrderRow, itemCount: number): z.infer<typeof orderSummarySchema> {
  return {
    id: order.id,
    number: order.number,
    status: order.status,
    statusLabel: orderStatusLabel[order.status],
    itemCount,
    total: brl(order.totalMinor),
    isDemo: order.isDemo,
    createdAt: order.createdAt.toISOString(),
  };
}
