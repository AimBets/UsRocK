import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEnv } from "../src/config/env.js";
import { allowedTransitions, canTransition, paymentOutcome } from "../src/modules/orders/order-status.js";
import { createMercadoPagoGateway, PaymentGatewayError, verifyMercadoPagoSignature } from "../src/modules/payments/mercadopago.client.js";
import { consolidatePackage, ShippingProviderError } from "../src/modules/shipping/shipping.provider.js";
import { cartFingerprint } from "../src/modules/shipping/shipping.service.js";
import { createSuperFreteProvider, verifySuperFreteSignature } from "../src/modules/shipping/superfrete.client.js";
import { cpfSchema, isValidCpf, maskCpf, maskPhone, postalCodeSchema } from "../src/shared/br.js";
import { buildTestApp, TEST_ORIGIN } from "./helpers/app.js";
import { mercadoPagoSignature, startFakeMercadoPago, startFakeSuperFrete, superFreteSignature } from "./helpers/fake-providers.js";

const SECRET = "segredo-de-teste-webhook";

describe("Brazilian documents", () => {
  it("validates CPF check digits and rejects repeated digits", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
    expect(isValidCpf("52998224724")).toBe(false);
    expect(isValidCpf("11111111111")).toBe(false);
    expect(isValidCpf("123")).toBe(false);
    expect(cpfSchema.parse(" 529.982.247-25 ")).toBe("52998224725");
  });

  it("normalises CEP and masks personal data", () => {
    expect(postalCodeSchema.parse("01310-100")).toBe("01310100");
    expect(postalCodeSchema.safeParse("0131010").success).toBe(false);
    expect(maskCpf("52998224725")).toBe("***.***.247-25");
    expect(maskPhone("11987654321")).toBe("(11) *****-4321");
  });
});

describe("order state machine", () => {
  it("allows only the documented moves", () => {
    expect(canTransition("pending_payment", "paid")).toBe(true);
    expect(canTransition("pending_payment", "shipped")).toBe(false);
    expect(canTransition("expired", "paid")).toBe(true);
    expect(canTransition("cancelled", "paid")).toBe(false);
    expect(canTransition("delivered", "shipped")).toBe(false);
    expect(allowedTransitions("refunded")).toEqual([]);
  });

  it("groups provider statuses by effect", () => {
    expect(paymentOutcome("approved")).toBe("approved");
    expect(paymentOutcome("in_process")).toBe("pending");
    expect(paymentOutcome("rejected")).toBe("failed");
    expect(paymentOutcome("charged_back")).toBe("reversed");
    expect(paymentOutcome("something_new")).toBe("unknown");
  });
});

describe("Mercado Pago signature", () => {
  it("accepts the platform manifest and rejects any tampering", () => {
    const signature = mercadoPagoSignature(SECRET, "123456", "req-abc");
    expect(verifyMercadoPagoSignature({ signature, requestId: "req-abc", dataId: "123456", secret: SECRET })).toBe(true);
    // Header parts may come in any order and with spaces.
    const [ts, v1] = signature.split(",");
    expect(verifyMercadoPagoSignature({ signature: ` ${v1!} , ${ts!} `, requestId: "req-abc", dataId: "123456", secret: SECRET })).toBe(true);

    expect(verifyMercadoPagoSignature({ signature, requestId: "req-abc", dataId: "999999", secret: SECRET })).toBe(false);
    expect(verifyMercadoPagoSignature({ signature, requestId: "other", dataId: "123456", secret: SECRET })).toBe(false);
    expect(verifyMercadoPagoSignature({ signature, requestId: "req-abc", dataId: "123456", secret: "outro-segredo-qualquer" })).toBe(false);
    expect(verifyMercadoPagoSignature({ signature: undefined, requestId: "req-abc", dataId: "123456", secret: SECRET })).toBe(false);
    expect(verifyMercadoPagoSignature({ signature: "ts=abc,v1=00", requestId: "req-abc", dataId: "123456", secret: SECRET })).toBe(false);
  });
});

describe("SuperFrete signature", () => {
  it("accepts hex or base64 HMAC of the raw body only", () => {
    const raw = JSON.stringify({ event: "order.posted", data: { id: "SF1" } });
    const hex = superFreteSignature(SECRET, raw);
    const base64 = Buffer.from(hex, "hex").toString("base64");
    expect(verifySuperFreteSignature(raw, hex, SECRET)).toBe(true);
    expect(verifySuperFreteSignature(raw, base64, SECRET)).toBe(true);
    expect(verifySuperFreteSignature(`${raw} `, hex, SECRET)).toBe(false);
    expect(verifySuperFreteSignature(raw, undefined, SECRET)).toBe(false);
  });
});

