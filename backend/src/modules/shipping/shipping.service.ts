import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import type { Db, DbExecutor } from "../../db/client.js";
import { errors } from "../../shared/errors.js";
import { brl, moneySchema } from "../../shared/money.js";
import { priceCart, type PricedCart } from "../cart/cart.pricing.js";
import { loadLines, toPricingLine, type LoadedLine } from "../cart/cart.service.js";
import { coupons } from "../marketing/marketing.schema.js";
import { shippingQuotes, type QuoteOptionSnapshot } from "../orders/orders.schema.js";
import { createFixtureShippingProvider } from "./fixture.provider.js";
import { ShippingProviderError, type PackageItem, type ShippingProvider } from "./shipping.provider.js";
import { createSuperFreteProvider, SUPERFRETE_BASE_URLS } from "./superfrete.client.js";

export interface ShippingSettings {
  quoteTtlMinutes: number;
  defaults: { weightGrams: number; heightCm: number; widthCm: number; lengthCm: number };
}

export function shippingSettingsFrom(env: Env): ShippingSettings {
  return {
    quoteTtlMinutes: env.SHIPPING_QUOTE_TTL_MINUTES,
    defaults: {
      weightGrams: env.SHIPPING_DEFAULT_WEIGHT_GRAMS,
      heightCm: env.SHIPPING_DEFAULT_HEIGHT_CM,
      widthCm: env.SHIPPING_DEFAULT_WIDTH_CM,
      lengthCm: env.SHIPPING_DEFAULT_LENGTH_CM,
    },
  };
}

/** Provider selected by SHIPPING_PROVIDER; `null` when shipping is disabled. */
export function createShippingProviderFromEnv(env: Env): ShippingProvider | null {
  switch (env.SHIPPING_PROVIDER) {
    case "disabled":
      return null;
    case "fixture":
      return createFixtureShippingProvider();
    case "superfrete":
      return createSuperFreteProvider({
        baseUrl: env.SUPERFRETE_API_URL ?? SUPERFRETE_BASE_URLS[env.SUPERFRETE_ENV],
        token: env.SUPERFRETE_API_TOKEN!,
        contactEmail: env.SUPERFRETE_CONTACT_EMAIL!,
        originPostalCode: env.SHIPPING_ORIGIN_POSTAL_CODE!,
        services: env.SUPERFRETE_SERVICES,
      });
  }
}

export const shippingOptionSchema = z
  .object({
    serviceId: z.string().describe("Identificador da modalidade no provedor (SuperFrete: 1 PAC, 2 SEDEX, 17 Mini Envios...)."),
    name: z.string(),
    carrier: z.string(),
    price: moneySchema,
    deliveryDays: z.object({ min: z.number().int(), max: z.number().int() }).describe("Dias úteis após a postagem."),
  })
  .meta({ id: "ShippingOption" });

export const shippingQuoteSchema = z
  .object({
    id: z.uuid().describe("Enviar em `quoteId` no checkout."),
    provider: z.string().describe("`superfrete` ou `fixture` (tabela simulada de desenvolvimento; nunca valor real)."),
    isSimulated: z.boolean().describe("true quando os valores não vêm de uma transportadora real."),
    postalCode: z.string(),
    expiresAt: z.iso.datetime(),
    options: z.array(shippingOptionSchema).describe("Vazia quando nenhuma modalidade atende o CEP."),
  })
  .meta({ id: "ShippingQuote" });

export type ShippingQuoteView = z.infer<typeof shippingQuoteSchema>;

/** Identity of the cart contents a quote was computed for (variant + quantity, order-independent). */
export function cartFingerprint(lines: readonly { variantId: string; quantity: number }[]): string {
  const canonical = lines
    .map((line) => `${line.variantId}:${line.quantity}`)
    .sort()
    .join("|");
  return createHash("sha256").update(canonical).digest("hex");
}

export function packageItems(lines: readonly LoadedLine[], settings: ShippingSettings): PackageItem[] {
  return lines.map((line) => ({
    quantity: line.quantity,
    weightGrams: line.variant.weightGrams ?? settings.defaults.weightGrams,
    heightCm: line.variant.heightCm ?? settings.defaults.heightCm,
    widthCm: line.variant.widthCm ?? settings.defaults.widthCm,
    lengthCm: line.variant.lengthCm ?? settings.defaults.lengthCm,
  }));
}

