import { and, desc, eq, gt, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../../db/client.js";
import { PG_CHECK_VIOLATION, PG_FOREIGN_KEY_VIOLATION, PG_UNIQUE_VIOLATION, pgError } from "../../shared/db-errors.js";
import { errors, type ErrorDetail } from "../../shared/errors.js";
import { brl } from "../../shared/money.js";
import { buildPage, decodeCursor } from "../../shared/pagination.js";
import { couponStateIssue } from "../cart/cart.pricing.js";
import type {
  AdminCampaign,
  AdminCoupon,
  CreateCampaignBody,
  CreateCouponBody,
  PublicCampaign,
  UpdateCampaignBody,
  UpdateCouponBody,
} from "./marketing.contracts.js";
import { campaigns, coupons } from "./marketing.schema.js";

type CouponRow = typeof coupons.$inferSelect;
type CampaignRow = typeof campaigns.$inferSelect;

export const MAX_ACTIVE_CAMPAIGNS = 20;

// --- Public ----------------------------------------------------------------------------------

/** Published campaigns inside their period, highest priority first. */
export async function findActiveCampaigns(db: Db, placement?: CampaignRow["placement"]): Promise<PublicCampaign[]> {
  const now = new Date();
  const conditions: SQL[] = [eq(campaigns.status, "published"), lte(campaigns.startsAt, now)];
  const notEnded = or(isNull(campaigns.endsAt), gt(campaigns.endsAt, now));
  if (notEnded) conditions.push(notEnded);
  if (placement) conditions.push(eq(campaigns.placement, placement));

  const rows = await db.query.campaigns.findMany({
    where: and(...conditions),
    orderBy: [desc(campaigns.priority), desc(campaigns.startsAt), desc(campaigns.id)],
    limit: MAX_ACTIVE_CAMPAIGNS,
    with: { collection: true, coupon: true },
  });

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    placement: row.placement,
    title: row.title,
    subtitle: row.subtitle,
    cta: row.ctaLabel && row.ctaHref ? { label: row.ctaLabel, href: row.ctaHref } : null,
    media: row.mediaUrl && row.mediaAlt ? { url: row.mediaUrl, alt: row.mediaAlt } : null,
    collection:
      row.collection?.status === "published" ? { id: row.collection.id, slug: row.collection.slug, title: row.collection.title } : null,
    couponCode: row.coupon && couponStateIssue(row.coupon, { now, authenticated: true }) === null ? row.coupon.code : null,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    isDemo: row.isDemo,
  }));
}

// --- Admin helpers ---------------------------------------------------------------------------

const adminCursorSchema = z.object({ c: z.iso.datetime(), id: z.uuid() });

function translateDbError(error: unknown, uniqueField: string): never {
  const pg = pgError(error);
  if (pg?.code === PG_UNIQUE_VIOLATION) throw errors.conflict("Já existe um registro com este identificador.", [
    { path: `body.${uniqueField}`, message: "Já em uso.", code: "already_exists" },
  ]);
  if (pg?.code === PG_FOREIGN_KEY_VIOLATION) {
    const field = pg.constraint?.includes("coupon") ? "couponId" : "collectionId";
    throw errors.validation([{ path: `body.${field}`, message: "Referência inexistente.", code: "not_found" }]);
  }
  if (pg?.code === PG_CHECK_VIOLATION) {
    throw errors.validation([{ path: "body", message: `Regra violada: ${pg.constraint ?? "check"}.`, code: "constraint" }]);
  }
  throw error;
}

function assertNoIssues(issues: ErrorDetail[]) {
  if (issues.length > 0) throw errors.validation(issues);
}

/**
 * Keyset on (created_at truncated to milliseconds, id): cursors carry ISO timestamps (ms), while
 * PostgreSQL stores microseconds, so ordering and comparison use the same truncated value.
 */
const createdKey = (table: typeof coupons | typeof campaigns) => sql`date_trunc('milliseconds', ${table.createdAt})`;

function cursorCondition(table: typeof coupons | typeof campaigns, cursor: string | undefined): SQL | undefined {
  if (!cursor) return undefined;
  const { c, id } = decodeCursor(cursor, adminCursorSchema);
  return sql`(${createdKey(table)}, ${table.id}) < (${c}::timestamptz, ${id}::uuid)`;
}

