import { and, desc, eq, inArray, isNotNull, lt, or, sum, type SQL } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import type { Db } from "../../db/client.js";
import { errorResponseSchema, errors } from "../../shared/errors.js";
import { buildPage, decodeCursor, paginatedResponseSchema, paginationQuerySchema } from "../../shared/pagination.js";
import { auditActorFrom, recordAudit } from "../audit/audit.service.js";
import { protectAdminScope } from "../auth/auth.plugin.js";
import { createShipmentLabel, refreshShipment } from "../shipping/shipments.service.js";
import type { ShippingProvider } from "../shipping/shipping.provider.js";
import { shipments } from "../shipping/shipping.schema.js";
import type { ShippingSettings } from "../shipping/shipping.service.js";
import { operatorTargets } from "./order-status.js";
import { adminOrderSchema, orderStatusSchema, orderSummarySchema, toAdminOrderView, toOrderSummary } from "./orders.contracts.js";
import { orderItems, orders } from "./orders.schema.js";
import { flagAttention, lockOrder, releaseOrderHolds, restockOrder, transitionOrder } from "./orders.service.js";

export interface OrdersAdminRoutesOptions {
  db: Db;
  env: Env;
  shippingProvider: ShippingProvider | null;
  shippingSettings: ShippingSettings;
}

const sessionSecurity = [{ sessionCookie: [] }];
const adminErrors = { 401: errorResponseSchema, 403: errorResponseSchema };
const idParams = z.object({ id: z.uuid() });
const cursorShape = z.object({ c: z.string(), i: z.uuid() });

const adminOrderSummarySchema = orderSummarySchema
  .extend({ customerName: z.string(), attentionReason: z.string().nullable() })
  .meta({ id: "AdminOrderSummary" });

/**
 * Order administration. Status changes go to `order_status_history` (customer-facing timeline)
 * and every operator action also goes to the admin audit trail (E6).
 */
