import { asc, eq } from "drizzle-orm";
import type { Env } from "../../config/env.js";
import type { Db } from "../../db/client.js";
import { errors } from "../../shared/errors.js";
import { canTransition } from "../orders/order-status.js";
import { orderItems, orders } from "../orders/orders.schema.js";
import { lockOrder, transitionOrder } from "../orders/orders.service.js";
import { shipments } from "./shipping.schema.js";
import { consolidatePackage, ShippingProviderError, type LabelInfo, type LabelParty, type ShippingProvider } from "./shipping.provider.js";
import type { ShippingSettings } from "./shipping.service.js";

type ShipmentRow = typeof shipments.$inferSelect;

/** SuperFrete spells the cancelled status both ways in its documentation. */
function normaliseStatus(status: string): string {
  return status === "canceled" ? "cancelled" : status;
}

function senderFromEnv(env: Env): LabelParty | null {
  const { SHIPPING_SENDER_NAME, SHIPPING_SENDER_STREET, SHIPPING_SENDER_NUMBER, SHIPPING_SENDER_DISTRICT, SHIPPING_SENDER_CITY, SHIPPING_SENDER_STATE, SHIPPING_ORIGIN_POSTAL_CODE } = env;
  if (!SHIPPING_SENDER_NAME || !SHIPPING_SENDER_STREET || !SHIPPING_SENDER_NUMBER || !SHIPPING_SENDER_DISTRICT || !SHIPPING_SENDER_CITY || !SHIPPING_SENDER_STATE || !SHIPPING_ORIGIN_POSTAL_CODE) {
    return null;
  }
  return {
    name: SHIPPING_SENDER_NAME,
    ...(env.SHIPPING_SENDER_DOCUMENT ? { document: env.SHIPPING_SENDER_DOCUMENT } : {}),
    postalCode: SHIPPING_ORIGIN_POSTAL_CODE,
    street: SHIPPING_SENDER_STREET,
    number: SHIPPING_SENDER_NUMBER,
    complement: env.SHIPPING_SENDER_COMPLEMENT ?? null,
    district: SHIPPING_SENDER_DISTRICT,
    city: SHIPPING_SENDER_CITY,
    state: SHIPPING_SENDER_STATE,
  };
}

const labelUnavailable = () =>
  errors.serviceUnavailable("Provedor de etiquetas indisponível no momento.", [{ path: "shipping", message: "Provedor indisponível.", code: "shipping_unavailable" }]);

/**
 * Creates the label in the SuperFrete cart (status `pending`, NOT paid). Paying the label debits
 * the SuperFrete wallet and is done by an operator in the SuperFrete panel in this phase.
 */
