import { and, eq, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { FastifyPluginAsyncZod, ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import type { Db } from "../../db/client.js";
import { errorResponseSchema, errors } from "../../shared/errors.js";
import { applyProviderPayment } from "../orders/orders.service.js";
import { applyLabelInfo } from "../shipping/shipments.service.js";
import type { ShippingProvider } from "../shipping/shipping.provider.js";
import { shipments } from "../shipping/shipping.schema.js";
import { verifySuperFreteSignature } from "../shipping/superfrete.client.js";
import { PaymentGatewayError, verifyMercadoPagoSignature, type PaymentGateway } from "./mercadopago.client.js";
import { webhookEvents } from "./payments.schema.js";

export interface WebhookRoutesOptions {
  db: Db;
  env: Env;
  gateway: PaymentGateway | null;
  shippingProvider: ShippingProvider | null;
}

const ackSchema = z.object({ status: z.enum(["processed", "duplicate", "ignored"]) }).meta({ id: "WebhookAck" });

type EventRow = typeof webhookEvents.$inferSelect;

/**
 * Records the event once per provider identity. Returns null when it was already processed (or
 * deliberately ignored), so retries and duplicates do no further work.
 */
async function claimEvent(db: Db, values: { provider: string; eventKey: string; topic: string; resourceId: string | null }): Promise<EventRow | null> {
  const [created] = await db.insert(webhookEvents).values(values).onConflictDoNothing().returning();
  if (created) return created;
  const [existing] = await db
    .select()
    .from(webhookEvents)
    .where(and(eq(webhookEvents.provider, values.provider), eq(webhookEvents.eventKey, values.eventKey)))
    .limit(1);
  return existing && (existing.status === "processed" || existing.status === "ignored") ? null : (existing ?? null);
}

async function finishEvent(db: Db, id: string, status: EventRow["status"], error?: string) {
  await db
    .update(webhookEvents)
    .set({ status, attempts: sql`${webhookEvents.attempts} + 1`, lastError: error ?? null, processedAt: status === "failed" ? null : new Date() })
    .where(eq(webhookEvents.id, id));
}

const notConfigured = () => errors.serviceUnavailable("Integração não configurada.");
const badSignature = () => errors.unauthenticated("Assinatura inválida.");

export const webhookRoutes: FastifyPluginAsyncZod<WebhookRoutesOptions> = async (app, { db, env, gateway, shippingProvider }) => {
  app.addHook("onSend", async (_request, reply) => {
    reply.header("cache-control", "no-store");
  });

  // --- Mercado Pago ------------------------------------------------------------------------
  app.post(
    "/webhooks/mercadopago",
    {
      schema: {
        tags: ["webhooks"],
        summary: "Notificações do Mercado Pago (servidor-a-servidor; não usar no frontend)",
        description:
          "Autenticada por `x-signature` (HMAC-SHA256 com o segredo do painel). O corpo nunca é usado como fonte do estado: " +
          "o pagamento é consultado na API oficial. Duplicatas são reconhecidas e ignoradas. `401` assinatura inválida; " +
          "`500` falha temporária (o Mercado Pago reenviará).",
        querystring: z.object({ type: z.string().optional(), topic: z.string().optional(), "data.id": z.string().max(64).optional() }).loose(),
        body: z
          .object({
            id: z.union([z.string(), z.number()]).optional(),
            type: z.string().optional(),
            action: z.string().optional(),
            data: z.object({ id: z.union([z.string(), z.number()]).optional() }).loose().optional(),
          })
          .loose(),
        response: { 200: ackSchema, 401: errorResponseSchema, 503: errorResponseSchema },
      },
    },
    async (request) => {
      if (!gateway || !env.MERCADO_PAGO_WEBHOOK_SECRET) throw notConfigured();
      const body = request.body;
      const dataId = request.query["data.id"] ?? (body.data?.id !== undefined ? String(body.data.id) : undefined);
      const requestId = typeof request.headers["x-request-id"] === "string" ? request.headers["x-request-id"] : undefined;
      const signature = typeof request.headers["x-signature"] === "string" ? request.headers["x-signature"] : undefined;
      if (!verifyMercadoPagoSignature({ signature, requestId, dataId, secret: env.MERCADO_PAGO_WEBHOOK_SECRET })) {
        request.log.warn({ provider: "mercado_pago" }, "webhook signature rejected");
        throw badSignature();
      }

      const topic = request.query.type ?? body.type ?? request.query.topic ?? "unknown";
      const event = await claimEvent(db, {
        provider: "mercado_pago",
        eventKey: `${topic}:${String(body.id ?? requestId ?? dataId)}:${body.action ?? ""}`,
        topic,
        resourceId: dataId ?? null,
      });
      if (!event) return { status: "duplicate" as const };
      if (topic !== "payment" || !dataId || !/^\d{1,20}$/.test(dataId)) {
        await finishEvent(db, event.id, "ignored");
        return { status: "ignored" as const };
      }

      try {
        const payment = await gateway.getPayment(dataId);
        const result = await applyProviderPayment(db, gateway, payment, request.log);
        request.log.info({ provider: "mercado_pago", paymentId: dataId, result }, "payment notification applied");
        await finishEvent(db, event.id, result === "unknown_order" ? "ignored" : "processed");
        return { status: result === "unknown_order" ? ("ignored" as const) : ("processed" as const) };
      } catch (error) {
        if (error instanceof PaymentGatewayError && error.kind === "not_found") {
          await finishEvent(db, event.id, "ignored", "payment_not_found");
          return { status: "ignored" as const };
        }
        await finishEvent(db, event.id, "failed", error instanceof Error ? error.name : "unknown_error");
        throw error;
      }
    },
  );

  // --- SuperFrete --------------------------------------------------------------------------
  // The signature covers the raw body, so this scope keeps the exact bytes received.
  await app.register(async (scope) => {
    const rawScope = scope.withTypeProvider<ZodTypeProvider>();
    rawScope.removeContentTypeParser("application/json");
    rawScope.addContentTypeParser("application/json", { parseAs: "string", bodyLimit: 64 * 1024 }, (_request, raw, done) => {
      done(null, { raw: String(raw) });
    });

    rawScope.post(
      "/webhooks/superfrete",
      {
        schema: {
          tags: ["webhooks"],
          summary: "Notificações da SuperFrete (servidor-a-servidor; não usar no frontend)",
          description:
            "Autenticada por `X-ME-Signature` (HMAC-SHA256 do corpo bruto com o `secret_token` do webhook). O estado da etiqueta é " +
            "reconsultado na API da SuperFrete antes de ser aplicado.",
          response: { 200: ackSchema, 401: errorResponseSchema, 503: errorResponseSchema },
        },
      },
      async (request) => {
        if (!shippingProvider?.labels || shippingProvider.name !== "superfrete" || !env.SUPERFRETE_WEBHOOK_SECRET) throw notConfigured();
        const raw = (request.body as { raw?: string } | undefined)?.raw ?? "";
        const signature = typeof request.headers["x-me-signature"] === "string" ? request.headers["x-me-signature"] : undefined;
        if (!verifySuperFreteSignature(raw, signature, env.SUPERFRETE_WEBHOOK_SECRET)) {
          request.log.warn({ provider: "superfrete" }, "webhook signature rejected");
          throw badSignature();
        }
        const parsed = z
          .object({ event: z.string().max(64), data: z.object({ id: z.coerce.string().max(64), status: z.string().max(32).optional() }).loose() })
          .safeParse(safeJson(raw));
        if (!parsed.success) throw errors.badRequest("Notificação malformada.");
        const { event: topic, data } = parsed.data;

        const event = await claimEvent(db, { provider: "superfrete", eventKey: `${topic}:${data.id}:${data.status ?? ""}`, topic, resourceId: data.id });
        if (!event) return { status: "duplicate" as const };
        const [shipment] = await db
          .select()
          .from(shipments)
          .where(and(eq(shipments.provider, "superfrete"), eq(shipments.providerOrderId, data.id)))
          .limit(1);
        if (!shipment) {
          await finishEvent(db, event.id, "ignored");
          return { status: "ignored" as const };
        }
        return processLabelEvent(db, shippingProvider, shipment, event, request.log);
      },
    );
  });
};

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

async function processLabelEvent(
  db: Db,
  provider: ShippingProvider,
  shipment: typeof shipments.$inferSelect,
  event: EventRow,
  log: FastifyBaseLogger,
) {
  try {
    const info = await provider.labels!.getLabel(shipment.providerOrderId!);
    await applyLabelInfo(db, shipment, info);
    await finishEvent(db, event.id, "processed");
    log.info({ provider: "superfrete", shipmentId: shipment.id, status: info.status }, "label notification applied");
    return { status: "processed" as const };
  } catch (error) {
    await finishEvent(db, event.id, "failed", error instanceof Error ? error.name : "unknown_error");
    throw error;
  }
}