const newestFirst = (table: typeof coupons | typeof campaigns) => [desc(createdKey(table)), desc(table.id)];

// --- Admin: coupons --------------------------------------------------------------------------

type CouponValues = Omit<CouponRow, "id" | "timesRedeemed" | "isDemo" | "createdAt" | "updatedAt">;

export function couponRuleIssues(values: CouponValues): ErrorDetail[] {
  const issues: ErrorDetail[] = [];
  if (values.discountType === "percentage") {
    if (values.percentOff === null) issues.push({ path: "body.percentOff", message: "Obrigatório para desconto percentual.", code: "required" });
    if (values.amountOffMinor !== null) issues.push({ path: "body.amountOffMinor", message: "Não se aplica a desconto percentual.", code: "not_allowed" });
  } else {
    if (values.amountOffMinor === null) issues.push({ path: "body.amountOffMinor", message: "Obrigatório para desconto fixo.", code: "required" });
    if (values.percentOff !== null) issues.push({ path: "body.percentOff", message: "Não se aplica a desconto fixo.", code: "not_allowed" });
    if (values.maxDiscountMinor !== null) issues.push({ path: "body.maxDiscountMinor", message: "Não se aplica a desconto fixo.", code: "not_allowed" });
  }
  if (values.endsAt && values.endsAt.getTime() <= values.startsAt.getTime()) {
    issues.push({ path: "body.endsAt", message: "Deve ser posterior ao início.", code: "invalid_period" });
  }
  return issues;
}