export const ordersAdminRoutes: FastifyPluginAsyncZod<OrdersAdminRoutesOptions> = async (app, { db, env, shippingProvider, shippingSettings }) => {
  protectAdminScope(app, "orders:manage");

  async function adminView(id: string) {
    const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!order) throw errors.notFound("Pedido não encontrado.");
    return toAdminOrderView(db, order);
  }

  app.get(
    "/admin/orders",
    {
      schema: {
        tags: ["admin"],
        summary: "Lista pedidos (mais recentes primeiro)",
        security: sessionSecurity,
        querystring: paginationQuerySchema.extend({
          status: orderStatusSchema.optional(),
          attention: z.enum(["true"]).optional().describe("Somente pedidos que exigem ação do operador."),
        }),
        response: { 200: paginatedResponseSchema(adminOrderSummarySchema).meta({ id: "AdminOrderList" }), ...adminErrors },
      },
    },
    async (request) => {
      const { limit, cursor, status, attention } = request.query;
      const conditions: (SQL | undefined)[] = [status ? eq(orders.status, status) : undefined, attention ? isNotNull(orders.attentionReason) : undefined];
      if (cursor) {
        const after = decodeCursor(cursor, cursorShape);
        conditions.push(or(lt(orders.createdAt, new Date(after.c)), and(eq(orders.createdAt, new Date(after.c)), lt(orders.id, after.i))));
      }
      const rows = await db.select().from(orders).where(and(...conditions)).orderBy(desc(orders.createdAt), desc(orders.id)).limit(limit + 1);
      const totals = rows.length
        ? await db
            .select({ orderId: orderItems.orderId, quantity: sum(orderItems.quantity).mapWith(Number) })
            .from(orderItems)
            .where(inArray(orderItems.orderId, rows.map((row) => row.id)))
            .groupBy(orderItems.orderId)
        : [];
      const quantities = new Map(totals.map((row) => [row.orderId, row.quantity]));
      return buildPage(rows, limit, (row) => ({ c: row.createdAt.toISOString(), i: row.id }), (row) => ({
        ...toOrderSummary(row, quantities.get(row.id) ?? 0),
        customerName: row.customerName,
        attentionReason: row.attentionReason,
      }));
    },
  );

  app.get(
    "/admin/orders/:id",
    {
      schema: {
        tags: ["admin"],
        summary: "Detalhe completo do pedido (pagamentos, etiquetas, histórico com autores)",
        security: sessionSecurity,
        params: idParams,
        response: { 200: adminOrderSchema, 404: errorResponseSchema, ...adminErrors },
      },
    },
    async (request) => adminView(request.params.id),
  );

  app.post(
    "/admin/orders/:id/transitions",
    {
      schema: {
        tags: ["admin"],
        summary: "Avança o pedido (separação, envio, entrega) ou cancela",
        description:
          "Pagamento e estorno são definidos pelo Mercado Pago, não por esta rota. Cancelar pedido pendente libera estoque e cupom; " +
          "cancelar pedido pago devolve o estoque e marca `attentionReason = refund_required` (estorno manual no Mercado Pago).",
        security: sessionSecurity,
        params: idParams,
        body: z.object({ to: z.enum(operatorTargets), note: z.string().trim().min(1).max(500).optional() }),
        response: { 200: adminOrderSchema, 404: errorResponseSchema, 409: errorResponseSchema, ...adminErrors },
      },
    },
    async (request) => {
      const actorUserId = request.principal!.userId;
      await db.transaction(async (tx) => {
        const order = await lockOrder(tx, request.params.id);
        if (!order) throw errors.notFound("Pedido não encontrado.");
        const { to, note } = request.body;
        if (to === "cancelled") {
          if (order.status === "pending_payment") await releaseOrderHolds(tx, order.id);
          else if (order.status === "paid" || order.status === "in_fulfillment") {
            await restockOrder(tx, order);
            await flagAttention(tx, order.id, "refund_required");
          }
        }
        const updated = await transitionOrder(tx, order, to, { actor: "admin", actorUserId, note: note ?? null });
        await recordAudit(tx, auditActorFrom(request), {
          action: "order.transition",
          resourceType: "order",
          resourceId: order.id,
          changes: { status: { from: order.status, to }, ...(updated.attentionReason !== order.attentionReason ? { attentionReason: { from: order.attentionReason, to: updated.attentionReason } } : {}) },
          metadata: { orderNumber: order.number, ...(note ? { note } : {}) },
        });
      });
      request.log.info({ orderId: request.params.id, to: request.body.to, actorId: actorUserId }, "order transition by operator");
      return adminView(request.params.id);
    },
  );

  app.post(
    "/admin/orders/:id/shipments",
    {
      schema: {
        tags: ["admin"],
        summary: "Cria a etiqueta na SuperFrete (fica `pending` no carrinho da SuperFrete; não paga)",
        description: "Pagar a etiqueta debita a carteira SuperFrete e é feito manualmente no painel da SuperFrete nesta fase.",
        security: sessionSecurity,
        params: idParams,
        response: { 200: adminOrderSchema, 404: errorResponseSchema, 409: errorResponseSchema, 503: errorResponseSchema, ...adminErrors },
      },
    },
    async (request) => {
      const shipment = await createShipmentLabel({ db, env, provider: shippingProvider, settings: shippingSettings }, request.params.id);
      // The label lives at the provider and cannot be rolled back with our transaction; audit right after it exists.
      await recordAudit(db, auditActorFrom(request), {
        action: "order.shipment_create",
        resourceType: "order",
        resourceId: request.params.id,
        metadata: { shipmentId: shipment.id, provider: shipment.provider, status: shipment.status },
      });
      request.log.info({ orderId: request.params.id, shipmentId: shipment.id, actorId: request.principal!.userId }, "shipping label created");
      return adminView(request.params.id);
    },
  );

  app.post(
    "/admin/orders/:id/shipments/:shipmentId/sync",
    {
      schema: {
        tags: ["admin"],
        summary: "Atualiza status/rastreio da etiqueta consultando a SuperFrete",
        security: sessionSecurity,
        params: z.object({ id: z.uuid(), shipmentId: z.uuid() }),
        response: { 200: adminOrderSchema, 404: errorResponseSchema, 409: errorResponseSchema, 503: errorResponseSchema, ...adminErrors },
      },
    },
    async (request) => {
      const [shipment] = await db
        .select()
        .from(shipments)
        .where(and(eq(shipments.id, request.params.shipmentId), eq(shipments.orderId, request.params.id)))
        .limit(1);
      if (!shipment) throw errors.notFound("Etiqueta não encontrada.");
      const refreshed = await refreshShipment(db, shippingProvider, shipment, request.principal!.userId);
      await recordAudit(db, auditActorFrom(request), {
        action: "order.shipment_sync",
        resourceType: "order",
        resourceId: request.params.id,
        metadata: { shipmentId: shipment.id, statusBefore: shipment.status, statusAfter: refreshed.status },
      });
      return adminView(request.params.id);
    },
  );
};
