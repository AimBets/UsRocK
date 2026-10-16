// Contacts the REAL sandbox APIs with fictitious data to confirm credentials and request shapes.
// Mercado Pago: creates one Checkout Pro preference (no payment, no charge).
// SuperFrete: one freight quote. Labels are never created here.
// Refuses to run against production. Usage: npm run sandbox:smoke
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { loadEnv } from "../src/config/env.js";
import { createMercadoPagoGateway } from "../src/modules/payments/mercadopago.client.js";
import { createSuperFreteProvider, SUPERFRETE_BASE_URLS } from "../src/modules/shipping/superfrete.client.js";

if (existsSync(".env")) process.loadEnvFile(".env");
const env = loadEnv();
let ran = 0;

if (env.MERCADO_PAGO_MODE === "sandbox") {
  ran += 1;
  const gateway = createMercadoPagoGateway({
    apiUrl: env.MERCADO_PAGO_API_URL,
    accessToken: env.MERCADO_PAGO_ACCESS_TOKEN!,
    environment: "sandbox",
    statementDescriptor: env.MERCADO_PAGO_STATEMENT_DESCRIPTOR,
  });
  const orderId = randomUUID();
  const session = await gateway.createCheckout({
    orderId,
    orderNumber: "SMOKE-TEST",
    totalMinor: 100,
    payer: { email: "comprador-teste@example.com", name: "Comprador Teste" },
    expiresAt: new Date(Date.now() + 30 * 60_000),
    returnUrl: `${env.APP_PUBLIC_URL}/checkout/retorno?pedido=${orderId}`,
    idempotencyKey: `smoke-${orderId}`,
  });
  console.log(`Mercado Pago sandbox OK: preferência ${session.preferenceId}`);
  console.log(`  Checkout de teste (use um comprador de teste e cartão APRO/OTHE/CONT): ${session.checkoutUrl}`);
  const found = await gateway.findPaymentsByOrder(orderId);
  console.log(`  Busca por external_reference respondeu (${found.length} pagamento[s]).`);
} else if (env.MERCADO_PAGO_MODE === "production") {
  console.error("Recusado: MERCADO_PAGO_MODE=production. Este script só roda em sandbox.");
  process.exit(1);
} else {
  console.log("Mercado Pago: ignorado (MERCADO_PAGO_MODE=disabled; defina credenciais de TESTE e MERCADO_PAGO_MODE=sandbox).");
}

if (env.SHIPPING_PROVIDER === "superfrete") {
  if (env.SUPERFRETE_ENV !== "sandbox") {
    console.error("Recusado: SUPERFRETE_ENV=production. Este script só roda em sandbox.");
    process.exit(1);
  }
  ran += 1;
  const provider = createSuperFreteProvider({
    baseUrl: env.SUPERFRETE_API_URL ?? SUPERFRETE_BASE_URLS.sandbox,
    token: env.SUPERFRETE_API_TOKEN!,
    contactEmail: env.SUPERFRETE_CONTACT_EMAIL!,
    originPostalCode: env.SHIPPING_ORIGIN_POSTAL_CODE!,
    services: env.SUPERFRETE_SERVICES,
  });
  const options = await provider.quote({
    destinationPostalCode: "20040002",
    items: [{ quantity: 1, weightGrams: env.SHIPPING_DEFAULT_WEIGHT_GRAMS, heightCm: env.SHIPPING_DEFAULT_HEIGHT_CM, widthCm: env.SHIPPING_DEFAULT_WIDTH_CM, lengthCm: env.SHIPPING_DEFAULT_LENGTH_CM }],
    declaredValueMinor: 12990,
  });
  console.log(`SuperFrete sandbox OK: ${options.length} modalidade(s).`);
  for (const option of options) console.log(`  ${option.serviceId} ${option.name}: ${option.priceMinor} centavos, ${option.deliveryDaysMin}-${option.deliveryDaysMax} dias`);
} else {
  console.log("SuperFrete: ignorado (SHIPPING_PROVIDER não é superfrete; defina token de SANDBOX).");
}

if (ran === 0) console.log("Nenhuma integração sandbox configurada: nada foi contatado.");
