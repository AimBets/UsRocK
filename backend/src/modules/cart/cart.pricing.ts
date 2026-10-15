import { MAX_ITEM_QUANTITY } from "./cart.schema.js";

/**
 * Pure commercial rules for the cart: what can be bought, at which price, and which coupon
 * discount applies. Everything is integer centavos. The database layer feeds current prices
 * and stock; nothing sent by the client is trusted.
 */

export const cartItemIssues = ["unavailable", "out_of_stock", "insufficient_stock", "price_changed"] as const;
export type CartItemIssue = (typeof cartItemIssues)[number];

/** `price_changed` is informational; the other issues must be resolved before checkout. */
export function isBlockingIssue(issue: CartItemIssue): boolean {
  return issue !== "price_changed";
}

export const couponIssues = [
  "coupon_invalid",
  "coupon_expired",
  "coupon_usage_exhausted",
  "coupon_requires_account",
  "coupon_minimum_not_met",
  "coupon_not_applicable",
] as const;
export type CouponIssue = (typeof couponIssues)[number];

export interface PricingLine {
  id: string;
  quantity: number;
  unitPriceMinor: number;
  unitPriceMinorSnapshot: number;
  /** Product active and variant active. */
  sellable: boolean;
  /** On hand minus reserved; 0 without an inventory row. */
  available: number;
  collectionIds: readonly string[];
}

export interface PricingCoupon {
  discountType: "percentage" | "fixed_amount";
  percentOff: number | null;
  amountOffMinor: number | null;
  maxDiscountMinor: number | null;
  minSubtotalMinor: number;
  collectionId: string | null;
  requiresAccount: boolean;
  startsAt: Date;
  endsAt: Date | null;
  usageLimit: number | null;
  timesRedeemed: number;
  isActive: boolean;
}

export interface PricedLine {
  id: string;
  /** Upper bound the customer may select now (0 when it cannot be bought). */
  maxQuantity: number;
  /** Quantity that counts towards the totals. */
  purchasableQuantity: number;
  lineTotalMinor: number;
  issues: CartItemIssue[];
}

export type CouponEvaluation = { ok: true; discountMinor: number } | { ok: false; issue: CouponIssue };

export interface PricedCart {
  lines: PricedLine[];
  itemCount: number;
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  coupon: CouponEvaluation | null;
  hasIssues: boolean;
}

export function maxSelectableQuantity(available: number): number {
  return Math.max(0, Math.min(MAX_ITEM_QUANTITY, available));
}

export function priceLine(line: PricingLine): PricedLine {
  const issues: CartItemIssue[] = [];
  let purchasableQuantity = line.quantity;
  if (!line.sellable) {
    issues.push("unavailable");
    purchasableQuantity = 0;
  } else if (line.available <= 0) {
    issues.push("out_of_stock");
    purchasableQuantity = 0;
  } else if (line.quantity > line.available) {
    issues.push("insufficient_stock");
    purchasableQuantity = line.available;
  }
  if (line.sellable && line.unitPriceMinor !== line.unitPriceMinorSnapshot) issues.push("price_changed");

  return {
    id: line.id,
    maxQuantity: line.sellable ? maxSelectableQuantity(line.available) : 0,
    purchasableQuantity,
    lineTotalMinor: line.unitPriceMinor * purchasableQuantity,
    issues,
  };
}

/** Rules a coupon must satisfy regardless of the cart contents. */
export function couponStateIssue(coupon: PricingCoupon, ctx: { now: Date; authenticated: boolean }): CouponIssue | null {
  if (!coupon.isActive || coupon.startsAt.getTime() > ctx.now.getTime()) return "coupon_invalid";
  if (coupon.endsAt !== null && coupon.endsAt.getTime() <= ctx.now.getTime()) return "coupon_expired";
  if (coupon.usageLimit !== null && coupon.timesRedeemed >= coupon.usageLimit) return "coupon_usage_exhausted";
  if (coupon.requiresAccount && !ctx.authenticated) return "coupon_requires_account";
  return null;
}

export function evaluateCoupon(
  coupon: PricingCoupon,
  input: { subtotalMinor: number; eligibleSubtotalMinor: number; now: Date; authenticated: boolean },
): CouponEvaluation {
  const stateIssue = couponStateIssue(coupon, input);
  if (stateIssue) return { ok: false, issue: stateIssue };
  if (input.subtotalMinor === 0 || input.subtotalMinor < coupon.minSubtotalMinor) {
    return { ok: false, issue: input.subtotalMinor === 0 ? "coupon_not_applicable" : "coupon_minimum_not_met" };
  }
  if (input.eligibleSubtotalMinor === 0) return { ok: false, issue: "coupon_not_applicable" };

  let discountMinor: number;
  if (coupon.discountType === "percentage") {
    // Rounded down: the customer never gets more than the advertised percentage.
    discountMinor = Math.floor((input.eligibleSubtotalMinor * (coupon.percentOff ?? 0)) / 100);
    if (coupon.maxDiscountMinor !== null) discountMinor = Math.min(discountMinor, coupon.maxDiscountMinor);
  } else {
    discountMinor = coupon.amountOffMinor ?? 0;
  }
  discountMinor = Math.min(discountMinor, input.eligibleSubtotalMinor);
  if (discountMinor <= 0) return { ok: false, issue: "coupon_not_applicable" };
  return { ok: true, discountMinor };
}

export function priceCart(
  lines: readonly PricingLine[],
  coupon: PricingCoupon | null,
  ctx: { now: Date; authenticated: boolean },
): PricedCart {
  const priced = lines.map(priceLine);
  const subtotalMinor = priced.reduce((sum, line) => sum + line.lineTotalMinor, 0);
  const eligibleSubtotalMinor = coupon?.collectionId
    ? priced.reduce((sum, line, index) => (lines[index]!.collectionIds.includes(coupon.collectionId!) ? sum + line.lineTotalMinor : sum), 0)
    : subtotalMinor;

  const evaluation = coupon ? evaluateCoupon(coupon, { subtotalMinor, eligibleSubtotalMinor, ...ctx }) : null;
  const discountMinor = evaluation?.ok ? evaluation.discountMinor : 0;

  return {
    lines: priced,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotalMinor,
    discountMinor,
    totalMinor: subtotalMinor - discountMinor,
    coupon: evaluation,
    hasIssues: priced.some((line) => line.issues.some(isBlockingIssue)) || (evaluation !== null && !evaluation.ok),
  };
}

/** Quantity after merging two lines of the same variant (sign-in merge keeps the larger one). */
export function mergedQuantity(existing: number, incoming: number, mode: "max" | "sum"): number {
  return Math.min(MAX_ITEM_QUANTITY, mode === "max" ? Math.max(existing, incoming) : existing + incoming);
}