export function toAdminCoupon(row: CouponRow): AdminCoupon {
  return {
    id: row.id,
    code: row.code,
    description: row.description,
    discountType: row.discountType,
    percentOff: row.percentOff,
    amountOff: row.amountOffMinor === null ? null : brl(row.amountOffMinor),
    maxDiscount: row.maxDiscountMinor === null ? null : brl(row.maxDiscountMinor),
    minSubtotal: brl(row.minSubtotalMinor),
    collectionId: row.collectionId,
    requiresAccount: row.requiresAccount,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    usageLimit: row.usageLimit,
    perCustomerLimit: row.perCustomerLimit,
    timesRedeemed: row.timesRedeemed,
    isActive: row.isActive,
    isDemo: row.isDemo,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function couponPatch(body: UpdateCouponBody): Partial<CouponValues> {
  const { startsAt, endsAt, ...rest } = body;
  return {
    ...rest,
    ...(startsAt !== undefined ? { startsAt: new Date(startsAt) } : {}),
    ...(endsAt !== undefined ? { endsAt: endsAt === null ? null : new Date(endsAt) } : {}),
  };
}

export async function createCoupon(db: Db, body: CreateCouponBody): Promise<CouponRow> {
  const values: CouponValues = {
    code: body.code,
    description: body.description,
    discountType: body.discountType,
    percentOff: body.percentOff ?? null,
    amountOffMinor: body.amountOffMinor ?? null,
    maxDiscountMinor: body.maxDiscountMinor ?? null,
    minSubtotalMinor: body.minSubtotalMinor ?? 0,
    collectionId: body.collectionId ?? null,
    requiresAccount: body.requiresAccount ?? false,
    startsAt: body.startsAt ? new Date(body.startsAt) : new Date(),
    endsAt: body.endsAt ? new Date(body.endsAt) : null,
    usageLimit: body.usageLimit ?? null,
    perCustomerLimit: body.perCustomerLimit ?? null,
    isActive: body.isActive ?? true,
  };
  assertNoIssues(couponRuleIssues(values));
  try {
    const [row] = await db.insert(coupons).values(values).returning();
    return row!;
  } catch (error) {
    translateDbError(error, "code");
  }
}

export async function updateCoupon(db: Db, id: string, body: UpdateCouponBody): Promise<CouponRow> {
  const [existing] = await db.select().from(coupons).where(eq(coupons.id, id)).limit(1);
  if (!existing) throw errors.notFound("Cupom não encontrado.");
  const patch = couponPatch(body);
  assertNoIssues(couponRuleIssues({ ...existing, ...patch }));
  try {
    const [row] = await db.update(coupons).set(patch).where(eq(coupons.id, id)).returning();
    return row!;
  } catch (error) {
    translateDbError(error, "code");
  }
}

export async function listCoupons(db: Db, limit: number, cursor?: string) {
  const rows = await db
    .select()
    .from(coupons)
    .where(cursorCondition(coupons, cursor))
    .orderBy(...newestFirst(coupons))
    .limit(limit + 1);
  return buildPage(rows, limit, (row) => ({ c: row.createdAt.toISOString(), id: row.id }), toAdminCoupon);
}

// --- Admin: campaigns ------------------------------------------------------------------------

type CampaignValues = Omit<CampaignRow, "id" | "isDemo" | "createdAt" | "updatedAt">;

export function campaignRuleIssues(values: CampaignValues): ErrorDetail[] {
  const issues: ErrorDetail[] = [];
  if ((values.ctaLabel === null) !== (values.ctaHref === null)) {
    issues.push({ path: "body.ctaHref", message: "Rótulo e destino do botão devem ser informados juntos.", code: "cta_pair" });
  }
  if (values.mediaUrl !== null && !values.mediaAlt?.trim()) {
    issues.push({ path: "body.mediaAlt", message: "Texto alternativo obrigatório para a mídia.", code: "required" });
  }
  if (values.endsAt && values.endsAt.getTime() <= values.startsAt.getTime()) {
    issues.push({ path: "body.endsAt", message: "Deve ser posterior ao início.", code: "invalid_period" });
  }
  return issues;
}

export function toAdminCampaign(row: CampaignRow): AdminCampaign {
  return {
    id: row.id,
    slug: row.slug,
    placement: row.placement,
    status: row.status,
    title: row.title,
    subtitle: row.subtitle,
    ctaLabel: row.ctaLabel,
    ctaHref: row.ctaHref,
    mediaUrl: row.mediaUrl,
    mediaAlt: row.mediaAlt,
    collectionId: row.collectionId,
    couponId: row.couponId,
    priority: row.priority,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    isDemo: row.isDemo,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function campaignPatch(body: UpdateCampaignBody): Partial<CampaignValues> {
  const { startsAt, endsAt, ...rest } = body;
  return {
    ...rest,
    ...(startsAt !== undefined ? { startsAt: new Date(startsAt) } : {}),
    ...(endsAt !== undefined ? { endsAt: endsAt === null ? null : new Date(endsAt) } : {}),
  };
}

export async function createCampaign(db: Db, body: CreateCampaignBody): Promise<CampaignRow> {
  const values: CampaignValues = {
    slug: body.slug,
    placement: body.placement,
    status: body.status ?? "draft",
    title: body.title,
    subtitle: body.subtitle ?? null,
    ctaLabel: body.ctaLabel ?? null,
    ctaHref: body.ctaHref ?? null,
    mediaUrl: body.mediaUrl ?? null,
    mediaAlt: body.mediaAlt ?? null,
    collectionId: body.collectionId ?? null,
    couponId: body.couponId ?? null,
    priority: body.priority ?? 0,
    startsAt: new Date(body.startsAt),
    endsAt: body.endsAt ? new Date(body.endsAt) : null,
  };
  assertNoIssues(campaignRuleIssues(values));
  try {
    const [row] = await db.insert(campaigns).values(values).returning();
    return row!;
  } catch (error) {
    translateDbError(error, "slug");
  }
}

export async function updateCampaign(db: Db, id: string, body: UpdateCampaignBody): Promise<CampaignRow> {
  const [existing] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  if (!existing) throw errors.notFound("Campanha não encontrada.");
  const patch = campaignPatch(body);
  assertNoIssues(campaignRuleIssues({ ...existing, ...patch }));
  try {
    const [row] = await db.update(campaigns).set(patch).where(eq(campaigns.id, id)).returning();
    return row!;
  } catch (error) {
    translateDbError(error, "slug");
  }
}

export async function listCampaigns(db: Db, limit: number, cursor?: string) {
  const rows = await db
    .select()
    .from(campaigns)
    .where(cursorCondition(campaigns, cursor))
    .orderBy(...newestFirst(campaigns))
    .limit(limit + 1);
  return buildPage(rows, limit, (row) => ({ c: row.createdAt.toISOString(), id: row.id }), toAdminCampaign);
}
