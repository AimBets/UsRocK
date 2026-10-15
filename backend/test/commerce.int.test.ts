import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import type { App } from "../src/app.js";
import { createDatabase } from "../src/db/client.js";
import { seedDemoCatalog } from "../src/db/seed.js";
import { demoSku } from "../src/db/seed-data/demo-catalog.js";
import { consents, users } from "../src/modules/accounts/accounts.schema.js";
import type { CartView } from "../src/modules/cart/cart.contracts.js";
import { carts } from "../src/modules/cart/cart.schema.js";
import { collections, inventoryLevels, products, productVariants } from "../src/modules/catalog/catalog.schema.js";
import { createMemoryMailer } from "../src/modules/mail/mailer.js";
import type { AdminCoupon, PublicCampaign } from "../src/modules/marketing/marketing.contracts.js";
import { campaigns, coupons } from "../src/modules/marketing/marketing.schema.js";
import { newsletterEvents, newsletterSubscriptions } from "../src/modules/newsletter/newsletter.schema.js";
import type { ErrorResponse } from "../src/shared/errors.js";
import type { captureLogs } from "./helpers/app.js";
import { buildTestApp, TEST_ORIGIN } from "./helpers/app.js";

const database = createDatabase(inject("testDatabaseUrl"), { poolMax: 3 });
const { db } = database;
const mailer = createMemoryMailer();
let app: App;
let logs: ReturnType<typeof captureLogs>;

const SESSION = "usrock_session";
const CART = "usrock_cart";
const PASSWORD = "riff-pesado-2026";
const DAY_MS = 86_400_000;

type Cookies = Record<string, string>;
type Res = Awaited<ReturnType<App["inject"]>>;

/** Minimal cookie jar: applies Set-Cookie (including deletions) from each response. */
function jar(initial: Cookies = {}) {
  const cookies: Cookies = { ...initial };
  return {
    cookies,
    update(res: Res) {
      for (const cookie of res.cookies) {
        if (cookie.value === "" || cookie.maxAge === 0) delete cookies[cookie.name];
        else cookies[cookie.name] = cookie.value;
      }
      return res;
    },
  };
}

type Jar = ReturnType<typeof jar>;

async function call(j: Jar, method: "GET" | "POST" | "PATCH" | "DELETE" | "PUT", url: string, payload?: unknown) {
  const res = await app.inject({
    method,
    url: `/api/v1${url}`,
    headers: { origin: TEST_ORIGIN },
    cookies: j.cookies,
    ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}),
  });
  return j.update(res);
}

const cartOf = (res: Res) => res.json<CartView>();
const errorOf = (res: Res) => res.json<ErrorResponse>().error;

async function variantId(slug: string, size: string): Promise<string> {
  const [row] = await db.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.sku, demoSku(slug, size)));
  if (!row) throw new Error(`variant ${slug}/${size} not found`);
  return row.id;
}

async function setStock(id: string, onHand: number, reserved = 0) {
  await db.update(inventoryLevels).set({ onHand, reserved }).where(eq(inventoryLevels.variantId, id));
}

let emailCounter = 0;
async function customer(): Promise<{ jar: Jar; email: string; userId: string }> {
  emailCounter += 1;
  const email = `cliente${emailCounter}@example.com`;
  const j = jar();
  const res = await call(j, "POST", "/auth/register", { email, password: PASSWORD, name: "Fã de Rock", acceptTerms: true });
  expect(res.statusCode, res.body).toBe(201);
  return { jar: j, email, userId: res.json<{ user: { id: string } }>().user.id };
}

async function login(j: Jar, email: string) {
  const res = await call(j, "POST", "/auth/login", { email, password: PASSWORD });
  expect(res.statusCode, res.body).toBe(200);
}

async function insertCoupon(values: Partial<typeof coupons.$inferInsert> & { code: string }) {
  const [row] = await db
    .insert(coupons)
    .values({ description: "Cupom de teste", discountType: "percentage", percentOff: 10, ...values })
    .returning();
  return row!;
}