describe("package and quote identity", () => {
  it("stacks items into one volume and fingerprints the cart regardless of order", () => {
    const items = [
      { quantity: 2, weightGrams: 300, heightCm: 4, widthCm: 20, lengthCm: 28 },
      { quantity: 1, weightGrams: 500, heightCm: 6, widthCm: 25, lengthCm: 30 },
    ];
    expect(consolidatePackage(items)).toEqual({ weightGrams: 1100, heightCm: 14, widthCm: 25, lengthCm: 30 });
    const a = cartFingerprint([{ variantId: "a", quantity: 1 }, { variantId: "b", quantity: 2 }]);
    expect(cartFingerprint([{ variantId: "b", quantity: 2 }, { variantId: "a", quantity: 1 }])).toBe(a);
    expect(cartFingerprint([{ variantId: "a", quantity: 2 }, { variantId: "b", quantity: 2 }])).not.toBe(a);
  });
});

describe("SuperFrete client (HTTP against a local fake)", () => {
  let fake: Awaited<ReturnType<typeof startFakeSuperFrete>>;
  beforeAll(async () => {
    fake = await startFakeSuperFrete();
  });
  afterAll(() => fake.close());

  const provider = () =>
    createSuperFreteProvider({ baseUrl: fake.url, token: "token-de-teste-123", contactEmail: "dev@usrock.local", originPostalCode: "01310100", services: ["1", "2", "17"] });

  it("sends the documented request and maps prices to centavos, skipping services with errors", async () => {
    const options = await provider().quote({
      destinationPostalCode: "20040002",
      items: [{ quantity: 2, weightGrams: 300, heightCm: 4, widthCm: 20, lengthCm: 28 }],
      declaredValueMinor: 25980,
    });
    expect(options).toEqual([
      { serviceId: "1", name: "PAC", carrier: "Correios", priceMinor: 2250, deliveryDaysMin: 5, deliveryDaysMax: 7 },
      { serviceId: "2", name: "SEDEX", carrier: "Correios", priceMinor: 4190, deliveryDaysMin: 1, deliveryDaysMax: 2 },
    ]);
    const sent = fake.requests.at(-1)!;
    expect(sent.headers.authorization).toBe("Bearer token-de-teste-123");
    expect(sent.headers["user-agent"]).toBe("UsRock/0.1 (dev@usrock.local)");
    expect(sent.body).toEqual({
      from: { postal_code: "01310100" },
      to: { postal_code: "20040002" },
      services: "1,2,17",
      options: { own_hand: false, receipt: false, insurance_value: 259.8, use_insurance_value: false },
      products: [{ quantity: 2, weight: 0.3, height: 4, width: 20, length: 28 }],
    });
  });

  it("classifies provider failures", async () => {
    const request = { destinationPostalCode: "20040002", items: [], declaredValueMinor: 0 };
    fake.state.quoteStatus = 500;
    await expect(provider().quote(request)).rejects.toMatchObject({ kind: "unavailable" });
    fake.state.quoteStatus = 400;
    fake.state.quoteBody = {};
    await expect(provider().quote(request)).rejects.toMatchObject({ kind: "rejected" });
    fake.state.quoteStatus = 200;
    fake.state.quoteBody = { unexpected: true };
    await expect(provider().quote(request)).rejects.toBeInstanceOf(ShippingProviderError);
    fake.state.quoteBody = undefined;

    const unreachable = createSuperFreteProvider({ baseUrl: "http://127.0.0.1:1", token: "token-de-teste-123", contactEmail: "dev@usrock.local", originPostalCode: "01310100", services: ["1"] });
    await expect(unreachable.quote(request)).rejects.toMatchObject({ kind: "unavailable" });
  });
});

describe("Mercado Pago client (HTTP against a local fake)", () => {
  let fake: Awaited<ReturnType<typeof startFakeMercadoPago>>;
  beforeAll(async () => {
    fake = await startFakeMercadoPago();
  });
  afterAll(() => fake.close());

  const gateway = () =>
    createMercadoPagoGateway({ apiUrl: fake.url, accessToken: "TEST-token-de-teste", environment: "sandbox", statementDescriptor: "USROCK" });

  it("creates a single-line preference for the exact total with idempotency key and sandbox URL", async () => {
    const request = {
      orderId: "8a0c1f9e-7d42-4b8a-9f3e-2b1c0d9e8f7a",
      orderNumber: "UR001001",
      totalMinor: 38172,
      payer: { email: "cliente@example.com", name: "Fã de Rock" },
      expiresAt: new Date("2026-10-15T20:00:00.000Z"),
      returnUrl: "http://localhost:3000/checkout/retorno?pedido=8a0c",
      idempotencyKey: "usrock-8a0c-1",
    };
    const session = await gateway().createCheckout(request);
    const again = await gateway().createCheckout(request);
    expect(again.preferenceId).toBe(session.preferenceId);
    expect(session.checkoutUrl).toContain("sandbox.mercadopago.com.br");

    const sent = fake.requests.find((item) => item.path === "/checkout/preferences")!;
    expect(sent.headers.authorization).toBe("Bearer TEST-token-de-teste");
    expect(sent.headers["x-idempotency-key"]).toBe("usrock-8a0c-1");
    expect(sent.body).toMatchObject({
      items: [{ id: "UR001001", quantity: 1, unit_price: 381.72, currency_id: "BRL" }],
      external_reference: request.orderId,
      expires: true,
      expiration_date_to: "2026-10-15T20:00:00.000Z",
      back_urls: { success: request.returnUrl },
    });
    // http return URLs cannot auto-return.
    expect((sent.body as Record<string, unknown>).auto_return).toBeUndefined();
  });

  it("maps payments to integer centavos and reports missing payments", async () => {
    fake.setPayment({ id: "555", status: "approved", external_reference: "ref", transaction_amount: 381.72, date_approved: "2026-10-15T19:00:00.000Z" });
    await expect(gateway().getPayment("555")).resolves.toMatchObject({ id: "555", status: "approved", amountMinor: 38172, currencyCode: "BRL", externalReference: "ref" });
    await expect(gateway().getPayment("404")).rejects.toMatchObject({ kind: "not_found" });
    fake.state.failReads = true;
    await expect(gateway().getPayment("555")).rejects.toBeInstanceOf(PaymentGatewayError);
    fake.state.failReads = false;
  });
});

