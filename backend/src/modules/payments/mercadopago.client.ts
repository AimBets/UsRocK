import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Mercado Pago Checkout Pro. Shapes follow the official Node SDK (mercadopago/sdk-nodejs):
 * - POST /checkout/preferences      → { id, init_point, sandbox_init_point }
 * - GET  /v1/payments/{id}          → payment with status, external_reference, transaction_amount
 * - GET  /v1/payments/search        → { results: payment[] } filtered by external_reference
 * POSTs carry `X-Idempotency-Key`. The integration is isolated behind `PaymentGateway` so a later
 * Bricks (transparent checkout) implementation can replace `createCheckout` without touching orders.
 */

export interface CheckoutRequest {
  orderId: string;
  orderNumber: string;
  totalMinor: number;
  payer: { email: string; name: string };
  /** The provider refuses payments after this moment (aligned with the stock reservation). */
  expiresAt: Date;
  returnUrl: string;
  idempotencyKey: string;
}

export interface CheckoutSession {
  preferenceId: string;
  checkoutUrl: string;
}

export interface ProviderPayment {
  id: string;
  status: string;
  statusDetail: string | null;
  externalReference: string | null;
  amountMinor: number;
  currencyCode: string;
  liveMode: boolean | null;
  approvedAt: Date | null;
}

export interface PaymentGateway {
  readonly provider: "mercado_pago";
  readonly environment: "sandbox" | "production";
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  getPayment(paymentId: string): Promise<ProviderPayment>;
  findPaymentsByOrder(orderId: string): Promise<ProviderPayment[]>;
}

export class PaymentGatewayError extends Error {
  constructor(
    readonly kind: "unavailable" | "rejected" | "not_found",
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "PaymentGatewayError";
  }
}

export interface MercadoPagoConfig {
  apiUrl: string;
  accessToken: string;
  environment: "sandbox" | "production";
  notificationUrl?: string;
  statementDescriptor: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

const preferenceSchema = z.object({
  id: z.string(),
  init_point: z.string().optional(),
  sandbox_init_point: z.string().optional(),
});

const paymentSchema = z.object({
  id: z.coerce.string(),
  status: z.string(),
  status_detail: z.string().nullish(),
  external_reference: z.string().nullish(),
  transaction_amount: z.number(),
  currency_id: z.string(),
  live_mode: z.boolean().nullish(),
  date_approved: z.string().nullish(),
});

const searchSchema = z.object({ results: z.array(paymentSchema) });

function toProviderPayment(data: z.infer<typeof paymentSchema>): ProviderPayment {
  return {
    id: data.id,
    status: data.status,
    statusDetail: data.status_detail ?? null,
    externalReference: data.external_reference ?? null,
    amountMinor: Math.round(data.transaction_amount * 100),
    currencyCode: data.currency_id,
    liveMode: data.live_mode ?? null,
    approvedAt: data.date_approved ? new Date(data.date_approved) : null,
  };
}

export function createMercadoPagoGateway(config: MercadoPagoConfig): PaymentGateway {
  const doFetch = config.fetch ?? fetch;
  const timeoutMs = config.timeoutMs ?? 10_000;

  async function call<T>(method: "GET" | "POST", path: string, schema: z.ZodType<T>, options: { body?: unknown; idempotencyKey?: string } = {}) {
    let response: Response;
    try {
      response = await doFetch(`${config.apiUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${config.accessToken}`,
          accept: "application/json",
          ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
          ...(options.idempotencyKey ? { "x-idempotency-key": options.idempotencyKey } : {}),
        },
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new PaymentGatewayError("unavailable", "Mercado Pago indisponível (rede ou tempo limite).");
    }
    if (response.status === 404) throw new PaymentGatewayError("not_found", "Recurso não encontrado no Mercado Pago.", 404);
    if (!response.ok) {
      const kind = response.status >= 500 || response.status === 429 ? "unavailable" : "rejected";
      throw new PaymentGatewayError(kind, `Mercado Pago respondeu ${response.status}.`, response.status);
    }
    const parsed = schema.safeParse(await response.json().catch(() => undefined));
    if (!parsed.success) throw new PaymentGatewayError("unavailable", "Resposta inesperada do Mercado Pago.");
    return parsed.data;
  }

  return {
    provider: "mercado_pago",
    environment: config.environment,

    async createCheckout(request) {
      const https = request.returnUrl.startsWith("https://");
      const preference = await call("POST", "/checkout/preferences", preferenceSchema, {
        idempotencyKey: request.idempotencyKey,
        body: {
          // A single consolidated line keeps the charged amount exactly equal to the order total
          // (items + freight − discount), which per-item lines with a separate discount cannot express.
          items: [
            {
              id: request.orderNumber,
              title: `Pedido ${request.orderNumber} — UsRock`,
              quantity: 1,
              unit_price: request.totalMinor / 100,
              currency_id: "BRL",
            },
          ],
          payer: { email: request.payer.email, name: request.payer.name },
          external_reference: request.orderId,
          back_urls: { success: request.returnUrl, pending: request.returnUrl, failure: request.returnUrl },
          // Mercado Pago only auto-returns to https URLs.
          ...(https ? { auto_return: "approved" } : {}),
          ...(config.notificationUrl ? { notification_url: config.notificationUrl } : {}),
          expires: true,
          expiration_date_to: request.expiresAt.toISOString(),
          statement_descriptor: config.statementDescriptor,
          metadata: { order_number: request.orderNumber },
        },
      });
      const checkoutUrl =
        config.environment === "sandbox" ? (preference.sandbox_init_point ?? preference.init_point) : preference.init_point;
      if (!checkoutUrl) throw new PaymentGatewayError("unavailable", "Mercado Pago não retornou a URL do checkout.");
      return { preferenceId: preference.id, checkoutUrl };
    },

    async getPayment(paymentId) {
      return toProviderPayment(await call("GET", `/v1/payments/${encodeURIComponent(paymentId)}`, paymentSchema));
    },

    async findPaymentsByOrder(orderId) {
      const query = new URLSearchParams({ external_reference: orderId, sort: "date_created", criteria: "desc" });
      const data = await call("GET", `/v1/payments/search?${query.toString()}`, searchSchema);
      return data.results.map(toProviderPayment);
    },
  };
}

/**
 * Validates `x-signature` (`ts=<ts>,v1=<hmac>`) exactly like the official SDK validator:
 * manifest `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` (empty parts omitted), HMAC-SHA256
 * hex with the webhook secret, constant-time comparison. Values are only trimmed, never altered.
 */
export function verifyMercadoPagoSignature(input: {
  signature: string | undefined;
  requestId: string | undefined;
  dataId: string | undefined;
  secret: string;
}): boolean {
  if (!input.signature) return false;
  let ts: string | undefined;
  let v1: string | undefined;
  for (const part of input.signature.split(",")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim().toLowerCase();
    const value = part.slice(separator + 1).trim();
    if (key === "ts") ts = value;
    if (key === "v1") v1 = value;
  }
  if (!ts || !/^\d+$/.test(ts) || !v1) return false;

  const parts: string[] = [];
  const dataId = input.dataId?.trim();
  const requestId = input.requestId?.trim();
  if (dataId) parts.push(`id:${dataId}`);
  if (requestId) parts.push(`request-id:${requestId}`);
  parts.push(`ts:${ts}`);
  const manifest = `${parts.join(";")};`;

  const expected = Buffer.from(createHmac("sha256", input.secret).update(manifest).digest("hex"));
  const provided = Buffer.from(v1);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}