let nocturneM: string;
let nocturneG: string;
let serpentXG: string;
let staticGG: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE newsletter_events, newsletter_subscriptions, favorites, cart_items, carts, campaigns, coupons,
    consents, password_reset_tokens, sessions, users RESTART IDENTITY CASCADE`);
  await db.execute(sql`TRUNCATE inventory_movements, inventory_levels, product_media, product_variants, product_collections, products, collections, categories RESTART IDENTITY CASCADE`);
  await seedDemoCatalog(db);
  ({ app, logs } = await buildTestApp({ database, mailer, env: { AUTH_RATE_LIMIT_MAX: "1000", RATE_LIMIT_MAX: "10000" } }));
  await app.ready();
  nocturneM = await variantId("nocturne-wings-oversized", "M");
  nocturneG = await variantId("nocturne-wings-oversized", "G");
  serpentXG = await variantId("eclipse-serpent-heavy-tee", "XG");
  staticGG = await variantId("static-star-essential", "GG");
});

beforeEach(() => {
  mailer.messages.length = 0;
});

afterAll(async () => {
  await app.close();
  await database.close();
});

describe("guest cart", () => {
  it("returns an empty cart without creating one", async () => {
    const j = jar();
    const res = await call(j, "GET", "/cart");
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(cartOf(res)).toMatchObject({ id: null, owner: "guest", items: [], itemCount: 0, coupon: null, hasIssues: false });
    expect(res.cookies).toHaveLength(0);
  });

  it("creates the cart on first add with an httpOnly cookie, storing only its hash", async () => {
    const j = jar();
    const res = await call(j, "POST", "/cart/items", { variantId: nocturneM, quantity: 2 });
    expect(res.statusCode, res.body).toBe(200);
    const cookie = res.cookies.find((item) => item.name === CART);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });
    expect(cookie?.value).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const cart = cartOf(res);
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]).toMatchObject({
      quantity: 2,
      maxQuantity: 10,
      product: { slug: "nocturne-wings-oversized", isDemo: true },
      variant: { id: nocturneM, size: "M", availability: "in_stock" },
      unitPrice: { amountMinor: 12990, currencyCode: "BRL" },
      lineTotal: { amountMinor: 25980, currencyCode: "BRL" },
      issues: [],
    });
    expect(cart.totals).toEqual({
      subtotal: { amountMinor: 25980, currencyCode: "BRL" },
      discount: { amountMinor: 0, currencyCode: "BRL" },
      shipping: null,
      total: { amountMinor: 25980, currencyCode: "BRL" },
    });

    const stored = await db.select({ hash: carts.guestTokenHash }).from(carts).where(eq(carts.id, cart.id!));
    expect(stored[0]?.hash).not.toBe(cookie?.value);
    expect(stored[0]?.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ignores prices sent by the client and sums repeated adds", async () => {
    const j = jar();
    await call(j, "POST", "/cart/items", { variantId: nocturneM, quantity: 1, unitPrice: { amountMinor: 1, currencyCode: "BRL" } });
    const res = await call(j, "POST", "/cart/items", { variantId: nocturneM, quantity: 3 });
    expect(cartOf(res).items[0]).toMatchObject({ quantity: 4, unitPrice: { amountMinor: 12990 } });
    expect(cartOf(res).totals.total.amountMinor).toBe(4 * 12990);
  });

  it("enforces the per-item limit, stock and sellability on the server", async () => {
    const j = jar();
    await call(j, "POST", "/cart/items", { variantId: nocturneM, quantity: 9 });
    const tooMany = await call(j, "POST", "/cart/items", { variantId: nocturneM, quantity: 2 });
    expect(tooMany.statusCode).toBe(409);
    expect(errorOf(tooMany).details?.[0]).toMatchObject({ path: "body.quantity", code: "max_quantity_exceeded" });

    const soldOut = await call(j, "POST", "/cart/items", { variantId: staticGG, quantity: 1 });
    expect(soldOut.statusCode).toBe(409);
    expect(errorOf(soldOut).details?.[0]?.code).toBe("out_of_stock");

    const insufficient = await call(j, "POST", "/cart/items", { variantId: serpentXG, quantity: 3 });
    expect(insufficient.statusCode).toBe(409);
    expect(errorOf(insufficient).details?.[0]?.code).toBe("insufficient_stock");

    const unknown = await call(j, "POST", "/cart/items", { variantId: "00000000-0000-4000-8000-000000000000" });
    expect(unknown.statusCode).toBe(404);
  });

  it("refuses variants of products that are not active", async () => {
    const [draft] = await db.insert(products).values({ slug: "rascunho-carrinho", name: "Rascunho", status: "draft" }).returning();
    const [variant] = await db.insert(productVariants).values({ productId: draft!.id, sku: "TEST-CART-DRAFT-M", size: "M", priceMinor: 100 }).returning();
    await db.insert(inventoryLevels).values({ variantId: variant!.id, onHand: 10 });
    const res = await call(jar(), "POST", "/cart/items", { variantId: variant!.id });
    expect(res.statusCode).toBe(404);
  });

  it("updates and removes items, scoped to the owner's cart", async () => {
    const owner = jar();
    const added = cartOf(await call(owner, "POST", "/cart/items", { variantId: nocturneM }));
    const itemId = added.items[0]!.id;

    const updated = await call(owner, "PATCH", `/cart/items/${itemId}`, { quantity: 5 });
    expect(cartOf(updated).items[0]?.quantity).toBe(5);
    const overStock = await call(owner, "PATCH", `/cart/items/${itemId}`, { quantity: 10 });
    expect(overStock.statusCode).toBe(200); // 12 in stock

    // Another visitor cannot touch the item, even knowing its id.
    const stranger = jar();
    await call(stranger, "POST", "/cart/items", { variantId: nocturneG });
    expect((await call(stranger, "PATCH", `/cart/items/${itemId}`, { quantity: 1 })).statusCode).toBe(404);
    expect((await call(stranger, "DELETE", `/cart/items/${itemId}`)).statusCode).toBe(404);
    expect((await call(jar(), "DELETE", `/cart/items/${itemId}`)).statusCode).toBe(404);

    const removed = await call(owner, "DELETE", `/cart/items/${itemId}`);
    expect(cartOf(removed)).toMatchObject({ items: [], itemCount: 0 });
  });

  it("re-validates price and stock on every read", async () => {
    const j = jar();
    const variant = await variantId("iron-bloom-heavy-tee", "M");
    await call(j, "POST", "/cart/items", { variantId: variant, quantity: 4 });
    await call(j, "POST", "/cart/items", { variantId: nocturneG, quantity: 1 });

    await setStock(variant, 5, 3); // 2 available
    await db.update(productVariants).set({ priceMinor: 9990 }).where(eq(productVariants.id, nocturneG));
    try {
      const cart = cartOf(await call(j, "GET", "/cart"));
      const iron = cart.items.find((item) => item.variant.id === variant)!;
      const nocturne = cart.items.find((item) => item.variant.id === nocturneG)!;
      expect(iron).toMatchObject({ quantity: 4, maxQuantity: 2, issues: ["insufficient_stock"], lineTotal: { amountMinor: 2 * 14990 } });
      expect(nocturne).toMatchObject({ issues: ["price_changed"], unitPrice: { amountMinor: 9990 }, previousUnitPrice: { amountMinor: 12990 } });
      expect(cart.totals.subtotal.amountMinor).toBe(2 * 14990 + 9990);
      expect(cart.hasIssues).toBe(true);

      // Archiving the product makes the line unavailable and removes it from the totals.
      const [iron_] = await db.select({ productId: productVariants.productId }).from(productVariants).where(eq(productVariants.id, variant));
      await db.update(products).set({ status: "archived" }).where(eq(products.id, iron_!.productId));
      const archived = cartOf(await call(j, "GET", "/cart"));
      expect(archived.items.find((item) => item.variant.id === variant)).toMatchObject({ issues: ["unavailable"], maxQuantity: 0, lineTotal: { amountMinor: 0 } });
      expect(archived.totals.subtotal.amountMinor).toBe(9990);
      const patch = await call(j, "PATCH", `/cart/items/${iron.id}`, { quantity: 1 });
      expect(patch.statusCode).toBe(409);
      expect(errorOf(patch).details?.[0]?.code).toBe("unavailable");
      await db.update(products).set({ status: "active" }).where(eq(products.id, iron_!.productId));
    } finally {
      await setStock(variant, 7);
      await db.update(productVariants).set({ priceMinor: 12990 }).where(eq(productVariants.id, nocturneG));
    }
  });

  it("serialises concurrent changes to the same cart", async () => {
    const j = jar();
    await call(j, "POST", "/cart/items", { variantId: nocturneG, quantity: 1 });
    const results = await Promise.all(
      Array.from({ length: 6 }, () => call(jar({ ...j.cookies }), "POST", "/cart/items", { variantId: nocturneM, quantity: 2 })),
    );
    const statuses = results.map((res) => res.statusCode).sort();
    expect(statuses).toEqual([200, 200, 200, 200, 200, 409]);
    const cart = cartOf(await call(j, "GET", "/cart"));
    expect(cart.items.find((item) => item.variant.id === nocturneM)?.quantity).toBe(10);
  });

  it("treats an expired guest cart as empty and clears its cookie", async () => {
    const j = jar();
    const cart = cartOf(await call(j, "POST", "/cart/items", { variantId: nocturneM }));
    await db.update(carts).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(carts.id, cart.id!));
    const res = await call(j, "GET", "/cart");
    expect(cartOf(res)).toMatchObject({ id: null, items: [] });
    expect(j.cookies[CART]).toBeUndefined();
  });

  it("imports the browser preview, skipping what cannot be sold", async () => {
    const j = jar();
    await call(j, "POST", "/cart/items", { variantId: nocturneM, quantity: 8 });
    const unknown = "00000000-0000-4000-8000-000000000001";
    const res = await call(j, "POST", "/cart/import", {
      items: [
        { variantId: nocturneM, quantity: 5 },
        { variantId: nocturneG, quantity: 1 },
        { variantId: nocturneG, quantity: 1 },
        { variantId: unknown, quantity: 1 },
      ],
    });
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json<{ cart: CartView; skipped: { variantId: string; reason: string }[] }>();
    expect(body.skipped).toEqual([{ variantId: unknown, reason: "unavailable" }]);
    expect(body.cart.items.map((item) => [item.variant.id, item.quantity])).toEqual([
      [nocturneM, 10],
      [nocturneG, 2],
    ]);
  });
});

describe("sign-in merge", () => {
  it("merges the guest cart into the account cart on the first cart request", async () => {
    const { jar: account, email } = await customer();
    await call(account, "POST", "/cart/items", { variantId: nocturneM, quantity: 2 });
    await call(account, "POST", "/auth/logout", {});
    expect(account.cookies[SESSION]).toBeUndefined();

    // Same browser, now as a guest.
    const guestAdd = await call(account, "POST", "/cart/items", { variantId: nocturneM, quantity: 3 });
    expect(cartOf(guestAdd).owner).toBe("guest");
    await call(account, "POST", "/cart/items", { variantId: nocturneG, quantity: 1 });
    const guestCartId = cartOf(guestAdd).id!;
    expect(account.cookies[CART]).toBeDefined();

    await login(account, email);
    const merged = await call(account, "GET", "/cart");
    const cart = cartOf(merged);
    expect(cart.owner).toBe("customer");
    expect(cart.items.map((item) => [item.variant.id, item.quantity])).toEqual([
      [nocturneM, 3], // larger quantity wins, not 2 + 3
      [nocturneG, 1],
    ]);
    expect(account.cookies[CART]).toBeUndefined();
    expect(await db.select().from(carts).where(eq(carts.id, guestCartId))).toHaveLength(0);

    // The account cart follows the customer to a new device.
    const otherDevice = jar();
    await login(otherDevice, email);
    expect(cartOf(await call(otherDevice, "GET", "/cart")).itemCount).toBe(4);
  });

  it("carries the guest coupon over when the account cart has none", async () => {
    await insertCoupon({ code: "MERGE10" });
    const { jar: account, email } = await customer();
    await call(account, "POST", "/auth/logout", {});
    await call(account, "POST", "/cart/items", { variantId: nocturneM });
    expect((await call(account, "PUT", "/cart/coupon", { code: "merge10" })).statusCode).toBe(200);
    await login(account, email);
    const cart = cartOf(await call(account, "GET", "/cart"));
    expect(cart.coupon).toMatchObject({ code: "MERGE10", status: "applied", discount: { amountMinor: 1299 } });
  });
});

describe("coupons in the cart", () => {
  it("applies a valid coupon and recomputes it as the cart changes", async () => {
    await insertCoupon({ code: "ROCK15", percentOff: 15, minSubtotalMinor: 20000, description: "15% acima de R$ 200" });
    const j = jar();
    const added = cartOf(await call(j, "POST", "/cart/items", { variantId: nocturneM, quantity: 2 }));
    const applied = await call(j, "PUT", "/cart/coupon", { code: " rock15 " });
    expect(applied.statusCode, applied.body).toBe(200);
    expect(cartOf(applied).coupon).toEqual({
      code: "ROCK15",
      description: "15% acima de R$ 200",
      status: "applied",
      issue: null,
      discount: { amountMinor: 3897, currencyCode: "BRL" },
      minimumSubtotal: { amountMinor: 20000, currencyCode: "BRL" },
    });
    expect(cartOf(applied).totals.total.amountMinor).toBe(25980 - 3897);

    // Dropping below the minimum keeps the code but stops the discount.
    const reduced = cartOf(await call(j, "PATCH", `/cart/items/${added.items[0]!.id}`, { quantity: 1 }));
    expect(reduced.coupon).toMatchObject({ status: "not_applicable", issue: "coupon_minimum_not_met", discount: { amountMinor: 0 } });
    expect(reduced.totals.total.amountMinor).toBe(12990);
    expect(reduced.hasIssues).toBe(true);

    const removed = cartOf(await call(j, "DELETE", "/cart/coupon"));
    expect(removed).toMatchObject({ coupon: null, hasIssues: false });
  });

  it("rejects coupons with stable reasons", async () => {
    const now = Date.now();
    await insertCoupon({ code: "EXPIRED", startsAt: new Date(now - 2 * DAY_MS), endsAt: new Date(now - DAY_MS) });
    await insertCoupon({ code: "FUTURE", startsAt: new Date(now + DAY_MS) });
    await insertCoupon({ code: "INACTIVE", isActive: false });
    await insertCoupon({ code: "SOLDOUT", usageLimit: 1, timesRedeemed: 1 });
    await insertCoupon({ code: "MEMBERS", requiresAccount: true });
    await insertCoupon({ code: "BIGCART", minSubtotalMinor: 100_000 });
    const [noise] = await db.select().from(collections).where(eq(collections.slug, "noise-division"));
    await insertCoupon({ code: "NOISE", collectionId: noise!.id });

    const j = jar();
    expect(errorOf(await call(j, "PUT", "/cart/coupon", { code: "ROCK15" })).details?.[0]?.code).toBe("coupon_not_applicable");
    await call(j, "POST", "/cart/items", { variantId: nocturneM });

    const reasons: Record<string, string> = {
      NAOEXISTE: "coupon_invalid",
      FUTURE: "coupon_invalid",
      INACTIVE: "coupon_invalid",
      EXPIRED: "coupon_expired",
      SOLDOUT: "coupon_usage_exhausted",
      MEMBERS: "coupon_requires_account",
      BIGCART: "coupon_minimum_not_met",
      NOISE: "coupon_not_applicable",
    };
    for (const [code, reason] of Object.entries(reasons)) {
      const res = await call(j, "PUT", "/cart/coupon", { code });
      expect(res.statusCode, code).toBe(400);
      expect(errorOf(res).details?.[0], code).toMatchObject({ path: "body.code", code: reason });
    }
    expect(errorOf(await call(j, "PUT", "/cart/coupon", { code: "BIGCART" })).message).toBe("Este cupom exige subtotal mínimo de R$ 1.000,00.");
    expect(cartOf(await call(j, "GET", "/cart")).coupon).toBeNull();

    const { jar: member } = await customer();
    await call(member, "POST", "/cart/items", { variantId: nocturneM });
    expect((await call(member, "PUT", "/cart/coupon", { code: "MEMBERS" })).statusCode).toBe(200);
  });
});

describe("favorites", () => {
  it("adds, lists, removes and imports favourites idempotently", async () => {
    const { jar: j, userId } = await customer();
    const [nocturne] = await db.select().from(products).where(eq(products.slug, "nocturne-wings-oversized"));
    const [serpent] = await db.select().from(products).where(eq(products.slug, "eclipse-serpent-heavy-tee"));

    expect((await call(j, "PUT", `/me/favorites/${nocturne!.id}`)).statusCode).toBe(204);
    expect((await call(j, "PUT", `/me/favorites/${nocturne!.id}`)).statusCode).toBe(204);
    const list = await call(j, "GET", "/me/favorites");
    expect(list.headers["cache-control"]).toBe("no-store");
    const data = list.json<{ data: { product: { slug: string; priceRange: unknown }; addedAt: string }[] }>().data;
    expect(data.map((item) => item.product.slug)).toEqual(["nocturne-wings-oversized"]);
    expect(data[0]?.product.priceRange).toBeDefined();

    const imported = await call(j, "POST", "/me/favorites/import", {
      productIds: [serpent!.id, nocturne!.id, "00000000-0000-4000-8000-000000000002"],
    });
    expect(imported.statusCode, imported.body).toBe(200);
    expect(imported.json<{ data: unknown[] }>().data).toHaveLength(2);

    expect((await call(j, "DELETE", `/me/favorites/${serpent!.id}`)).statusCode).toBe(204);
    expect((await call(j, "DELETE", `/me/favorites/${serpent!.id}`)).statusCode).toBe(204);
    expect((await call(j, "PUT", "/me/favorites/00000000-0000-4000-8000-000000000003")).statusCode).toBe(404);

    // Archived products stay stored but are hidden from the list.
    await db.update(products).set({ status: "archived" }).where(eq(products.id, nocturne!.id));
    try {
      expect((await call(j, "GET", "/me/favorites")).json<{ data: unknown[] }>().data).toHaveLength(0);
    } finally {
      await db.update(products).set({ status: "active" }).where(eq(products.id, nocturne!.id));
    }

    // Favourites are private to the account.
    const { jar: other } = await customer();
    expect((await call(other, "GET", "/me/favorites")).json<{ data: unknown[] }>().data).toHaveLength(0);
    expect(userId).toBeDefined();
  });
});

describe("campaigns", () => {
  async function asAdmin(): Promise<Jar> {
    const { jar: j, userId } = await customer();
    await db.update(users).set({ roles: ["admin"] }).where(eq(users.id, userId));
    return j;
  }

  it("lets only campaign managers administer coupons and campaigns", async () => {
    const { jar: shopper } = await customer();
    expect((await call(shopper, "GET", "/admin/coupons")).statusCode).toBe(403);
    expect((await call(shopper, "POST", "/admin/campaigns", { slug: "x", placement: "home_panel", title: "X", startsAt: new Date().toISOString() })).statusCode).toBe(403);

    const admin = await asAdmin();
    const created = await call(admin, "POST", "/admin/coupons", {
      code: "drop20",
      description: "20% no drop",
      discountType: "percentage",
      percentOff: 20,
      maxDiscountMinor: 5000,
    });
    expect(created.statusCode, created.body).toBe(201);
    const coupon = created.json<AdminCoupon>();
    expect(coupon).toMatchObject({ code: "DROP20", percentOff: 20, maxDiscount: { amountMinor: 5000 }, timesRedeemed: 0, isActive: true });

    expect((await call(admin, "POST", "/admin/coupons", { code: "DROP20", description: "dup", discountType: "percentage", percentOff: 5 })).statusCode).toBe(409);
    const badShape = await call(admin, "POST", "/admin/coupons", { code: "BAD1", description: "x", discountType: "fixed_amount", percentOff: 5 });
    expect(badShape.statusCode).toBe(400);
    expect(errorOf(badShape).details?.map((detail) => detail.path)).toEqual(["body.amountOffMinor", "body.percentOff"]);

    const patched = await call(admin, "PATCH", `/admin/coupons/${coupon.id}`, { isActive: false });
    expect(patched.json<AdminCoupon>().isActive).toBe(false);
    expect((await call(admin, "PATCH", `/admin/coupons/${coupon.id}`, { endsAt: "2020-01-01T00:00:00.000Z" })).statusCode).toBe(400);
    const listed = await call(admin, "GET", "/admin/coupons?limit=2");
    expect(listed.json<{ data: AdminCoupon[]; pageInfo: { hasNextPage: boolean; nextCursor: string | null } }>().pageInfo.hasNextPage).toBe(true);
    const cursor = listed.json<{ pageInfo: { nextCursor: string } }>().pageInfo.nextCursor;
    const next = await call(admin, "GET", `/admin/coupons?limit=2&cursor=${cursor}`);
    expect(next.statusCode).toBe(200);
    const firstIds = listed.json<{ data: AdminCoupon[] }>().data.map((item) => item.id);
    expect(next.json<{ data: AdminCoupon[] }>().data.some((item) => firstIds.includes(item.id))).toBe(false);

    const unsafe = await call(admin, "POST", "/admin/campaigns", {
      slug: "drop-perigoso",
      placement: "home_panel",
      title: "Drop",
      ctaLabel: "Ver",
      ctaHref: "//evil.example",
      startsAt: new Date().toISOString(),
    });
    expect(unsafe.statusCode).toBe(400);
  });

  it("publishes only campaigns inside their period, with valid coupons and published collections", async () => {
    const admin = await asAdmin();
    const now = Date.now();
    const coupon = await insertCoupon({ code: "PANEL10" });
    const expiredCoupon = await insertCoupon({ code: "OLDDROP", startsAt: new Date(now - 3 * DAY_MS), endsAt: new Date(now - DAY_MS) });
    const [ritual] = await db.select().from(collections).where(eq(collections.slug, "ritual-collection"));

    const create = async (slug: string, extra: Record<string, unknown>) => {
      const res = await call(admin, "POST", "/admin/campaigns", {
        slug,
        placement: "home_panel",
        title: `Campanha ${slug}`,
        startsAt: new Date(now - DAY_MS).toISOString(),
        ...extra,
      });
      expect(res.statusCode, res.body).toBe(201);
      return res.json<{ id: string }>().id;
    };

    const live = await create("ritual-drop", {
      status: "published",
      priority: 10,
      subtitle: "Peças novas",
      ctaLabel: "Ver coleção",
      ctaHref: "/catalogo?collection=ritual-collection",
      mediaUrl: "/images/product-serpent.png",
      mediaAlt: "Camiseta grafite",
      collectionId: ritual!.id,
      couponId: coupon.id,
      endsAt: new Date(now + DAY_MS).toISOString(),
    });
    await create("secondary", { status: "published", couponId: expiredCoupon.id });
    await create("rascunho", {});
    await create("futura", { status: "published", startsAt: new Date(now + DAY_MS).toISOString() });
    await create("encerrada", { status: "published", startsAt: new Date(now - 3 * DAY_MS).toISOString(), endsAt: new Date(now - DAY_MS).toISOString() });
    await create("barra", { status: "published", placement: "announcement_bar" });

    const res = await app.inject({ method: "GET", url: "/api/v1/campaigns/active?placement=home_panel" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toContain("public");
    const data = res.json<{ data: PublicCampaign[] }>().data;
    expect(data.map((campaign) => campaign.slug)).toEqual(["ritual-drop", "secondary"]);
    expect(data[0]).toMatchObject({
      id: live,
      cta: { label: "Ver coleção", href: "/catalogo?collection=ritual-collection" },
      media: { url: "/images/product-serpent.png", alt: "Camiseta grafite" },
      collection: { slug: "ritual-collection" },
      couponCode: "PANEL10",
      isDemo: false,
    });
    expect(data[1]?.couponCode).toBeNull();

    const all = (await app.inject({ method: "GET", url: "/api/v1/campaigns/active" })).json<{ data: PublicCampaign[] }>().data;
    expect(all.map((campaign) => campaign.slug).sort()).toEqual(["barra", "ritual-drop", "secondary"]);

    await call(admin, "PATCH", `/admin/campaigns/${live}`, { status: "archived" });
    const after = (await app.inject({ method: "GET", url: "/api/v1/campaigns/active?placement=home_panel" })).json<{ data: PublicCampaign[] }>().data;
    expect(after.map((campaign) => campaign.slug)).toEqual(["secondary"]);
    await db.delete(campaigns);
  });
});

describe("newsletter double opt-in", () => {
  const tokenFrom = (text: string, path: string) => new RegExp(`${path}\\?token=([A-Za-z0-9_-]{43})`).exec(text)?.[1];

  async function waitForMail() {
    for (let attempt = 0; attempt < 50 && mailer.messages.length === 0; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 10));
    const message = mailer.messages.at(-1);
    if (!message) throw new Error("no email sent");
    return message;
  }

  it("subscribes only after confirmation and records consent for accounts", async () => {
    const { email, userId } = await customer();
    const res = await call(jar(), "POST", "/newsletter/subscriptions", { email: email.toUpperCase(), consent: true, source: "footer" });
    expect(res.statusCode).toBe(202);

    const message = await waitForMail();
    expect(message.to).toBe(email);
    const confirm = tokenFrom(message.text, "/newsletter/confirmar");
    const cancel = tokenFrom(message.text, "/newsletter/cancelar");
    expect(confirm && cancel).toBeTruthy();

    const [pending] = await db.select().from(newsletterSubscriptions).where(eq(newsletterSubscriptions.email, email));
    expect(pending).toMatchObject({ status: "pending", policyVersion: "rascunho-2026-10", source: "footer" });
    expect(pending?.confirmTokenHash).not.toBe(confirm);

    const confirmed = await call(jar(), "POST", "/newsletter/confirm", { token: confirm });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json()).toEqual({ status: "confirmed" });
    expect((await call(jar(), "POST", "/newsletter/confirm", { token: confirm })).statusCode).toBe(400);

    const [row] = await db.select().from(newsletterSubscriptions).where(eq(newsletterSubscriptions.email, email));
    expect(row).toMatchObject({ status: "confirmed", userId, confirmTokenHash: null });
    const granted = await db.select().from(consents).where(and(eq(consents.userId, userId), eq(consents.source, "newsletter_confirm")));
    expect(granted).toMatchObject([{ purpose: "marketing_email", granted: true }]);

    // Asking again while confirmed answers the same and sends nothing.
    mailer.messages.length = 0;
    const again = await call(jar(), "POST", "/newsletter/subscriptions", { email, consent: true });
    expect(again.statusCode).toBe(202);
    expect(again.json()).toEqual(res.json());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mailer.messages).toHaveLength(0);

    const out = await call(jar(), "POST", "/newsletter/unsubscribe", { token: cancel });
    expect(out.json()).toEqual({ status: "unsubscribed" });
    expect((await call(jar(), "POST", "/newsletter/unsubscribe", { token: cancel })).statusCode).toBe(200);
    const withdrawn = await db.select().from(consents).where(and(eq(consents.userId, userId), eq(consents.source, "newsletter_unsubscribe")));
    expect(withdrawn).toMatchObject([{ purpose: "marketing_email", granted: false }]);

    const events = await db.select({ event: newsletterEvents.event }).from(newsletterEvents).where(eq(newsletterEvents.subscriptionId, row!.id)).orderBy(newsletterEvents.createdAt);
    expect(events.map((item) => item.event)).toEqual(["subscribe_requested", "confirmed", "unsubscribed"]);
  });

  it("rejects expired or forged tokens and never logs addresses or tokens", async () => {
    const email = "leitor@example.com";
    await call(jar(), "POST", "/newsletter/subscriptions", { email, consent: true, source: "home" });
    const message = await waitForMail();
    const confirm = tokenFrom(message.text, "/newsletter/confirmar")!;
    await db.update(newsletterSubscriptions).set({ confirmExpiresAt: new Date(Date.now() - 1000) }).where(eq(newsletterSubscriptions.email, email));

    const expired = await call(jar(), "POST", "/newsletter/confirm", { token: confirm });
    expect(expired.statusCode).toBe(400);
    expect(errorOf(expired).details?.[0]).toMatchObject({ path: "body.token", code: "invalid_token" });
    expect((await call(jar(), "POST", "/newsletter/unsubscribe", { token: "A".repeat(43) })).statusCode).toBe(400);

    const raw = logs.raw();
    expect(raw).not.toContain(email);
    expect(raw).not.toContain(confirm);
  });

  it("does not re-send a pending confirmation within a minute", async () => {
    const email = "pressa@example.com";
    await call(jar(), "POST", "/newsletter/subscriptions", { email, consent: true });
    await waitForMail();
    mailer.messages.length = 0;
    await call(jar(), "POST", "/newsletter/subscriptions", { email, consent: true });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mailer.messages).toHaveLength(0);
  });
});

describe("data hygiene", () => {
  it("removes a customer's cart and favourites with the account", async () => {
    const { jar: j, userId } = await customer();
    await call(j, "POST", "/cart/items", { variantId: nocturneM });
    await db.delete(users).where(eq(users.id, userId));
    expect(await db.select().from(carts).where(eq(carts.userId, userId))).toHaveLength(0);
    const orphanItems = await db.execute(sql`SELECT count(*)::int AS n FROM cart_items ci LEFT JOIN carts c ON c.id = ci.cart_id WHERE c.id IS NULL`);
    expect((orphanItems.rows[0] as { n: number }).n).toBe(0);
  });
});
