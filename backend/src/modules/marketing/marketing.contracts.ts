import { z } from "zod";
import { couponCodeSchema } from "../cart/cart.contracts.js";
import { collectionRefSchema } from "../catalog/catalog.contracts.js";
import { paginatedResponseSchema, paginationQuerySchema } from "../../shared/pagination.js";
import { slugSchema } from "../../shared/slug.js";
import { moneySchema } from "../../shared/money.js";

export const campaignPlacements = ["announcement_bar", "home_hero", "home_panel"] as const;
export const campaignStatuses = ["draft", "published", "archived"] as const;
export const discountTypes = ["percentage", "fixed_amount"] as const;

/** Site-relative path (not protocol-relative) or absolute https URL. */
export const safeHrefSchema = z
  .string()
  .trim()
  .max(500)
  .refine((value) => /^\/(?!\/)/.test(value) || /^https:\/\/[^\s]+$/.test(value), "Use um caminho do site (/...) ou URL https.");

// --- Public ----------------------------------------------------------------------------------

export const activeCampaignsQuerySchema = z.object({
  placement: z.enum(campaignPlacements).optional().describe("Filtra pela posição na loja."),
});

export const publicCampaignSchema = z
  .object({
    id: z.uuid(),
    slug: z.string(),
    placement: z.enum(campaignPlacements),
    title: z.string(),
    subtitle: z.string().nullable(),
    cta: z.object({ label: z.string(), href: z.string() }).nullable(),
    media: z.object({ url: z.string(), alt: z.string() }).nullable(),
    collection: collectionRefSchema.nullable().describe("Somente coleções publicadas."),
    couponCode: z.string().nullable().describe("Cupom divulgado, somente enquanto ele próprio estiver válido."),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime().nullable().describe("Fim da vigência (para contadores); null = sem data de término."),
    isDemo: z.boolean().describe("true para conteúdo demonstrativo (seed); nunca é uma oferta real."),
  })
  .meta({ id: "Campaign" });

export const activeCampaignsResponseSchema = z.object({ data: z.array(publicCampaignSchema) }).meta({ id: "ActiveCampaigns" });

// --- Admin: coupons --------------------------------------------------------------------------

const couponFields = {
  code: couponCodeSchema,
  description: z.string().trim().min(1).max(200),
  discountType: z.enum(discountTypes),
  percentOff: z.number().int().min(1).max(100).nullable().describe("Somente `percentage`."),
  amountOffMinor: z.number().int().min(1).nullable().describe("Centavos; somente `fixed_amount`."),
  maxDiscountMinor: z.number().int().min(1).nullable().describe("Teto do desconto percentual, em centavos."),
  minSubtotalMinor: z.number().int().min(0).describe("Subtotal mínimo, em centavos."),
  collectionId: z.uuid().nullable().describe("Restringe o desconto aos itens desta coleção."),
  requiresAccount: z.boolean(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().nullable(),
  usageLimit: z.number().int().min(1).nullable().describe("Usos totais; contabilizados ao criar pedidos (E5)."),
  isActive: z.boolean(),
};

export const createCouponBodySchema = z.object({
  ...couponFields,
  percentOff: couponFields.percentOff.optional(),
  amountOffMinor: couponFields.amountOffMinor.optional(),
  maxDiscountMinor: couponFields.maxDiscountMinor.optional(),
  minSubtotalMinor: couponFields.minSubtotalMinor.optional(),
  collectionId: couponFields.collectionId.optional(),
  requiresAccount: couponFields.requiresAccount.optional(),
  startsAt: couponFields.startsAt.optional().describe("Padrão: agora."),
  endsAt: couponFields.endsAt.optional(),
  usageLimit: couponFields.usageLimit.optional(),
  isActive: couponFields.isActive.optional(),
});

export const updateCouponBodySchema = z
  .object(couponFields)
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Informe ao menos um campo.");

export const adminCouponSchema = z
  .object({
    id: z.uuid(),
    code: z.string(),
    description: z.string(),
    discountType: z.enum(discountTypes),
    percentOff: z.number().int().nullable(),
    amountOff: moneySchema.nullable(),
    maxDiscount: moneySchema.nullable(),
    minSubtotal: moneySchema,
    collectionId: z.uuid().nullable(),
    requiresAccount: z.boolean(),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime().nullable(),
    usageLimit: z.number().int().nullable(),
    timesRedeemed: z.number().int(),
    isActive: z.boolean(),
    isDemo: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "AdminCoupon" });

// --- Admin: campaigns ------------------------------------------------------------------------

const campaignFields = {
  slug: slugSchema,
  placement: z.enum(campaignPlacements),
  status: z.enum(campaignStatuses),
  title: z.string().trim().min(1).max(120),
  subtitle: z.string().trim().max(300).nullable(),
  ctaLabel: z.string().trim().min(1).max(40).nullable(),
  ctaHref: safeHrefSchema.nullable(),
  mediaUrl: safeHrefSchema.nullable(),
  mediaAlt: z.string().trim().max(300).nullable(),
  collectionId: z.uuid().nullable(),
  couponId: z.uuid().nullable(),
  priority: z.number().int().min(-1000).max(1000),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().nullable(),
};

export const createCampaignBodySchema = z.object({
  ...campaignFields,
  status: campaignFields.status.optional().describe("Padrão: `draft`."),
  subtitle: campaignFields.subtitle.optional(),
  ctaLabel: campaignFields.ctaLabel.optional(),
  ctaHref: campaignFields.ctaHref.optional(),
  mediaUrl: campaignFields.mediaUrl.optional(),
  mediaAlt: campaignFields.mediaAlt.optional(),
  collectionId: campaignFields.collectionId.optional(),
  couponId: campaignFields.couponId.optional(),
  priority: campaignFields.priority.optional(),
  endsAt: campaignFields.endsAt.optional(),
});

export const updateCampaignBodySchema = z
  .object(campaignFields)
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Informe ao menos um campo.");

export const adminCampaignSchema = z
  .object({
    id: z.uuid(),
    slug: z.string(),
    placement: z.enum(campaignPlacements),
    status: z.enum(campaignStatuses),
    title: z.string(),
    subtitle: z.string().nullable(),
    ctaLabel: z.string().nullable(),
    ctaHref: z.string().nullable(),
    mediaUrl: z.string().nullable(),
    mediaAlt: z.string().nullable(),
    collectionId: z.uuid().nullable(),
    couponId: z.uuid().nullable(),
    priority: z.number().int(),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime().nullable(),
    isDemo: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "AdminCampaign" });

export const idParamsSchema = z.object({ id: z.uuid() });
export const adminListQuerySchema = paginationQuerySchema;
export const adminCouponListSchema = paginatedResponseSchema(adminCouponSchema);
export const adminCampaignListSchema = paginatedResponseSchema(adminCampaignSchema);

export type CreateCouponBody = z.infer<typeof createCouponBodySchema>;
export type UpdateCouponBody = z.infer<typeof updateCouponBodySchema>;
export type CreateCampaignBody = z.infer<typeof createCampaignBodySchema>;
export type UpdateCampaignBody = z.infer<typeof updateCampaignBodySchema>;
export type PublicCampaign = z.infer<typeof publicCampaignSchema>;
export type AdminCoupon = z.infer<typeof adminCouponSchema>;
export type AdminCampaign = z.infer<typeof adminCampaignSchema>;
