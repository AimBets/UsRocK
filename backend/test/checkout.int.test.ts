import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import type { App } from "../src/app.js";
import { createDatabase } from "../src/db/client.js";
import { seedDemoCatalog } from "../src/db/seed.js";
import { demoProducts, demoSku } from "../src/db/seed-data/demo-catalog.js";
import { expirePendingOrders } from "../src/jobs/jobs.js";
import { users } from "../src/modules/accounts/accounts.schema.js";
import type { CartView } from "../src/modules/cart/cart.contracts.js";
import { inventoryLevels, inventoryMovements, productVariants } from "../src/modules/catalog/catalog.schema.js";
import { createMemoryMailer, type Mailer } from "../src/modules/mail/mailer.js";
import { coupons } from "../src/modules/marketing/marketing.schema.js";
import { dispatchNotifications } from "../src/modules/notifications/notifications.service.js";
import { notifications } from "../src/modules/notifications/notifications.schema.js";
import { disabledWhatsAppSender } from "../src/modules/notifications/whatsapp.js";
import type { AdminOrderView, OrderView } from "../src/modules/orders/orders.contracts.js";
import { couponRedemptions, orders, orderStatusHistory, shippingQuotes, stockReservations } from "../src/modules/orders/orders.schema.js";
import { createMercadoPagoGateway } from "../src/modules/payments/mercadopago.client.js";
import { payments, webhookEvents } from "../src/modules/payments/payments.schema.js";
import { createSuperFreteProvider } from "../src/modules/shipping/superfrete.client.js";
import type { ErrorResponse } from "../src/shared/errors.js";
import { buildTestApp, TEST_ORIGIN, type captureLogs } from "./helpers/app.js";
import { mercadoPagoSignature, startFakeMercadoPago, startFakeSuperFrete, superFreteSignature } from "./helpers/fake-providers.js";

const database = createDatabase(inject("testDatabaseUrl"), { poolMax: 8 });
const { db } = database;
const mailer = createMemoryMailer();
let app: App;
let logs: ReturnType<typeof captureLogs>;
let mp: Awaited<ReturnType<typeof startFakeMercadoPago>>;
let sf: Awaited<ReturnType<typeof startFakeSuperFrete>>;
let gateway: ReturnType<typeof createMercadoPagoGateway>;

const MP_SECRET = "mp-webhook-secret-de-teste";
const SF_SECRET = "sf-webhook-secret-de-teste";
const PASSWORD = "riff-pesado-2026";
const CPF = "52998224725";
const CEP = "20040002";

type Cookies = Record<string, string>;
type Res = Awaited<ReturnType<App["inject"]>>;

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

async function call(j: Jar, method: "GET" | "POST" | "PATCH" | "DELETE" | "PUT", url: string, payload?: unknown, headers: Record<string, string> = {}) {
  const res = await app.inject({
    method,
    url: `/api/v1${url}`,
    headers: { origin: TEST_ORIGIN, ...headers },
    cookies: j.cookies,
    ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}),
  });
  return j.update(res);
}

const errorOf = (res: Res) => res.json<ErrorResponse>().error;
const detailCodes = (res: Res) => (errorOf(res).details ?? []).map((detail) => detail.code);

async function variantId(slug: string, size: string): Promise<string> {
  const [row] = await db.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.sku, demoSku(slug, size)));
  return row!.id;
}

async function stockOf(id: string) {
  const [row] = await db.select().from(inventoryLevels).where(eq(inventoryLevels.variantId, id));
  return { onHand: row!.onHand, reserved: row!.reserved };
}

async function setStock(id: string, onHand: number, reserved = 0) {
  await db.update(inventoryLevels).set({ onHand, reserved }).where(eq(inventoryLevels.variantId, id));
}

async function resetStock() {
  for (const product of demoProducts) {
    for (const [size, onHand] of Object.entries(product.stock)) {
      await setStock(await variantId(product.slug, size), onHand);
    }
  }
}

let counter = 0;
const emails: string[] = [];
async function customer() {
  counter += 1;
  const email = `comprador${counter}@example.com`;
  emails.push(email);
  const j = jar();
  const res = await call(j, "POST", "/auth/register", { email, password: PASSWORD, name: "Fã de Rock", acceptTerms: true });
  expect(res.statusCode, res.body).toBe(201);
  const address = await call(j, "POST", "/me/addresses", {
    recipientName: "Fã de Rock",
    recipientDocument: CPF,
    recipientPhone: "21987654321",
    postalCode: "20040-002",
    street: "Avenida Rio Branco",
    number: "100",
    district: "Centro",
    city: "Rio de Janeiro",
    state: "rj",
  });
  expect(address.statusCode, address.body).toBe(201);
  return { jar: j, email, userId: res.json<{ user: { id: string } }>().user.id, addressId: address.json<{ id: string }>().id };
}

type Customer = Awaited<ReturnType<typeof customer>>;

async function quote(c: Customer, postalCode = CEP) {
  const res = await call(c.jar, "POST", "/shipping/quotes", { postalCode });
  expect(res.statusCode, res.body).toBe(200);
  return res.json<{ id: string; options: { serviceId: string; price: { amountMinor: number } }[] }>();
}

async function checkout(c: Customer, body: Record<string, unknown>, key = `chave-${crypto.randomUUID()}`) {
  return call(c.jar, "POST", "/checkouts", body, { "idempotency-key": key });
}