export async function createShipmentLabel(
  deps: { db: Db; env: Env; provider: ShippingProvider | null; settings: ShippingSettings },
  orderId: string,
): Promise<ShipmentRow> {
  const { db, provider } = deps;
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw errors.notFound("Pedido não encontrado.");
  if (order.status !== "paid" && order.status !== "in_fulfillment") {
    throw errors.conflict("Etiquetas só podem ser criadas para pedidos pagos.", [{ path: "params.id", message: "Pedido não pago.", code: "order_not_shippable" }]);
  }
  if (!provider?.labels || provider.name !== order.shippingProvider) {
    throw errors.conflict("O provedor de frete do pedido não emite etiquetas nesta configuração.", [
      { path: "params.id", message: "Etiquetas indisponíveis.", code: "labels_unsupported" },
    ]);
  }
  const existing = await db.select().from(shipments).where(eq(shipments.orderId, order.id));
  if (existing.some((row) => row.status !== "cancelled")) {
    throw errors.conflict("O pedido já tem uma etiqueta ativa.", [{ path: "params.id", message: "Etiqueta existente.", code: "shipment_exists" }]);
  }
  const from = senderFromEnv(deps.env);
  if (!from) {
    throw errors.serviceUnavailable("Remetente não configurado (SHIPPING_SENDER_*).", [{ path: "shipping", message: "Remetente ausente.", code: "sender_not_configured" }]);
  }

  const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(asc(orderItems.productName));
  const variants = await db.query.productVariants.findMany({ where: (variant, { inArray }) => inArray(variant.id, lines.map((line) => line.variantId)) });
  const byId = new Map(variants.map((variant) => [variant.id, variant]));
  const { defaults } = deps.settings;
  const volume = consolidatePackage(
    lines.map((line) => {
      const variant = byId.get(line.variantId);
      return {
        quantity: line.quantity,
        weightGrams: variant?.weightGrams ?? defaults.weightGrams,
        heightCm: variant?.heightCm ?? defaults.heightCm,
        widthCm: variant?.widthCm ?? defaults.widthCm,
        lengthCm: variant?.lengthCm ?? defaults.lengthCm,
      };
    }),
  );
  const address = order.shippingAddress;

  let info: LabelInfo;
  try {
    info = await provider.labels.createLabel({
      serviceId: order.shippingServiceId,
      from,
      to: {
        name: address.recipientName,
        document: address.recipientDocument,
        phone: address.recipientPhone,
        email: order.customerEmail,
        postalCode: address.postalCode,
        street: address.street,
        number: address.number,
        complement: address.complement,
        district: address.district,
        city: address.city,
        state: address.state,
      },
      volume,
      products: lines.map((line) => ({ name: `${line.productName} (${line.size})`, quantity: line.quantity, unitValueMinor: line.unitPriceMinor })),
      declaredValueMinor: order.subtotalMinor - order.discountMinor,
      reference: order.number,
    });
  } catch (error) {
    if (error instanceof ShippingProviderError) throw labelUnavailable();
    throw error;
  }

  const [row] = await db
    .insert(shipments)
    .values({
      orderId: order.id,
      provider: provider.name,
      serviceId: order.shippingServiceId,
      providerOrderId: info.providerOrderId,
      status: normaliseStatus(info.status),
      trackingCode: info.trackingCode,
      labelUrl: info.labelUrl,
    })
    .returning();
  return row!;
}

/**
 * Applies the provider's label state to the shipment and moves the order forward
 * (posted → shipped, delivered → delivered). Never moves an order backwards.
 */
export async function applyLabelInfo(db: Db, shipment: ShipmentRow, info: LabelInfo, actorUserId: string | null = null): Promise<ShipmentRow> {
  return db.transaction(async (tx) => {
    const status = normaliseStatus(info.status);
    const now = new Date();
    const [updated] = await tx
      .update(shipments)
      .set({
        status,
        trackingCode: info.trackingCode ?? shipment.trackingCode,
        labelUrl: info.labelUrl ?? shipment.labelUrl,
        ...(status === "posted" && !shipment.postedAt ? { postedAt: now } : {}),
        ...(status === "delivered" && !shipment.deliveredAt ? { deliveredAt: now } : {}),
      })
      .where(eq(shipments.id, shipment.id))
      .returning();

    let order = await lockOrder(tx, shipment.orderId);
    if (!order) return updated!;
    const by = { actor: actorUserId ? ("admin" as const) : ("shipping_provider" as const), actorUserId };
    const trackingDetail = updated!.trackingCode ? `Código de rastreio: ${updated!.trackingCode}.` : null;
    if ((status === "posted" || status === "delivered") && canTransition(order.status, "shipped")) {
      order = await transitionOrder(tx, order, "shipped", { ...by, note: `etiqueta ${status}`, emailDetail: trackingDetail });
    }
    if (status === "delivered" && canTransition(order.status, "delivered")) {
      await transitionOrder(tx, order, "delivered", { ...by, note: "entrega confirmada pela transportadora" });
    }
    return updated!;
  });
}

export async function refreshShipment(db: Db, provider: ShippingProvider | null, shipment: ShipmentRow, actorUserId: string | null) {
  if (!provider?.labels || provider.name !== shipment.provider || !shipment.providerOrderId) {
    throw errors.conflict("Esta etiqueta não pode ser consultada nesta configuração.", [{ path: "params", message: "Indisponível.", code: "labels_unsupported" }]);
  }
  try {
    return await applyLabelInfo(db, shipment, await provider.labels.getLabel(shipment.providerOrderId), actorUserId);
  } catch (error) {
    if (error instanceof ShippingProviderError) throw labelUnavailable();
    throw error;
  }
}
