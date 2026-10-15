import { afterEach, describe, expect, it } from "vitest";
import type { App } from "../src/app.js";
import { applyCouponBodySchema, couponCodeSchema } from "../src/modules/cart/cart.contracts.js";
import {
  evaluateCoupon,
  mergedQuantity,
  priceCart,
  priceLine,
  type PricingCoupon,
  type PricingLine,
} from "../src/modules/cart/cart.pricing.js";
import { newsletterConfirmationEmail } from "../src/modules/mail/templates.js";
import { safeHrefSchema } from "../src/modules/marketing/marketing.contracts.js";
import { campaignRuleIssues, couponRuleIssues } from "../src/modules/marketing/marketing.service.js";
import { pgError } from "../src/shared/db-errors.js";
import type { ErrorResponse } from "../src/shared/errors.js";
import { formatBrl } from "../src/shared/money.js";
import { buildTestApp, TEST_ORIGIN } from "./helpers/app.js";

const NOW = new Date("2026-10-15T12:00:00.000Z");
const ctx = { now: NOW, authenticated: false };

function line(overrides: Partial<PricingLine> = {}): PricingLine {
  return {
    id: "line",
    quantity: 2,
    unitPriceMinor: 12990,
    unitPriceMinorSnapshot: 12990,
    sellable: true,
    available: 5,
    collectionIds: [],
    ...overrides,
  };
}

function coupon(overrides: Partial<PricingCoupon> = {}): PricingCoupon {
  return {
    discountType: "percentage",
    percentOff: 10,
    amountOffMinor: null,
    maxDiscountMinor: null,
    minSubtotalMinor: 0,
    collectionId: null,
    requiresAccount: false,
    startsAt: new Date("2026-10-01T00:00:00.000Z"),
    endsAt: null,
    usageLimit: null,
    timesRedeemed: 0,
    isActive: true,
    ...overrides,
  };
}

describe("cart line pricing", () => {
  it("prices a sellable line in integer centavos", () => {
    expect(priceLine(line())).toEqual({ id: "line", maxQuantity: 5, purchasableQuantity: 2, lineTotalMinor: 25980, issues: [] });
  });

  it("caps the selectable quantity at the per-item limit", () => {
    expect(priceLine(line({ available: 50 })).maxQuantity).toBe(10);
  });

  it("excludes unavailable and out-of-stock lines from the totals", () => {
    expect(priceLine(line({ sellable: false }))).toMatchObject({ purchasableQuantity: 0, lineTotalMinor: 0, maxQuantity: 0, issues: ["unavailable"] });
    expect(priceLine(line({ available: 0 }))).toMatchObject({ purchasableQuantity: 0, lineTotalMinor: 0, issues: ["out_of_stock"] });
  });

  it("counts only the available quantity when stock dropped below the request", () => {
    expect(priceLine(line({ quantity: 4, available: 3 }))).toMatchObject({ purchasableQuantity: 3, lineTotalMinor: 38970, issues: ["insufficient_stock"] });
  });

  it("flags price changes without blocking the cart", () => {
    const priced = priceCart([line({ unitPriceMinor: 11990 })], null, ctx);
    expect(priced.lines[0]?.issues).toEqual(["price_changed"]);
    expect(priced.subtotalMinor).toBe(23980);
    expect(priced.hasIssues).toBe(false);
  });
});

describe("coupon evaluation", () => {
  const input = { subtotalMinor: 25980, eligibleSubtotalMinor: 25980, ...ctx };

  it("rounds percentage discounts down and honours the cap", () => {
    expect(evaluateCoupon(coupon({ percentOff: 15 }), { ...input, subtotalMinor: 999, eligibleSubtotalMinor: 999 })).toEqual({ ok: true, discountMinor: 149 });
    expect(evaluateCoupon(coupon({ percentOff: 50, maxDiscountMinor: 5000 }), input)).toEqual({ ok: true, discountMinor: 5000 });
  });

  it("never discounts more than the eligible subtotal", () => {
    const fixed = coupon({ discountType: "fixed_amount", percentOff: null, amountOffMinor: 100_000 });
    expect(evaluateCoupon(fixed, input)).toEqual({ ok: true, discountMinor: 25980 });
  });

  it("rejects inactive, future, expired, exhausted and account-only coupons", () => {
    expect(evaluateCoupon(coupon({ isActive: false }), input)).toEqual({ ok: false, issue: "coupon_invalid" });
    expect(evaluateCoupon(coupon({ startsAt: new Date("2026-11-01T00:00:00.000Z") }), input)).toEqual({ ok: false, issue: "coupon_invalid" });
    expect(evaluateCoupon(coupon({ endsAt: NOW }), input)).toEqual({ ok: false, issue: "coupon_expired" });
    expect(evaluateCoupon(coupon({ usageLimit: 5, timesRedeemed: 5 }), input)).toEqual({ ok: false, issue: "coupon_usage_exhausted" });
    expect(evaluateCoupon(coupon({ requiresAccount: true }), input)).toEqual({ ok: false, issue: "coupon_requires_account" });
    expect(evaluateCoupon(coupon({ requiresAccount: true }), { ...input, authenticated: true })).toMatchObject({ ok: true });
  });

  it("enforces the minimum subtotal and empty carts", () => {
    expect(evaluateCoupon(coupon({ minSubtotalMinor: 30000 }), input)).toEqual({ ok: false, issue: "coupon_minimum_not_met" });
    expect(evaluateCoupon(coupon(), { ...input, subtotalMinor: 0, eligibleSubtotalMinor: 0 })).toEqual({ ok: false, issue: "coupon_not_applicable" });
  });

  it("restricts collection coupons to items of that collection", () => {
    const scoped = coupon({ collectionId: "ritual" });
    const priced = priceCart(
      [line({ id: "a", collectionIds: ["ritual"], quantity: 1 }), line({ id: "b", collectionIds: ["noise"], quantity: 1, unitPriceMinor: 10000, unitPriceMinorSnapshot: 10000 })],
      scoped,
      ctx,
    );
    expect(priced).toMatchObject({ subtotalMinor: 22990, discountMinor: 1299, totalMinor: 21691, coupon: { ok: true } });

    const none = priceCart([line({ collectionIds: ["noise"] })], scoped, ctx);
    expect(none).toMatchObject({ discountMinor: 0, coupon: { ok: false, issue: "coupon_not_applicable" }, hasIssues: true });
  });
});