async function readyToBuy(c: Customer, items: { variantId: string; quantity: number }[]) {
  for (const item of items) expect((await call(c.jar, "POST", "/cart/items", item)).statusCode).toBe(200);
  const q = await quote(c);
  return { addressId: c.addressId, quoteId: q.id, serviceId: "1" };
}

async function placed(c: Customer, items: { variantId: string; quantity: number }[]) {
  const res = await checkout(c, await readyToBuy(c, items));
  expect(res.statusCode, res.body).toBe(201);
  return res.json<{ order: OrderView; payment: { checkoutUrl: string } | null }>();
}

let notificationCounter = 0;
async function notifyPayment(paymentId: string, options: { secret?: string; body?: Record<string, unknown> } = {}) {
  notificationCounter += 1;
  const requestId = `req-${notificationCounter}-${paymentId}`;
  return app.inject({
    method: "POST",
    url: `/api/v1/webhooks/mercadopago?type=payment&data.id=${paymentId}`,
    headers: { "x-signature": mercadoPagoSignature(options.secret ?? MP_SECRET, paymentId, requestId), "x-request-id": requestId },
    payload: options.body ?? { id: notificationCounter, type: "payment", action: "payment.updated", data: { id: paymentId } },
  });
}

let paymentCounter = 1000;
function providerPayment(order: OrderView, status: string, amount = order.totals.total.amountMinor / 100) {
  paymentCounter += 1;
  const id = String(paymentCounter);
  mp.setPayment({ id, status, external_reference: order.id, transaction_amount: amount, date_approved: status === "approved" ? new Date().toISOString() : null });
  return id;
}

async function orderRow(id: string) {
  const [row] = await db.select().from(orders).where(eq(orders.id, id));
  return row!;
}

async function insertCoupon(values: Partial<typeof coupons.$inferInsert> & { code: string }) {
  const [row] = await db.insert(coupons).values({ description: "Cupom de teste", discountType: "percentage", percentOff: 10, ...values }).returning();
  return row!;
}

