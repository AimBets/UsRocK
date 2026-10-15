import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  ShippingProviderError,
  type LabelInfo,
  type LabelOperations,
  type LabelRequest,
  type QuoteRequest,
  type ShippingOption,
  type ShippingProvider,
} from "./shipping.provider.js";

/**
 * SuperFrete REST API (https://superfrete.readme.io/reference). Endpoints used, as documented:
 * - POST /api/v0/calculator          quote by CEP (`products` with kg/cm)
 * - POST /api/v0/cart                creates a label in the account cart (status `pending`, unpaid)
 * - GET  /api/v0/order/info/{id}     label status, tracking, print URL
 * - POST /api/v0/order/cancel        cancels a label not yet posted
 * Paying labels (POST /api/v0/checkout) debits the account wallet and is deliberately NOT
 * automated in this phase. Sandbox: https://sandbox.superfrete.com (labels have no real validity).
 */

export const SUPERFRETE_BASE_URLS = {
  sandbox: "https://sandbox.superfrete.com",
  production: "https://api.superfrete.com",
} as const;

export interface SuperFreteConfig {
  baseUrl: string;
  token: string;
  contactEmail: string;
  originPostalCode: string;
  services: readonly string[];
  timeoutMs?: number;
  fetch?: typeof fetch;
}

const quoteItemSchema = z.object({
  id: z.coerce.string(),
  name: z.string(),
  price: z.coerce.number().optional(),
  delivery_time: z.coerce.number().optional(),
  delivery_range: z.object({ min: z.coerce.number(), max: z.coerce.number() }).partial().optional(),
  company: z.object({ name: z.string() }).partial().optional(),
  has_error: z.boolean().optional(),
  error: z.unknown().optional(),
});

const quoteResponseSchema = z.array(quoteItemSchema);

const labelResponseSchema = z.object({
  id: z.coerce.string(),
  status: z.string().optional(),
  price: z.coerce.number().optional(),
  tracking: z.string().nullish(),
  print: z.object({ url: z.string().nullish() }).nullish(),
});

const toMinor = (reais: number) => Math.round(reais * 100);
const kg = (grams: number) => Math.max(0.001, Math.round(grams) / 1000);

export function createSuperFreteProvider(config: SuperFreteConfig): ShippingProvider {
  const doFetch = config.fetch ?? fetch;
  const timeoutMs = config.timeoutMs ?? 8_000;

  async function request<T>(method: "GET" | "POST", path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await doFetch(`${config.baseUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${config.token}`,
          "user-agent": `UsRock/0.1 (${config.contactEmail})`,
          accept: "application/json",
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      // Network failure or timeout. The cause is not propagated: it may contain the URL/token context.
      throw new ShippingProviderError("unavailable", "SuperFrete indisponível (rede ou tempo limite).");
    }
    if (!response.ok) {
      const kind = response.status >= 500 || response.status === 429 ? "unavailable" : "rejected";
      throw new ShippingProviderError(kind, `SuperFrete respondeu ${response.status}.`, response.status);
    }
    const parsed = schema.safeParse(await response.json().catch(() => undefined));
    if (!parsed.success) throw new ShippingProviderError("unavailable", "Resposta inesperada da SuperFrete.");
    return parsed.data;
  }

  const toLabelInfo = (data: z.infer<typeof labelResponseSchema>): LabelInfo => ({
    providerOrderId: data.id,
    status: data.status ?? "pending",
    trackingCode: data.tracking ?? null,
    labelUrl: data.print?.url ?? null,
    priceMinor: data.price === undefined ? null : toMinor(data.price),
  });

  const labels: LabelOperations = {
    async createLabel(input: LabelRequest) {
      const party = (p: LabelRequest["from"]) => ({
        name: p.name,
        address: p.street,
        number: p.number,
        ...(p.complement ? { complement: p.complement } : {}),
        district: p.district,
        city: p.city,
        state_abbr: p.state,
        postal_code: p.postalCode,
        ...(p.document ? { document: p.document } : {}),
        ...(p.phone ? { phone: p.phone } : {}),
        ...(p.email ? { email: p.email } : {}),
      });
      const data = await request("POST", "/api/v0/cart", labelResponseSchema, {
        from: party(input.from),
        to: party(input.to),
        service: Number(input.serviceId),
        volumes: {
          weight: kg(input.volume.weightGrams),
          height: input.volume.heightCm,
          width: input.volume.widthCm,
          length: input.volume.lengthCm,
        },
        products: input.products.map((product) => ({
          name: product.name,
          quantity: product.quantity,
          unitary_value: product.unitValueMinor / 100,
        })),
        // non_commercial: content declaration instead of NF-e (no invoicing integration yet; see handoff).
        options: {
          insurance_value: input.declaredValueMinor / 100,
          receipt: false,
          own_hand: false,
          non_commercial: true,
          tags: [{ tag: input.reference }],
        },
        platform: "UsRock",
      });
      return toLabelInfo(data);
    },
    async getLabel(providerOrderId) {
      return toLabelInfo(await request("GET", `/api/v0/order/info/${encodeURIComponent(providerOrderId)}`, labelResponseSchema));
    },
    async cancelLabel(providerOrderId, reason) {
      await request("POST", "/api/v0/order/cancel", z.unknown(), { order: { id: providerOrderId, description: reason } });
    },
  };

  return {
    name: "superfrete",
    labels,
    async quote(input: QuoteRequest): Promise<ShippingOption[]> {
      const items = await request("POST", "/api/v0/calculator", quoteResponseSchema, {
        from: { postal_code: config.originPostalCode },
        to: { postal_code: input.destinationPostalCode },
        services: config.services.join(","),
        options: { own_hand: false, receipt: false, insurance_value: input.declaredValueMinor / 100, use_insurance_value: false },
        products: input.items.map((item) => ({
          quantity: item.quantity,
          weight: kg(item.weightGrams),
          height: item.heightCm,
          width: item.widthCm,
          length: item.lengthCm,
        })),
      });
      return items.flatMap((item) => {
        if (item.has_error || item.error || item.price === undefined || !(item.price > 0)) return [];
        const min = item.delivery_range?.min ?? item.delivery_time ?? 0;
        const max = item.delivery_range?.max ?? item.delivery_time ?? min;
        return [
          {
            serviceId: item.id,
            name: item.name,
            carrier: item.company?.name ?? item.name,
            priceMinor: toMinor(item.price),
            deliveryDaysMin: Math.max(0, Math.round(min)),
            deliveryDaysMax: Math.max(0, Math.round(max)),
          },
        ];
      });
    },
  };
}

/**
 * Webhook authenticity: HMAC-SHA256 of the raw body with the webhook app `secret_token`, sent in
 * `X-ME-Signature`. The documentation does not state the digest encoding, so both hex and base64
 * are accepted (compared in constant time).
 */
export function verifySuperFreteSignature(rawBody: string, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  const digest = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  const provided = signature.trim().replace(/^sha256=/i, "");
  const candidates = [digest.toString("hex"), digest.toString("base64")];
  return candidates.some((expected) => {
    const a = Buffer.from(expected);
    const b = Buffer.from(provided);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}