describe("E5 configuration", () => {
  const base = { DATABASE_URL: "postgres://u:p@127.0.0.1:5432/db" };

  it("defaults to providers disabled and never allows real charges outside production", () => {
    const env = loadEnv({ ...base, NODE_ENV: "development" });
    expect(env.MERCADO_PAGO_MODE).toBe("disabled");
    expect(env.SHIPPING_PROVIDER).toBe("disabled");
    expect(env.JOBS_ENABLED).toBe(true);
    expect(() => loadEnv({ ...base, NODE_ENV: "development", MERCADO_PAGO_MODE: "production", MERCADO_PAGO_ACCESS_TOKEN: "APP_USR-xxxxxxxx", MERCADO_PAGO_WEBHOOK_SECRET: "segredo-xxxxx" })).toThrow(/MERCADO_PAGO_MODE/);
    expect(() => loadEnv({ ...base, NODE_ENV: "development", SUPERFRETE_ENV: "production" })).toThrow(/SUPERFRETE_ENV/);
  });

  it("requires credentials for enabled providers and refuses the fixture in production", () => {
    expect(() => loadEnv({ ...base, MERCADO_PAGO_MODE: "sandbox" })).toThrow(/MERCADO_PAGO_ACCESS_TOKEN[\s\S]*MERCADO_PAGO_WEBHOOK_SECRET/);
    expect(() => loadEnv({ ...base, SHIPPING_PROVIDER: "superfrete" })).toThrow(/SUPERFRETE_API_TOKEN/);
    expect(() =>
      loadEnv({ ...base, NODE_ENV: "production", APP_PUBLIC_URL: "https://usrock.com.br", CORS_ORIGINS: "https://usrock.com.br", SHIPPING_PROVIDER: "fixture" }),
    ).toThrow(/SHIPPING_PROVIDER/);
    expect(loadEnv({ ...base, NODE_ENV: "test" }).JOBS_ENABLED).toBe(false);
  });
});

describe("checkout routes without a database", () => {
  it("require a session for checkout, orders and addresses", async () => {
    const { app } = await buildTestApp();
    try {
      for (const [method, url] of [
        ["POST", "/api/v1/checkouts"],
        ["POST", "/api/v1/checkouts/preview"],
        ["GET", "/api/v1/orders"],
        ["GET", "/api/v1/me/addresses"],
      ] as const) {
        const res = await app.inject({ method, url, headers: { origin: TEST_ORIGIN }, ...(method === "POST" ? { payload: {} } : {}) });
        expect(res.statusCode, url).toBe(401);
      }
    } finally {
      await app.close();
    }
  });

  it("refuses webhooks when the integration is not configured or the signature is wrong", async () => {
    const disabled = await buildTestApp();
    const res = await disabled.app.inject({ method: "POST", url: "/api/v1/webhooks/mercadopago?type=payment&data.id=1", payload: { type: "payment", data: { id: "1" } } });
    expect(res.statusCode).toBe(503);
    await disabled.app.close();

    const gateway = createMercadoPagoGateway({ apiUrl: "http://127.0.0.1:1", accessToken: "TEST-token", environment: "sandbox", statementDescriptor: "USROCK" });
    const { app, logs } = await buildTestApp({
      paymentGateway: gateway,
      env: { MERCADO_PAGO_MODE: "sandbox", MERCADO_PAGO_ACCESS_TOKEN: "TEST-token-xxxx", MERCADO_PAGO_WEBHOOK_SECRET: SECRET },
    });
    const forged = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/mercadopago?type=payment&data.id=123",
      headers: { "x-signature": mercadoPagoSignature("segredo-errado-xxx", "123", "req-1"), "x-request-id": "req-1" },
      payload: { type: "payment", data: { id: "123" } },
    });
    expect(forged.statusCode).toBe(401);
    expect(logs.raw()).not.toContain(SECRET);
    await app.close();
  });
});
