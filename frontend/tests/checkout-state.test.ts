import assert from "node:assert/strict";
import test from "node:test";
import { checkoutError, digits, newIdempotencyKey, paymentHeadline } from "../src/lib/checkout-state.ts";
import type { Order } from "../src/types/checkout.ts";

const baseOrder = {
  id: "order-1", number: "UR001001", status: "pending_payment", statusLabel: "Aguardando pagamento", isDemo: true,
  items: [], coupon: null,
  shipping: { provider: "fixture", serviceId: "pac", name: "Entrega padrão", carrier: "Fixture", price: { amountMinor: 1990, currencyCode: "BRL" }, deliveryDays: { min: 4, max: 7 }, address: { recipientName: "Cliente", recipientDocumentMasked: "***.***.789-09", recipientPhoneMasked: "(**) *****-1234", postalCode: "01310100", street: "Avenida Paulista", number: "1000", complement: null, district: "Bela Vista", city: "São Paulo", state: "SP" }, tracking: null },
  totals: { subtotal: { amountMinor: 25980, currencyCode: "BRL" }, discount: { amountMinor: 0, currencyCode: "BRL" }, shipping: { amountMinor: 1990, currencyCode: "BRL" }, total: { amountMinor: 27970, currencyCode: "BRL" } },
  payment: null, reservationExpiresAt: "2026-10-15T20:20:00.000Z", canPay: true, canCancel: true, history: [], createdAt: "2026-10-15T20:00:00.000Z", paidAt: null, cancelledAt: null,
} satisfies Order;

test("normaliza campos brasileiros sem inventar consulta de CEP", () => {
  assert.equal(digits("01310-100", 8), "01310100");
  assert.equal(digits("(11) 99999-1234", 13), "11999991234");
});

test("gera uma nova chave UUID para cada tentativa de compra", () => {
  const first = newIdempotencyKey();
  const second = newIdempotencyKey();
  assert.match(first, /^[0-9a-f-]{36}$/);
  assert.notEqual(first, second);
});

test("prioriza códigos estáveis do backend nas mensagens críticas", () => {
  const error = Object.assign(new Error("Conflito"), { status: 409, code: "CONFLICT", details: [{ path: "body.expectedTotal", message: "mudou", code: "total_changed" }] });
  assert.match(checkoutError(error), /atualizado pelo servidor/i);
  const processing = Object.assign(new Error("Conflito"), { status: 409, code: "CONFLICT", details: [{ code: "idempotency_in_progress" }] });
  assert.match(checkoutError(processing), /sendo processada/i);
});

test("não apresenta retorno do navegador como aprovação", () => {
  assert.equal(paymentHeadline(baseOrder), "Aguardando pagamento");
  assert.equal(paymentHeadline({ ...baseOrder, status: "paid", statusLabel: "Pagamento aprovado" }), "Pagamento confirmado");
  assert.equal(paymentHeadline({ ...baseOrder, payment: { provider: "mercado_pago", environment: "sandbox", status: "rejected", statusDetail: null, updatedAt: baseOrder.createdAt } }), "Pagamento recusado");
});