let nocturneM: string;
let nocturneG: string;
let ironP: string;
let blackM: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE notifications, webhook_events, shipments, payments, idempotency_keys, coupon_redemptions, stock_reservations,
    order_status_history, order_items, orders, shipping_quotes, addresses, newsletter_events, newsletter_subscriptions, favorites, cart_items,
    carts, campaigns, coupons, consents, password_reset_tokens, sessions, users RESTART IDENTITY CASCADE`);
  await db.execute(sql`TRUNCATE inventory_movements, inventory_levels, product_media, product_variants, product_collections, products, collections, categories RESTART IDENTITY CASCADE`);
  await seedDemoCatalog(db);
  mp = await startFakeMercadoPago();
  sf = await startFakeSuperFrete();
  gateway = createMercadoPagoGateway({ apiUrl: mp.url, accessToken: "TEST-token-de-teste", environment: "sandbox", statementDescriptor: "USROCK" });
  const shippingProvider = createSuperFreteProvider({ baseUrl: sf.url, token: "sf-token-de-teste", contactEmail: "dev@usrock.local", originPostalCode: "01310100", services: ["1", "2", "17"] });
  ({ app, logs } = await buildTestApp({
    database,
    mailer,
    paymentGateway: gateway,
    shippingProvider,
    env: {
      AUTH_RATE_LIMIT_MAX: "1000",
      RATE_LIMIT_MAX: "10000",
      SHIPPING_QUOTE_RATE_LIMIT_MAX: "1000",
      MERCADO_PAGO_MODE: "sandbox",
      MERCADO_PAGO_ACCESS_TOKEN: "TEST-token-de-teste",
      MERCADO_PAGO_WEBHOOK_SECRET: MP_SECRET,
      SHIPPING_PROVIDER: "superfrete",
      SUPERFRETE_API_TOKEN: "sf-token-de-teste",
      SUPERFRETE_CONTACT_EMAIL: "dev@usrock.local",
      SUPERFRETE_WEBHOOK_SECRET: SF_SECRET,
      SHIPPING_ORIGIN_POSTAL_CODE: "01310-100",
      SHIPPING_SENDER_NAME: "UsRock Loja Teste",
      SHIPPING_SENDER_STREET: "Avenida Paulista",
      SHIPPING_SENDER_NUMBER: "1000",
      SHIPPING_SENDER_DISTRICT: "Bela Vista",
      SHIPPING_SENDER_CITY: "São Paulo",
      SHIPPING_SENDER_STATE: "SP",
    },
  }));
  await app.ready();
  nocturneM = await variantId("nocturne-wings-oversized", "M");
  nocturneG = await variantId("nocturne-wings-oversized", "G");
  ironP = await variantId("iron-bloom-heavy-tee", "P");
  blackM = await variantId("black-signal-essential", "M");
});

beforeEach(async () => {
  await resetStock();
  mp.state.failPreferences = false;
  mp.state.failReads = false;
  sf.state.quoteStatus = 200;
  sf.state.quoteBody = undefined;
  sf.state.failLabels = false;
});

afterAll(async () => {
  await app.close();
  await mp.close();
  await sf.close();
  await database.close();
});

describe("addresses", () => {
  it("validates, normalises, masks and scopes addresses to their owner", async () => {
    const c = await customer();
    const list = await call(c.jar, "GET", "/me/addresses");
    expect(list.json<{ data: unknown[] }>().data).toEqual([
      expect.objectContaining({ postalCode: CEP, state: "RJ", isDefault: true, recipientDocumentMasked: "***.***.247-25", recipientPhoneMasked: "(21) *****-4321" }),
    ]);
    expect(list.body).not.toContain(CPF);

    const invalid = await call(c.jar, "POST", "/me/addresses", {
      recipientName: "Outra Pessoa", recipientDocument: "123.456.789-00", recipientPhone: "21987654321", postalCode: "123", street: "Rua", number: "1", district: "Centro", city: "Rio", state: "XX",
    });
    expect(invalid.statusCode).toBe(400);
    expect(errorOf(invalid).details?.map((detail) => detail.path).sort()).toEqual(["body.postalCode", "body.recipientDocument", "body.state"]);

    const second = await call(c.jar, "POST", "/me/addresses", {
      recipientName: "Fã de Rock", recipientDocument: "111.444.777-35", recipientPhone: "1132654321", postalCode: "01310100", street: "Av. Paulista", number: "S/N", district: "Bela Vista", city: "São Paulo", state: "SP", isDefault: true,
    });
    expect(second.json()).toMatchObject({ isDefault: true });
    const stranger = await customer();
    expect((await call(stranger.jar, "PATCH", `/me/addresses/${c.addressId}`, { number: "200" })).statusCode).toBe(404);
    expect((await call(stranger.jar, "DELETE", `/me/addresses/${c.addressId}`)).statusCode).toBe(204);
    expect((await call(c.jar, "GET", "/me/addresses")).json<{ data: unknown[] }>().data).toHaveLength(2);
  });
});

describe("shipping quotes", () => {
  it("quotes the server-side cart and stores the provider prices", async () => {
    const c = await customer();
    expect(detailCodes(await call(c.jar, "POST", "/shipping/quotes", { postalCode: CEP }))).toContain("cart_empty");
    await call(c.jar, "POST", "/cart/items", { variantId: nocturneM, quantity: 2 });
    const q = await quote(c, "20040-002");
    expect(q).toMatchObject({ provider: "superfrete", isSimulated: false, postalCode: CEP });
    expect(q.options.map((option) => [option.serviceId, option.price.amountMinor])).toEqual([["1", 2250], ["2", 4190]]);
    const sent = sf.requests.at(-1)!.body as { products: { quantity: number; weight: number }[]; options: { insurance_value: number } };
    expect(sent.products).toEqual([{ quantity: 2, weight: 0.3, height: 4, width: 20, length: 28 }]);
    expect(sent.options.insurance_value).toBe(259.8);
  });

  it("reports provider outages and rejections without breaking the cart", async () => {
    const c = await customer();
    await call(c.jar, "POST", "/cart/items", { variantId: nocturneM, quantity: 1 });
    sf.state.quoteStatus = 502;
    const down = await call(c.jar, "POST", "/shipping/quotes", { postalCode: CEP });
    expect(down.statusCode).toBe(503);
    expect(errorOf(down)).toMatchObject({ code: "SERVICE_UNAVAILABLE", details: [expect.objectContaining({ code: "shipping_unavailable" })] });
    sf.state.quoteStatus = 400;
    sf.state.quoteBody = {};
    const rejected = await call(c.jar, "POST", "/shipping/quotes", { postalCode: CEP });
    expect(rejected.statusCode).toBe(400);
    expect(detailCodes(rejected)).toEqual(["shipping_rejected"]);
    expect((await call(c.jar, "GET", "/cart")).json<CartView>().items).toHaveLength(1);
  });

  it("refuses to quote a cart with stock problems", async () => {
    const c = await customer();
    await call(c.jar, "POST", "/cart/items", { variantId: ironP, quantity: 3 });
    await setStock(ironP, 1);
    const res = await call(c.jar, "POST", "/shipping/quotes", { postalCode: CEP });
    expect(res.statusCode).toBe(409);
    expect(detailCodes(res)).toEqual(["cart_has_issues", "insufficient_stock"]);
  });
});

describe("checkout", () => {
  it("prices everything on the server, reserves stock, redeems the coupon and opens Checkout Pro", async () => {
    const coupon = await insertCoupon({ code: "ROCK10" });
    const c = await customer();
    const body = await readyToBuy(c, [{ variantId: nocturneM, quantity: 2 }]);
    expect((await call(c.jar, "PUT", "/cart/coupon", { code: "rock10" })).statusCode).toBe(200);
    const before = await stockOf(nocturneM);

    const preview = await call(c.jar, "POST", "/checkouts/preview", body);
    expect(preview.statusCode, preview.body).toBe(200);
    // 2 × 129,90 = 259,80; 10 % = 25,98; PAC 22,50 → 256,32
    expect(preview.json()).toMatchObject({
      totals: { subtotal: { amountMinor: 25980 }, discount: { amountMinor: 2598 }, shipping: { amountMinor: 2250 }, total: { amountMinor: 25632 } },
      coupon: { code: "ROCK10" },
      shipping: { serviceId: "1", name: "PAC" },
      isDemo: true,
    });
    expect(await stockOf(nocturneM)).toEqual(before);

    const key = "chave-idempotente-0001";
    const res = await checkout(c, body, key);
    expect(res.statusCode, res.body).toBe(201);
    const { order, payment } = res.json<{ order: OrderView; payment: { checkoutUrl: string; environment: string } }>();
    expect(order).toMatchObject({
      status: "pending_payment",
      totals: { total: { amountMinor: 25632 } },
      coupon: { code: "ROCK10", discount: { amountMinor: 2598 } },
      items: [expect.objectContaining({ sku: demoSku("nocturne-wings-oversized", "M"), quantity: 2, unitPrice: { amountMinor: 12990, currencyCode: "BRL" } })],
      shipping: { address: { recipientDocumentMasked: "***.***.247-25", postalCode: CEP } },
      canPay: true,
      canCancel: true,
    });
    expect(order.number).toMatch(/^UR\d{6}$/);
    expect(payment).toMatchObject({ environment: "sandbox" });
    expect(payment.checkoutUrl).toContain("sandbox.mercadopago.com.br");
    expect(res.body).not.toContain(CPF);

    const preference = mp.requests.filter((request) => request.path === "/checkout/preferences").at(-1)!;
    expect(preference.body).toMatchObject({ external_reference: order.id, items: [{ unit_price: 256.32, quantity: 1 }] });

    expect(await stockOf(nocturneM)).toEqual({ onHand: before.onHand, reserved: before.reserved + 2 });
    expect((await call(c.jar, "GET", "/cart")).json<CartView>()).toMatchObject({ items: [], coupon: null });
    const [redeemed] = await db.select().from(coupons).where(eq(coupons.id, coupon.id));
    expect(redeemed?.timesRedeemed).toBe(1);
    const queued = await db.select().from(notifications).where(eq(notifications.orderId, order.id));
    expect(queued.map((row) => row.template)).toEqual(["order_received"]);

    // Same key + same body → same response, no second order.
    const replay = await checkout(c, body, key);
    expect(replay.statusCode).toBe(201);
    expect(replay.headers["idempotent-replayed"]).toBe("true");
    expect(replay.json<{ order: OrderView }>().order.id).toBe(order.id);
    const reused = await checkout(c, { ...body, serviceId: "2" }, key);
    expect(reused.statusCode).toBe(409);
    expect(detailCodes(reused)).toEqual(["idempotency_key_reused"]);
    expect(await db.select().from(orders).where(eq(orders.userId, c.userId))).toHaveLength(1);
    expect((await checkout(c, body, "curta")).statusCode).toBe(400);
  });

  it("ignores prices sent by the client and refuses a stale expected total", async () => {
    const c = await customer();
    const body = await readyToBuy(c, [{ variantId: blackM, quantity: 1 }]);
    const tampered = await checkout(c, { ...body, total: { amountMinor: 1, currencyCode: "BRL" }, unitPrice: 1, shippingPrice: 0, expectedTotal: { amountMinor: 100, currencyCode: "BRL" } });
    expect(tampered.statusCode).toBe(409);
    expect(detailCodes(tampered)).toEqual(["total_changed"]);
    expect(await stockOf(blackM)).toEqual({ onHand: 11, reserved: 0 });

    const ok = await checkout(c, { ...body, unitPrice: 1, expectedTotal: { amountMinor: 11990 + 2250, currencyCode: "BRL" } });
    expect(ok.statusCode, ok.body).toBe(201);
    expect(ok.json<{ order: OrderView }>().order.totals.total.amountMinor).toBe(14240);
  });

  it("requires a valid, current quote for the chosen address and service", async () => {
    const c = await customer();
    const body = await readyToBuy(c, [{ variantId: nocturneG, quantity: 1 }]);
    expect(detailCodes(await checkout(c, { ...body, serviceId: "17" }))).toEqual(["shipping_option_invalid"]);

    const otherCep = await quote(c, "01310100");
    expect(detailCodes(await checkout(c, { ...body, quoteId: otherCep.id }))).toEqual(["shipping_quote_mismatch"]);

    await call(c.jar, "POST", "/cart/items", { variantId: nocturneG, quantity: 1 });
    expect(detailCodes(await checkout(c, body))).toEqual(["shipping_quote_expired"]);

    const fresh = await quote(c);
    await db.update(shippingQuotes).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(shippingQuotes.id, fresh.id));
    expect(detailCodes(await checkout(c, { ...body, quoteId: fresh.id }))).toEqual(["shipping_quote_expired"]);

    const stranger = await customer();
    await call(stranger.jar, "POST", "/cart/items", { variantId: nocturneG, quantity: 1 });
    const theirs = await quote(stranger);
    expect(detailCodes(await checkout(c, { ...body, quoteId: theirs.id }))).toEqual(["shipping_quote_expired"]);
    expect(detailCodes(await checkout(c, { ...body, addressId: stranger.addressId }))).toEqual(["address_not_found"]);
  });

  it("rejects insufficient stock and invalid coupons without creating anything", async () => {
    const c = await customer();
    const body = await readyToBuy(c, [{ variantId: ironP, quantity: 2 }]);
    await setStock(ironP, 1);
    const res = await checkout(c, body);
    expect(res.statusCode).toBe(409);
    expect(detailCodes(res)).toContain("insufficient_stock");
    await setStock(ironP, 4);

    const coupon = await insertCoupon({ code: "VENCE-LOGO" });
    await call(c.jar, "PUT", "/cart/coupon", { code: coupon.code });
    await db.update(coupons).set({ endsAt: new Date(Date.now() - 1000), startsAt: new Date(Date.now() - 60_000) }).where(eq(coupons.id, coupon.id));
    const expired = await checkout(c, body);
    expect(expired.statusCode).toBe(409);
    expect(detailCodes(expired)).toEqual(["coupon_expired"]);
    expect(await db.select().from(orders).where(eq(orders.userId, c.userId))).toHaveLength(0);
    expect(await stockOf(ironP)).toEqual({ onHand: 4, reserved: 0 });
  });

  it("enforces total and per-customer coupon limits at order time", async () => {
    const single = await insertCoupon({ code: "UNICO", usageLimit: 1 });
    const a = await customer();
    const b = await customer();
    const bodyA = await readyToBuy(a, [{ variantId: blackM, quantity: 1 }]);
    const bodyB = await readyToBuy(b, [{ variantId: blackM, quantity: 1 }]);
    await call(a.jar, "PUT", "/cart/coupon", { code: "UNICO" });
    await call(b.jar, "PUT", "/cart/coupon", { code: "UNICO" });
    expect((await checkout(a, bodyA)).statusCode).toBe(201);
    const late = await checkout(b, bodyB);
    expect(late.statusCode).toBe(409);
    expect(detailCodes(late)).toEqual(["coupon_usage_exhausted"]);
    expect((await db.select().from(coupons).where(eq(coupons.id, single.id)))[0]?.timesRedeemed).toBe(1);

    await insertCoupon({ code: "UMPORCLIENTE", perCustomerLimit: 1 });
    const c = await customer();
    const first = await readyToBuy(c, [{ variantId: blackM, quantity: 1 }]);
    await call(c.jar, "PUT", "/cart/coupon", { code: "UMPORCLIENTE" });
    expect((await checkout(c, first)).statusCode).toBe(201);
    const second = await readyToBuy(c, [{ variantId: blackM, quantity: 1 }]);
    await call(c.jar, "PUT", "/cart/coupon", { code: "UMPORCLIENTE" });
    const again = await checkout(c, second);
    expect(again.statusCode).toBe(409);
    expect(detailCodes(again)).toEqual(["coupon_usage_exhausted"]);
  });

  it("never sells the same unit twice under concurrency", async () => {
    await setStock(ironP, 2);
    const buyers = await Promise.all(Array.from({ length: 4 }, () => customer()));
    const bodies: Awaited<ReturnType<typeof readyToBuy>>[] = [];
    for (const buyer of buyers) bodies.push(await readyToBuy(buyer, [{ variantId: ironP, quantity: 1 }]));
    const results = await Promise.all(buyers.map((buyer, index) => checkout(buyer, bodies[index]!)));
    const statuses = results.map((res) => res.statusCode).sort();
    expect(statuses).toEqual([201, 201, 409, 409]);
    for (const res of results.filter((item) => item.statusCode === 409)) expect(detailCodes(res)).toContain("insufficient_stock");
    expect(await stockOf(ironP)).toEqual({ onHand: 2, reserved: 2 });
  });

  it("keeps the order when the payment provider is down and lets the customer retry", async () => {
    const c = await customer();
    mp.state.failPreferences = true;
    const res = await checkout(c, await readyToBuy(c, [{ variantId: nocturneG, quantity: 1 }]));
    expect(res.statusCode).toBe(201);
    const { order, payment } = res.json<{ order: OrderView; payment: null }>();
    expect(payment).toBeNull();
    expect(order.canPay).toBe(true);

    expect((await call(c.jar, "POST", `/orders/${order.id}/payment`, {})).statusCode).toBe(503);
    mp.state.failPreferences = false;
    const retry = await call(c.jar, "POST", `/orders/${order.id}/payment`, {});
    expect(retry.statusCode, retry.body).toBe(200);
    const again = await call(c.jar, "POST", `/orders/${order.id}/payment`, {});
    expect(again.json<{ checkoutUrl: string }>().checkoutUrl).toBe(retry.json<{ checkoutUrl: string }>().checkoutUrl);
  });
});

describe("payment confirmation", () => {
  it("confirms only from the provider API, consumes stock once and ignores duplicates", async () => {
    const c = await customer();
    const before = await stockOf(nocturneM);
    const { order } = await placed(c, [{ variantId: nocturneM, quantity: 2 }]);

    // The return page cannot confirm anything: only GET is available and the order stays pending.
    const back = await call(c.jar, "GET", `/orders/${order.id}?status=approved&collection_status=approved`);
    expect(back.json<OrderView>().status).toBe("pending_payment");
    expect((await call(c.jar, "PATCH", `/orders/${order.id}`, { status: "paid" })).statusCode).toBe(404);

    const paymentId = providerPayment(order, "approved");
    const body = { id: 777001, type: "payment", action: "payment.created", data: { id: paymentId } };
    const first = await notifyPayment(paymentId, { body });
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json()).toEqual({ status: "processed" });

    const paid = (await call(c.jar, "GET", `/orders/${order.id}`)).json<OrderView>();
    expect(paid).toMatchObject({ status: "paid", canPay: false, canCancel: false, payment: { status: "approved", environment: "sandbox" } });
    expect(await stockOf(nocturneM)).toEqual({ onHand: before.onHand - 2, reserved: before.reserved });
    const sales = await db.select().from(inventoryMovements).where(and(eq(inventoryMovements.variantId, nocturneM), eq(inventoryMovements.reason, "sale")));
    expect(sales.filter((movement) => movement.note === order.number)).toHaveLength(1);

    expect((await notifyPayment(paymentId, { body })).json()).toEqual({ status: "duplicate" });
    const differentNotification = await notifyPayment(paymentId);
    expect(differentNotification.json()).toEqual({ status: "processed" });
    expect(await stockOf(nocturneM)).toEqual({ onHand: before.onHand - 2, reserved: before.reserved });
    expect(await db.select().from(payments).where(eq(payments.orderId, order.id))).toHaveLength(1);
    const history = await db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, order.id));
    expect(history.map((entry) => [entry.toStatus, entry.actor])).toEqual([["pending_payment", "customer"], ["paid", "payment_provider"]]);
  });

  it("keeps the order pending for rejected and pending payments", async () => {
    const c = await customer();
    const { order } = await placed(c, [{ variantId: blackM, quantity: 1 }]);
    const rejected = providerPayment(order, "rejected");
    expect((await notifyPayment(rejected)).statusCode).toBe(200);
    let view = (await call(c.jar, "GET", `/orders/${order.id}`)).json<OrderView>();
    expect(view).toMatchObject({ status: "pending_payment", canPay: true, payment: { status: "rejected" } });
    expect(await stockOf(blackM)).toEqual({ onHand: 11, reserved: 1 });

    // A new checkout attempt is opened after a rejection.
    const reopened = await call(c.jar, "POST", `/orders/${order.id}/payment`, {});
    expect(reopened.statusCode).toBe(200);

    const pending = providerPayment(order, "in_process");
    await notifyPayment(pending);
    view = (await call(c.jar, "GET", `/orders/${order.id}`)).json<OrderView>();
    expect(view).toMatchObject({ status: "pending_payment", payment: { status: "in_process" } });
  });

  it("refuses forged notifications and never confirms a mismatched amount", async () => {
    const c = await customer();
    const { order } = await placed(c, [{ variantId: blackM, quantity: 1 }]);
    const paymentId = providerPayment(order, "approved");
    const forged = await notifyPayment(paymentId, { secret: "segredo-falsificado" });
    expect(forged.statusCode).toBe(401);
    expect((await orderRow(order.id)).status).toBe("pending_payment");

    const cheap = providerPayment(order, "approved", 1);
    await notifyPayment(cheap);
    const row = await orderRow(order.id);
    expect(row).toMatchObject({ status: "pending_payment", attentionReason: "payment_amount_mismatch" });

    const unrelated = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/mercadopago?type=merchant_order&data.id=42",
      headers: { "x-signature": mercadoPagoSignature(MP_SECRET, "42", "req-merchant"), "x-request-id": "req-merchant" },
      payload: { id: 42, type: "merchant_order", data: { id: "42" } },
    });
    expect(unrelated.json()).toEqual({ status: "ignored" });
  });

  it("returns 500 for provider outages so the notification is retried", async () => {
    const c = await customer();
    const { order } = await placed(c, [{ variantId: blackM, quantity: 1 }]);
    const paymentId = providerPayment(order, "approved");
    mp.state.failReads = true;
    const body = { id: 990001, type: "payment", action: "payment.created", data: { id: paymentId } };
    expect((await notifyPayment(paymentId, { body })).statusCode).toBe(500);
    const [event] = await db.select().from(webhookEvents).where(eq(webhookEvents.resourceId, paymentId));
    expect(event).toMatchObject({ status: "failed", attempts: 1 });
    mp.state.failReads = false;
    expect((await notifyPayment(paymentId, { body })).json()).toEqual({ status: "processed" });
    expect((await orderRow(order.id)).status).toBe("paid");
  });

  it("syncs with the provider on demand from the return page", async () => {
    const c = await customer();
    const { order } = await placed(c, [{ variantId: blackM, quantity: 1 }]);
    providerPayment(order, "approved");
    const synced = await call(c.jar, "POST", `/orders/${order.id}/payment/sync`, {});
    expect(synced.statusCode, synced.body).toBe(200);
    expect(synced.json<OrderView>().status).toBe("paid");
    const other = await customer();
    expect((await call(other.jar, "POST", `/orders/${order.id}/payment/sync`, {})).statusCode).toBe(404);
  });
});

describe("reservation expiry and cancellation", () => {
  async function expireNow(orderId: string) {
    await db.update(orders).set({ reservationExpiresAt: new Date(Date.now() - 1000) }).where(eq(orders.id, orderId));
    await db.update(stockReservations).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(stockReservations.orderId, orderId));
    return expirePendingOrders({ db, gateway, log: app.log });
  }

  it("releases stock and the coupon use when the reservation expires", async () => {
    const coupon = await insertCoupon({ code: "EXPIRA10" });
    const c = await customer();
    const body = await readyToBuy(c, [{ variantId: nocturneG, quantity: 3 }]);
    await call(c.jar, "PUT", "/cart/coupon", { code: "EXPIRA10" });
    const res = await checkout(c, body);
    const { order } = res.json<{ order: OrderView }>();
    expect(await stockOf(nocturneG)).toEqual({ onHand: 10, reserved: 3 });

    expect(await expireNow(order.id)).toBeGreaterThanOrEqual(1);
    expect((await orderRow(order.id)).status).toBe("expired");
    expect(await stockOf(nocturneG)).toEqual({ onHand: 10, reserved: 0 });
    expect((await db.select().from(coupons).where(eq(coupons.id, coupon.id)))[0]?.timesRedeemed).toBe(0);
    expect((await db.select().from(couponRedemptions).where(eq(couponRedemptions.orderId, order.id)))[0]?.status).toBe("released");
    expect((await call(c.jar, "POST", `/orders/${order.id}/payment`, {})).statusCode).toBe(409);
  });

  it("honours a payment approved before expiry even when the webhook never arrived", async () => {
    const c = await customer();
    const { order } = await placed(c, [{ variantId: blackM, quantity: 1 }]);
    providerPayment(order, "approved");
    await expireNow(order.id);
    expect((await orderRow(order.id)).status).toBe("paid");
    expect(await stockOf(blackM)).toEqual({ onHand: 10, reserved: 0 });
  });

  it("accepts a late approval when stock is still there, and flags it when it is not", async () => {
    const c = await customer();
    const { order } = await placed(c, [{ variantId: nocturneG, quantity: 1 }]);
    await expireNow(order.id);
    await notifyPayment(providerPayment(order, "approved"));
    expect((await orderRow(order.id)).status).toBe("paid");
    expect(await stockOf(nocturneG)).toEqual({ onHand: 9, reserved: 0 });

    const d = await customer();
    const second = await placed(d, [{ variantId: ironP, quantity: 1 }]);
    await expireNow(second.order.id);
    await setStock(ironP, 0);
    await notifyPayment(providerPayment(second.order, "approved"));
    expect(await orderRow(second.order.id)).toMatchObject({ status: "expired", attentionReason: "paid_after_expiry_without_stock" });
  });

  it("lets the customer cancel an unpaid order and nothing else", async () => {
    const c = await customer();
    const { order } = await placed(c, [{ variantId: nocturneM, quantity: 1 }]);
    const stranger = await customer();
    expect((await call(stranger.jar, "POST", `/orders/${order.id}/cancel`, {})).statusCode).toBe(404);
    expect((await call(stranger.jar, "GET", `/orders/${order.id}`)).statusCode).toBe(404);
    const cancelled = await call(c.jar, "POST", `/orders/${order.id}/cancel`, {});
    expect(cancelled.json<OrderView>()).toMatchObject({ status: "cancelled", canPay: false });
    expect(await stockOf(nocturneM)).toEqual({ onHand: 12, reserved: 0 });
    expect(detailCodes(await call(c.jar, "POST", `/orders/${order.id}/cancel`, {}))).toEqual(["order_not_cancellable"]);

    await notifyPayment(providerPayment(order, "approved"));
    expect(await orderRow(order.id)).toMatchObject({ status: "cancelled", attentionReason: "paid_after_cancellation" });
  });

  it("lists the customer's own orders, newest first, with cursor pagination", async () => {
    const c = await customer();
    const first = await placed(c, [{ variantId: blackM, quantity: 1 }]);
    const second = await placed(c, [{ variantId: blackM, quantity: 2 }]);
    const page = await call(c.jar, "GET", "/orders?limit=1");
    const data = page.json<{ data: { id: string; itemCount: number }[]; pageInfo: { nextCursor: string } }>();
    expect(data.data).toEqual([expect.objectContaining({ id: second.order.id, itemCount: 2 })]);
    const next = await call(c.jar, "GET", `/orders?limit=1&cursor=${data.pageInfo.nextCursor}`);
    expect(next.json<{ data: { id: string }[] }>().data.map((order) => order.id)).toEqual([first.order.id]);
  });
});

describe("transactional e-mail", () => {
  it("sends queued e-mails once, retries failures with backoff and never logs the recipient", async () => {
    const c = await customer();
    const { order } = await placed(c, [{ variantId: blackM, quantity: 1 }]);
    await notifyPayment(providerPayment(order, "approved"));

    const failing: Mailer = { send: () => Promise.reject(new Error("smtp down")) };
    const failed = await dispatchNotifications({ db, mailer: failing, whatsapp: disabledWhatsAppSender, log: app.log, appPublicUrl: "http://localhost:3000" }, 100);
    expect(failed.failed).toBeGreaterThanOrEqual(2);
    const [retrying] = await db.select().from(notifications).where(and(eq(notifications.orderId, order.id), eq(notifications.template, "order_received")));
    expect(retrying).toMatchObject({ status: "pending", attempts: 1, lastError: "Error" });
    expect(retrying!.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

    await db.update(notifications).set({ nextAttemptAt: new Date(Date.now() - 1000) }).where(eq(notifications.status, "pending"));
    mailer.messages.length = 0;
    await dispatchNotifications({ db, mailer, whatsapp: disabledWhatsAppSender, log: app.log, appPublicUrl: "http://localhost:3000" }, 100);
    const mine = mailer.messages.filter((message) => message.to === c.email);
    expect(mine.map((message) => message.subject)).toEqual(
      expect.arrayContaining([`Pedido ${order.number} recebido — aguardando pagamento`, `Pagamento aprovado — pedido ${order.number}`]),
    );
    expect(mine[0]!.text).toContain("DEMONSTRAÇÃO");
    expect(mine[0]!.text).toContain(`/conta/pedidos/${order.id}`);
    expect(mine[0]!.text).not.toContain(CPF);

    mailer.messages.length = 0;
    await dispatchNotifications({ db, mailer, whatsapp: disabledWhatsAppSender, log: app.log, appPublicUrl: "http://localhost:3000" }, 100);
    expect(mailer.messages.filter((message) => message.to === c.email)).toHaveLength(0);
  });
});

describe("operations (admin)", () => {
  async function operator() {
    const op = await customer();
    await db.update(users).set({ roles: ["operator"] }).where(eq(users.id, op.userId));
    return op;
  }

  it("requires orders:manage", async () => {
    const c = await customer();
    expect((await call(c.jar, "GET", "/admin/orders")).statusCode).toBe(403);
    expect((await call(jar(), "GET", "/admin/orders")).statusCode).toBe(401);
  });

  it("moves a paid order through fulfilment, label creation and carrier notifications", async () => {
    const c = await customer();
    const op = await operator();
    const { order } = await placed(c, [{ variantId: nocturneM, quantity: 1 }]);

    expect(detailCodes(await call(op.jar, "POST", `/admin/orders/${order.id}/shipments`, {}))).toEqual(["order_not_shippable"]);
    await notifyPayment(providerPayment(order, "approved"));

    const list = await call(op.jar, "GET", "/admin/orders?status=paid");
    expect(list.json<{ data: { id: string }[] }>().data.map((row) => row.id)).toContain(order.id);

    const moved = await call(op.jar, "POST", `/admin/orders/${order.id}/transitions`, { to: "in_fulfillment", note: "separando" });
    expect(moved.json<AdminOrderView>()).toMatchObject({ status: "in_fulfillment", allowedTransitions: ["shipped", "cancelled", "refunded"] });
    expect(detailCodes(await call(op.jar, "POST", `/admin/orders/${order.id}/transitions`, { to: "delivered" }))).toEqual(["invalid_transition"]);

    const labelled = await call(op.jar, "POST", `/admin/orders/${order.id}/shipments`, {});
    expect(labelled.statusCode, labelled.body).toBe(200);
    const shipment = labelled.json<AdminOrderView>().shipments[0]!;
    expect(shipment).toMatchObject({ provider: "superfrete", status: "pending", providerOrderId: "SF1" });
    const cartRequest = sf.requests.find((request) => request.path === "/api/v0/cart")!;
    expect(cartRequest.body).toMatchObject({ service: 1, to: { document: CPF, postal_code: CEP, state_abbr: "RJ" }, from: { postal_code: "01310100" } });
    expect(detailCodes(await call(op.jar, "POST", `/admin/orders/${order.id}/shipments`, {}))).toEqual(["shipment_exists"]);

    // Carrier notification: signature checked, state re-read from the API.
    sf.setLabel("SF1", { status: "posted", tracking: "BR123456789BR" });
    const raw = JSON.stringify({ event: "order.posted", data: { id: "SF1", status: "posted" } });
    const forged = await app.inject({ method: "POST", url: "/api/v1/webhooks/superfrete", headers: { "content-type": "application/json", "x-me-signature": "00" }, payload: raw });
    expect(forged.statusCode).toBe(401);
    const posted = await app.inject({ method: "POST", url: "/api/v1/webhooks/superfrete", headers: { "content-type": "application/json", "x-me-signature": superFreteSignature(SF_SECRET, raw) }, payload: raw });
    expect(posted.json()).toEqual({ status: "processed" });
    const shipped = (await call(c.jar, "GET", `/orders/${order.id}`)).json<OrderView>();
    expect(shipped).toMatchObject({ status: "shipped", shipping: { tracking: { status: "posted", code: "BR123456789BR" } } });

    sf.setLabel("SF1", { status: "delivered", tracking: "BR123456789BR" });
    const synced = await call(op.jar, "POST", `/admin/orders/${order.id}/shipments/${shipment.id}/sync`, {});
    expect(synced.json<AdminOrderView>()).toMatchObject({ status: "delivered" });
    const detail = (await call(op.jar, "GET", `/admin/orders/${order.id}`)).json<AdminOrderView>();
    expect(detail.fullHistory.map((entry) => [entry.to, entry.actor])).toEqual([
      ["pending_payment", "customer"],
      ["paid", "payment_provider"],
      ["in_fulfillment", "admin"],
      ["shipped", "shipping_provider"],
      ["delivered", "admin"],
    ]);
    const statusMails = await db.select().from(notifications).where(and(eq(notifications.orderId, order.id), eq(notifications.template, "order_status_changed")));
    expect(statusMails.map((row) => row.data.status).sort()).toEqual(["delivered", "in_fulfillment", "shipped"]);
    expect(statusMails.find((row) => row.data.status === "shipped")?.data.detail).toContain("BR123456789BR");
  });

  it("cancelling a paid order restocks it and flags the manual refund", async () => {
    const c = await customer();
    const op = await operator();
    const { order } = await placed(c, [{ variantId: blackM, quantity: 2 }]);
    await notifyPayment(providerPayment(order, "approved"));
    expect(await stockOf(blackM)).toEqual({ onHand: 9, reserved: 0 });
    const res = await call(op.jar, "POST", `/admin/orders/${order.id}/transitions`, { to: "cancelled", note: "cliente desistiu" });
    expect(res.json<AdminOrderView>()).toMatchObject({ status: "cancelled", attentionReason: "refund_required" });
    expect(await stockOf(blackM)).toEqual({ onHand: 11, reserved: 0 });
  });
});

describe("privacy", () => {
  it("keeps e-mails, CPF and CEP out of the logs", async () => {
    const raw = logs.raw();
    expect(raw.length).toBeGreaterThan(0);
    for (const email of emails) expect(raw).not.toContain(email);
    expect(raw).not.toContain(CPF);
    expect(raw).not.toContain(CEP);
    expect(raw).not.toContain(MP_SECRET);
    // Sanity: the run really produced the logs we expect to be clean.
    const placedLines = logs.lines.filter((line) => line.msg === "order placed");
    expect(placedLines.length).toBeGreaterThan(5);
    const ids = placedLines.map((line) => String(line.orderId));
    expect((await db.select({ id: orders.id }).from(orders).where(inArray(orders.id, ids)).orderBy(desc(orders.createdAt))).length).toBe(ids.length);
  });
});