describe("cart merge quantities", () => {
  it("keeps the larger quantity on sign-in and sums on import, capped at 10", () => {
    expect(mergedQuantity(2, 3, "max")).toBe(3);
    expect(mergedQuantity(2, 3, "sum")).toBe(5);
    expect(mergedQuantity(8, 7, "sum")).toBe(10);
  });
});

describe("marketing validation rules", () => {
  const base = {
    code: "ROCK10",
    description: "10%",
    discountType: "percentage" as const,
    percentOff: 10,
    amountOffMinor: null,
    maxDiscountMinor: null,
    minSubtotalMinor: 0,
    collectionId: null,
    requiresAccount: false,
    startsAt: NOW,
    endsAt: null,
    usageLimit: null,
    isActive: true,
  };

  it("requires a consistent discount shape and period", () => {
    expect(couponRuleIssues(base)).toEqual([]);
    expect(couponRuleIssues({ ...base, percentOff: null }).map((issue) => issue.path)).toEqual(["body.percentOff"]);
    expect(couponRuleIssues({ ...base, discountType: "fixed_amount", maxDiscountMinor: 10 }).map((issue) => issue.path)).toEqual([
      "body.amountOffMinor",
      "body.percentOff",
      "body.maxDiscountMinor",
    ]);
    expect(couponRuleIssues({ ...base, endsAt: NOW }).map((issue) => issue.code)).toEqual(["invalid_period"]);
  });

  it("requires CTA label and destination together and alt text for media", () => {
    const campaign = {
      slug: "drop",
      placement: "home_panel" as const,
      status: "draft" as const,
      title: "Drop",
      subtitle: null,
      ctaLabel: "Ver",
      ctaHref: null,
      mediaUrl: "/images/x.png",
      mediaAlt: " ",
      collectionId: null,
      couponId: null,
      priority: 0,
      startsAt: NOW,
      endsAt: null,
    };
    expect(campaignRuleIssues(campaign).map((issue) => issue.code)).toEqual(["cta_pair", "required"]);
  });

  it("accepts only site paths or https links", () => {
    expect(safeHrefSchema.safeParse("/catalogo?colecao=ritual").success).toBe(true);
    expect(safeHrefSchema.safeParse("https://usrock.com.br/drop").success).toBe(true);
    for (const href of ["//evil.example", "javascript:alert(1)", "http://usrock.com.br", "catalogo"]) {
      expect(safeHrefSchema.safeParse(href).success, href).toBe(false);
    }
  });

  it("normalises coupon codes to uppercase", () => {
    expect(applyCouponBodySchema.parse({ code: "  rock-10 " })).toEqual({ code: "ROCK-10" });
    expect(couponCodeSchema.safeParse("a b").success).toBe(false);
    expect(couponCodeSchema.safeParse("<x>").success).toBe(false);
  });
});

describe("helpers", () => {
  it("formats BRL for server messages", () => {
    expect(formatBrl(12990)).toBe("R$ 129,90");
  });

  it("unwraps PostgreSQL errors from driver wrappers", () => {
    expect(pgError({ message: "x", cause: { code: "23505", constraint: "coupons_code_unique" } })).toEqual({ code: "23505", constraint: "coupons_code_unique" });
    expect(pgError(new Error("plain"))).toBeUndefined();
  });

  it("escapes links in the newsletter confirmation email", () => {
    const message = newsletterConfirmationEmail({
      to: "a@b.c",
      confirmUrl: 'https://usrock.com.br/n?token="><script>',
      unsubscribeUrl: "https://usrock.com.br/c?token=abc",
      expiresInHours: 48,
    });
    expect(message.html).not.toContain("<script>");
    expect(message.text).toContain("https://usrock.com.br/c?token=abc");
  });
});

describe("commerce routes without a database", () => {
  let app: App;
  afterEach(async () => {
    await app.close();
  });

  it("validates cart input before touching the database", async () => {
    ({ app } = await buildTestApp());
    const bad = await app.inject({ method: "POST", url: "/api/v1/cart/items", headers: { origin: TEST_ORIGIN }, payload: { variantId: "x", quantity: 11 } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json<ErrorResponse>().error.details?.map((detail) => detail.path).sort()).toEqual(["body.quantity", "body.variantId"]);
  });

  it("blocks cart changes from foreign origins", async () => {
    ({ app } = await buildTestApp());
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/cart/items",
      headers: { origin: "https://evil.example" },
      payload: { variantId: "00000000-0000-4000-8000-000000000000" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("requires a session for favorites and a permission for admin routes", async () => {
    ({ app } = await buildTestApp());
    expect((await app.inject({ method: "GET", url: "/api/v1/me/favorites" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/v1/admin/coupons" })).statusCode).toBe(401);
  });

  it("requires explicit consent to subscribe to the newsletter", async () => {
    ({ app } = await buildTestApp());
    const res = await app.inject({ method: "POST", url: "/api/v1/newsletter/subscriptions", payload: { email: "fa@example.com", consent: false } });
    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorResponse>().error.details?.[0]?.path).toBe("body.consent");
  });
});
