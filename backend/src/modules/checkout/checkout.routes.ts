import { and, desc, eq, inArray, lt, or, sum } from "drizzle-orm";
import type { FastifyPluginAsyncZod, ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import type { Db } from "../../db/client.js";
import { postalCodeSchema } from "../../shared/br.js";
import { AppError, errorResponseSchema, errors } from "../../shared/errors.js";
import { buildPage, decodeCursor, paginatedResponseSchema, paginationQuerySchema } from "../../shared/pagination.js";
import { requireAuth } from "../auth/auth.plugin.js";
import { createCartResolver } from "../cart/cart.routes.js";
import { orderSchema, orderSummarySchema, toOrderSummary, toOrderView } from "../orders/orders.contracts.js";
import { orderItems, orders } from "../orders/orders.schema.js";
import { lockOrder, releaseOrderHolds, syncOrderPayments, transitionOrder } from "../orders/orders.service.js";
import { PaymentGatewayError, type PaymentGateway } from "../payments/mercadopago.client.js";
import type { ShippingProvider } from "../shipping/shipping.provider.js";
import { quoteCart, shippingQuoteSchema, type ShippingSettings } from "../shipping/shipping.service.js";
import {
  abandonIdempotent,
  beginIdempotent,
  checkoutBodySchema,
  checkoutSummarySchema,
  completeIdempotent,
  idempotencyKeySchema,
  orderViewById,
  paymentSessionSchema,
  placeOrder,
  previewCheckout,
  requestHash,
  startPayment,
  type CheckoutDeps,
} from "./checkout.service.js";

export interface CheckoutRoutesOptions {
  db: Db;
  env: Env;
  gateway: PaymentGateway | null;
  shippingProvider: ShippingProvider | null;
  shippingSettings: ShippingSettings;
}

const sessionSecurity = [{ sessionCookie: [] }];
const QUOTE_WINDOW = 15 * 60_000;

const checkoutResultSchema = z
  .object({
    order: orderSchema,
    payment: paymentSessionSchema.nullable().describe("null quando o provedor de pagamento falhou; o pedido existe e `POST /orders/{id}/payment` tenta de novo."),
  })
  .meta({ id: "CheckoutResult" });

const orderParamsSchema = z.object({ id: z.uuid() });
const orderListSchema = paginatedResponseSchema(orderSummarySchema).meta({ id: "OrderList" });
const orderCursorSchema = z.object({ c: z.string(), i: z.uuid() });

export const checkoutRoutes: FastifyPluginAsyncZod<CheckoutRoutesOptions> = async (app, { db, env, gateway, shippingProvider, shippingSettings }) => {
  const { existingCart } = createCartResolver(db, env);
  const deps: CheckoutDeps = { db, gateway, log: app.log, reservationMinutes: env.CHECKOUT_RESERVATION_MINUTES, appPublicUrl: env.APP_PUBLIC_URL };

  app.addHook("onSend", async (_request, reply) => {
    reply.header("cache-control", "no-store");
  });

  const emptyCart = () => errors.conflict("A sacola está vazia.", [{ path: "cart", message: "Sacola vazia.", code: "cart_empty" }]);

  app.post(
    "/shipping/quotes",
    {
      config: { rateLimit: { max: env.SHIPPING_QUOTE_RATE_LIMIT_MAX, timeWindow: QUOTE_WINDOW } },
      schema: {
        tags: ["shipping"],
        summary: "Cota o frete da sacola atual para um CEP",
        description:
          "Itens, pesos e valores vêm da sacola no servidor. A cotação vale por alguns minutos e só para o conteúdo atual da sacola. " +
          "Erros: `409` `cart_empty`/`cart_has_issues`; `400` `shipping_rejected`; `503` `shipping_unavailable`. " +
          "Limite por IP: `SHIPPING_QUOTE_RATE_LIMIT_MAX` cotações por 15 min (padrão 30).",
        body: z.object({ postalCode: postalCodeSchema }),
        response: { 200: shippingQuoteSchema, 409: errorResponseSchema, 503: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const { cart, authenticated } = await existingCart(request, reply);
      if (!cart) throw emptyCart();
      return quoteCart({ db, provider: shippingProvider, settings: shippingSettings, log: request.log }, cart, request.body.postalCode, { authenticated });
    },
  );

  // Everything below belongs to a signed-in customer.
  await app.register(async (scope) => {
    const customer = scope.withTypeProvider<ZodTypeProvider>();
    customer.addHook("preValidation", requireAuth);

    async function customerCart(request: Parameters<typeof existingCart>[0], reply: Parameters<typeof existingCart>[1]) {
      const { cart } = await existingCart(request, reply);
      if (!cart) throw emptyCart();
      return cart;
    }

    customer.post(
      "/checkouts/preview",
      {
        schema: {
          tags: ["checkout"],
          summary: "Resumo do checkout recalculado no servidor (sem efeitos)",
          description: "Mesmas validações do `POST /checkouts`, sem reservar estoque nem criar pedido.",
          security: sessionSecurity,
          body: checkoutBodySchema.omit({ expectedTotal: true }),
          response: { 200: checkoutSummarySchema, 401: errorResponseSchema, 409: errorResponseSchema },
        },
      },
      async (request, reply) => previewCheckout(deps, request.principal!.userId, await customerCart(request, reply), request.body),
    );

    customer.post(
      "/checkouts",
      {
        schema: {
          tags: ["checkout"],
          summary: "Cria o pedido (reserva estoque) e abre o pagamento no Mercado Pago",
          description:
            "Exige `Idempotency-Key` (16–128 caracteres; gere um por tentativa de compra e reutilize-o ao repetir a mesma requisição). " +
            "A mesma chave com o mesmo corpo devolve a mesma resposta sem criar outro pedido; com outro corpo → `409 idempotency_key_reused`. " +
            "O pedido nasce `pending_payment`; só o Mercado Pago (webhook/consulta à API) o confirma.",
          security: sessionSecurity,
          headers: z.object({ "idempotency-key": idempotencyKeySchema }),
          body: checkoutBodySchema,
          response: { 201: checkoutResultSchema, 401: errorResponseSchema, 409: errorResponseSchema, 503: errorResponseSchema },
        },
      },
      async (request, reply) => {
        const userId = request.principal!.userId;
        const cart = await customerCart(request, reply);
        const started = await beginIdempotent(db, userId, request.headers["idempotency-key"], requestHash(request.body));
        if (started.kind === "replay") {
          reply.header("idempotent-replayed", "true");
          return reply.status(started.status as 201).send(started.body as z.infer<typeof checkoutResultSchema>);
        }

        let order;
        try {
          order = await placeOrder(deps, userId, cart.id, request.body);
        } catch (error) {
          await abandonIdempotent(db, started.id);
          throw error;
        }
        request.log.info({ orderId: order.id, orderNumber: order.number }, "order placed");

        let payment = null;
        try {
          payment = await startPayment(deps, order);
        } catch (error) {
          // The order exists and holds stock; the customer can retry the payment step.
          if (!(error instanceof AppError) || error.statusCode !== 503) throw error;
        }
        const body = { order: await toOrderView(db, order), payment };
        await completeIdempotent(db, started.id, 201, body, order.id);
        return reply.status(201).send(body);
      },
    );

    async function ownOrder(userId: string, id: string) {
      const [order] = await db.select().from(orders).where(and(eq(orders.id, id), eq(orders.userId, userId))).limit(1);
      if (!order) throw errors.notFound("Pedido não encontrado.");
      return order;
    }

    customer.get(
      "/orders",
      {
        schema: {
          tags: ["orders"],
          summary: "Pedidos do cliente (mais recentes primeiro)",
          security: sessionSecurity,
          querystring: paginationQuerySchema,
          response: { 200: orderListSchema, 401: errorResponseSchema },
        },
      },
      async (request) => {
        const userId = request.principal!.userId;
        const { limit, cursor } = request.query;
        const after = cursor ? decodeCursor(cursor, orderCursorSchema) : null;
        const rows = await db
          .select()
          .from(orders)
          .where(
            and(
              eq(orders.userId, userId),
              after ? or(lt(orders.createdAt, new Date(after.c)), and(eq(orders.createdAt, new Date(after.c)), lt(orders.id, after.i))) : undefined,
            ),
          )
          .orderBy(desc(orders.createdAt), desc(orders.id))
          .limit(limit + 1);
        const totals = rows.length
          ? await db
              .select({ orderId: orderItems.orderId, quantity: sum(orderItems.quantity).mapWith(Number) })
              .from(orderItems)
              .where(inArray(orderItems.orderId, rows.map((row) => row.id)))
              .groupBy(orderItems.orderId)
          : [];
        const quantities = new Map(totals.map((row) => [row.orderId, row.quantity]));
        return buildPage(rows, limit, (row) => ({ c: row.createdAt.toISOString(), i: row.id }), (row) => toOrderSummary(row, quantities.get(row.id) ?? 0));
      },
    );

    customer.get(
      "/orders/:id",
      {
        schema: {
          tags: ["orders"],
          summary: "Detalhe do pedido do cliente",
          description: "Fonte de verdade do estado após voltar do Mercado Pago: a página de retorno deve consultar esta rota, nunca confiar nos parâmetros da URL de retorno.",
          security: sessionSecurity,
          params: orderParamsSchema,
          response: { 200: orderSchema, 401: errorResponseSchema, 404: errorResponseSchema },
        },
      },
      async (request) => toOrderView(db, await ownOrder(request.principal!.userId, request.params.id)),
    );

    customer.post(
      "/orders/:id/payment",
      {
        config: { rateLimit: { max: 20, timeWindow: QUOTE_WINDOW } },
        schema: {
          tags: ["orders"],
          summary: "Abre (ou reabre) o checkout do Mercado Pago de um pedido pendente",
          description: "Reaproveita a sessão aberta quando ainda válida. `409 order_not_payable` quando o pedido não está mais pendente.",
          security: sessionSecurity,
          params: orderParamsSchema,
          response: { 200: paymentSessionSchema, 401: errorResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema, 503: errorResponseSchema },
        },
      },
      async (request) => startPayment(deps, await ownOrder(request.principal!.userId, request.params.id)),
    );

    customer.post(
      "/orders/:id/payment/sync",
      {
        config: { rateLimit: { max: 10, timeWindow: 60_000 } },
        schema: {
          tags: ["orders"],
          summary: "Consulta o Mercado Pago e atualiza o pedido (para a página de retorno)",
          description:
            "O servidor busca os pagamentos do pedido na API oficial e aplica o estado; parâmetros da URL de retorno nunca são usados. " +
            "Útil quando o webhook ainda não chegou (ou em desenvolvimento local, onde o webhook não alcança a máquina).",
          security: sessionSecurity,
          params: orderParamsSchema,
          response: { 200: orderSchema, 401: errorResponseSchema, 404: errorResponseSchema, 503: errorResponseSchema },
        },
      },
      async (request) => {
        const order = await ownOrder(request.principal!.userId, request.params.id);
        if (!gateway) throw errors.serviceUnavailable("Pagamento indisponível no momento.", [{ path: "payment", message: "Provedor desativado.", code: "payment_unavailable" }]);
        try {
          await syncOrderPayments(db, gateway, order.id, request.log);
        } catch (error) {
          if (error instanceof PaymentGatewayError) {
            throw errors.serviceUnavailable("Não foi possível consultar o pagamento agora.", [{ path: "payment", message: "Provedor indisponível.", code: "payment_unavailable" }]);
          }
          throw error;
        }
        return orderViewById(db, order.id);
      },
    );

    customer.post(
      "/orders/:id/cancel",
      {
        schema: {
          tags: ["orders"],
          summary: "Cancela um pedido ainda não pago (libera estoque e cupom)",
          security: sessionSecurity,
          params: orderParamsSchema,
          response: { 200: orderSchema, 401: errorResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema },
        },
      },
      async (request) => {
        const userId = request.principal!.userId;
        await ownOrder(userId, request.params.id);
        await db.transaction(async (tx) => {
          const order = await lockOrder(tx, request.params.id);
          if (!order || order.status !== "pending_payment") {
            throw errors.conflict("Só pedidos aguardando pagamento podem ser cancelados pelo cliente.", [
              { path: "params.id", message: "Pedido não cancelável.", code: "order_not_cancellable" },
            ]);
          }
          await releaseOrderHolds(tx, order.id);
          await transitionOrder(tx, order, "cancelled", { actor: "customer", actorUserId: userId, note: "cancelado pelo cliente" });
        });
        return orderViewById(db, request.params.id);
      },
    );
  });
};