export interface PricedCartLines {
  lines: LoadedLine[];
  pricing: PricedCart;
  coupon: typeof coupons.$inferSelect | null;
}

/** Cart lines with server prices, stock and coupon evaluated now. */
export async function priceCartById(db: DbExecutor, cartId: string, couponId: string | null, ctx: { authenticated: boolean }): Promise<PricedCartLines> {
  const lines = await loadLines(db, cartId);
  const [coupon] = couponId ? await db.select().from(coupons).where(eq(coupons.id, couponId)).limit(1) : [];
  const pricing = priceCart(lines.map(toPricingLine), coupon ?? null, { now: new Date(), ...ctx });
  return { lines, pricing, coupon: coupon ?? null };
}

/** Business rule failures shared by quote and checkout: the cart must be purchasable as is. */
export function assertCartPurchasable(priced: PricedCartLines) {
  if (priced.lines.length === 0) {
    throw errors.conflict("A sacola está vazia.", [{ path: "cart", message: "Sacola vazia.", code: "cart_empty" }]);
  }
  const blocking = priced.pricing.lines.flatMap((line, index) =>
    line.issues
      .filter((issue) => issue !== "price_changed")
      .map((issue) => ({ path: `cart.items.${index}`, message: "Item exige atenção (ver `issues` da sacola).", code: issue })),
  );
  if (blocking.length > 0) {
    throw errors.conflict("Revise a sacola: há itens sem estoque ou indisponíveis.", [
      { path: "cart", message: "Itens exigem atenção.", code: "cart_has_issues" },
      ...blocking,
    ]);
  }
}

export function providerFailure(error: unknown, log: FastifyBaseLogger): never {
  if (error instanceof ShippingProviderError) {
    log.warn({ shippingError: error.kind, providerStatus: error.status }, "shipping provider failure");
    if (error.kind === "rejected") {
      throw errors.validation(
        [{ path: "body.postalCode", message: "Não foi possível cotar o frete para este CEP.", code: "shipping_rejected" }],
        "Não foi possível cotar o frete para este CEP.",
      );
    }
    throw errors.serviceUnavailable("Cotação de frete indisponível no momento. Tente novamente em instantes.", [
      { path: "shipping", message: "Provedor de frete indisponível.", code: "shipping_unavailable" },
    ]);
  }
  throw error;
}

export function toQuoteView(row: typeof shippingQuotes.$inferSelect): ShippingQuoteView {
  return {
    id: row.id,
    provider: row.provider,
    isSimulated: row.provider === "fixture",
    postalCode: row.postalCode,
    expiresAt: row.expiresAt.toISOString(),
    options: row.options.map((option) => ({
      serviceId: option.serviceId,
      name: option.name,
      carrier: option.carrier,
      price: brl(option.priceMinor),
      deliveryDays: { min: option.deliveryDaysMin, max: option.deliveryDaysMax },
    })),
  };
}

/** Quotes the current cart to a CEP and stores the result; the checkout uses only stored prices. */
export async function quoteCart(
  deps: { db: Db; provider: ShippingProvider | null; settings: ShippingSettings; log: FastifyBaseLogger },
  cart: { id: string; couponId: string | null },
  postalCode: string,
  ctx: { authenticated: boolean },
): Promise<ShippingQuoteView> {
  if (!deps.provider) {
    throw errors.serviceUnavailable("Cotação de frete não configurada.", [
      { path: "shipping", message: "Frete desativado.", code: "shipping_unavailable" },
    ]);
  }
  const priced = await priceCartById(deps.db, cart.id, cart.couponId, ctx);
  assertCartPurchasable(priced);

  let options: QuoteOptionSnapshot[];
  try {
    options = await deps.provider.quote({
      destinationPostalCode: postalCode,
      items: packageItems(priced.lines, deps.settings),
      declaredValueMinor: priced.pricing.totalMinor,
    });
  } catch (error) {
    providerFailure(error, deps.log);
  }

  const [row] = await deps.db
    .insert(shippingQuotes)
    .values({
      cartId: cart.id,
      provider: deps.provider.name,
      postalCode,
      cartFingerprint: cartFingerprint(priced.lines),
      options: options.sort((a, b) => a.priceMinor - b.priceMinor),
      expiresAt: new Date(Date.now() + deps.settings.quoteTtlMinutes * 60_000),
    })
    .returning();
  return toQuoteView(row!);
}
