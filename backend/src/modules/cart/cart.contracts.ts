import { z } from "zod";
import { availabilitySchema } from "../catalog/catalog.contracts.js";
import { moneySchema } from "../../shared/money.js";
import { cartItemIssues, couponIssues } from "./cart.pricing.js";
import { MAX_CART_LINES, MAX_ITEM_QUANTITY } from "./cart.schema.js";

export const quantitySchema = z.number().int().min(1).max(MAX_ITEM_QUANTITY).describe(`Quantidade (1 a ${MAX_ITEM_QUANTITY}).`);

/** Codes are case-insensitive for the customer and normalised to uppercase. */
export const couponCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9_-]{2,39}$/, "Código de cupom inválido."));

export const addCartItemBodySchema = z.object({
  variantId: z.uuid(),
  quantity: quantitySchema.default(1),
});

export const updateCartItemBodySchema = z.object({ quantity: quantitySchema });

export const cartItemParamsSchema = z.object({ itemId: z.uuid() });

export const applyCouponBodySchema = z.object({ code: couponCodeSchema });

export const importCartBodySchema = z.object({
  items: z
    .array(z.object({ variantId: z.uuid(), quantity: z.number().int().min(1).max(100) }))
    .min(1)
    .max(MAX_CART_LINES)
    .describe("Linhas da sacola local (prévia). Quantidades são somadas às existentes e limitadas pelo servidor."),
});

export const cartItemIssueSchema = z
  .enum(cartItemIssues)
  .describe(
    "`unavailable`: produto/variante fora de venda; `out_of_stock`: sem estoque; `insufficient_stock`: quantidade acima do disponível " +
      "(totais usam `maxQuantity`); `price_changed`: preço mudou desde que o item foi alterado pela última vez (informativo).",
  )
  .meta({ id: "CartItemIssue" });

export const couponIssueSchema = z.enum(couponIssues).meta({ id: "CouponIssue" });

export const cartItemSchema = z
  .object({
    id: z.uuid(),
    quantity: z.number().int().describe("Quantidade solicitada pelo cliente."),
    maxQuantity: z.number().int().describe(`Máximo selecionável agora (estoque disponível, limitado a ${MAX_ITEM_QUANTITY}); 0 quando indisponível.`),
    product: z.object({
      id: z.uuid(),
      slug: z.string(),
      name: z.string(),
      isDemo: z.boolean(),
      image: z.object({ url: z.string(), alt: z.string() }).nullable(),
    }),
    variant: z.object({
      id: z.uuid(),
      sku: z.string(),
      size: z.string(),
      color: z.string().nullable(),
      availability: availabilitySchema,
    }),
    unitPrice: moneySchema.describe("Preço unitário atual (servidor)."),
    compareAtUnitPrice: moneySchema.nullable(),
    previousUnitPrice: moneySchema.nullable().describe("Preço anterior quando `price_changed`."),
    lineTotal: moneySchema.describe("Preço unitário × quantidade comprável."),
    issues: z.array(cartItemIssueSchema),
  })
  .meta({ id: "CartItem" });

export const cartCouponSchema = z
  .object({
    code: z.string(),
    description: z.string(),
    status: z.enum(["applied", "not_applicable"]),
    issue: couponIssueSchema.nullable(),
    discount: moneySchema,
    minimumSubtotal: moneySchema.nullable(),
  })
  .meta({ id: "CartCoupon" });

export const cartSchema = z
  .object({
    id: z.uuid().nullable().describe("null enquanto nenhum item foi adicionado."),
    owner: z.enum(["guest", "customer"]),
    items: z.array(cartItemSchema),
    itemCount: z.number().int().describe("Soma das quantidades solicitadas."),
    coupon: cartCouponSchema.nullable(),
    totals: z.object({
      subtotal: moneySchema,
      discount: moneySchema,
      shipping: z.null().describe("Calculado na E5 (frete)."),
      total: moneySchema.describe("Subtotal − desconto. Frete ainda não incluído."),
    }),
    hasIssues: z.boolean().describe("true quando algum item ou o cupom exige atenção antes do checkout."),
    updatedAt: z.iso.datetime().nullable(),
  })
  .meta({ id: "Cart" });

export const cartImportResponseSchema = z
  .object({
    cart: cartSchema,
    skipped: z.array(z.object({ variantId: z.uuid(), reason: z.enum(["unavailable", "cart_full"]) })),
  })
  .meta({ id: "CartImportResponse" });

export type CartView = z.infer<typeof cartSchema>;
export type CartItemView = z.infer<typeof cartItemSchema>;
