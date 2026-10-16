const origin = process.env.USROCK_STOREFRONT_ORIGIN ?? "http://localhost:3000";
const email = `codex-e5-${Date.now()}@example.test`;
const cookies = new Map();

function updateCookies(response) {
  const values = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  for (const value of values) {
    const [pair] = value.split(";");
    const separator = pair.indexOf("=");
    const name = pair.slice(0, separator);
    const content = pair.slice(separator + 1);
    if (content) cookies.set(name, content); else cookies.delete(name);
  }
}

async function api(path, { method = "GET", body, expected = 200, headers = {} } = {}) {
  const response = await fetch(`${origin}/api/v1${path}`, {
    method,
    headers: {
      Accept: "application/json", Origin: origin, ...headers,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(cookies.size ? { Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; ") } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  updateCookies(response);
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (response.status !== expected) throw new Error(`${method} ${path}: esperado ${expected}, recebido ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

const products = await api("/products?limit=6");
const product = products.data.find((item) => item.collections?.some((collection) => collection.slug === "ritual-collection")) ?? products.data[0];
const variant = product?.variants.find((item) => item.availability !== "out_of_stock");
if (!variant) throw new Error("Uma variante disponível é necessária para o check E5.");

await api("/cart/items", { method: "POST", body: { variantId: variant.id, quantity: 1 } });
await api("/auth/register", { method: "POST", expected: 201, body: { email, password: "UsRock-E5-teste-seguro", name: "Teste E5 Codex", acceptTerms: true, marketingEmailOptIn: false } });
const cart = await api("/cart");
if (cart.owner !== "customer" || cart.items.length !== 1) throw new Error("Sacola não foi vinculada à conta E5.");

const invalidCoupon = await api("/cart/coupon", { method: "PUT", body: { code: "NAO-EXISTE" }, expected: 400 });
if (invalidCoupon?.error?.details?.[0]?.code !== "coupon_invalid") throw new Error("Cupom inválido não retornou o código estável esperado.");

const address = await api("/me/addresses", { method: "POST", expected: 201, body: { label: "QA", recipientName: "Teste E5 Codex", recipientDocument: "52998224725", recipientPhone: "11999991234", postalCode: "13010000", street: "Rua de Teste", number: "100", complement: null, district: "Centro", city: "Campinas", state: "SP", isDefault: true } });
if (!address.recipientDocumentMasked.includes("***")) throw new Error("CPF não foi mascarado pelo servidor.");
const updatedAddress = await api(`/me/addresses/${address.id}`, { method: "PATCH", body: { label: "QA editado", complement: "Sala 2" } });
if (updatedAddress.label !== "QA editado" || updatedAddress.complement !== "Sala 2" || !updatedAddress.recipientPhoneMasked.includes("***")) throw new Error("Edição do endereço ou máscaras da resposta falharam.");

const unavailable = await api("/shipping/quotes", { method: "POST", body: { postalCode: "99999999" }, expected: 503 });
if (unavailable?.error?.details?.[0]?.code !== "shipping_unavailable") throw new Error("Falha simulada de frete não foi tratada.");
const quote = await api("/shipping/quotes", { method: "POST", body: { postalCode: address.postalCode } });
if (!quote.isSimulated || quote.options.length < 2) throw new Error("Cotação fixture não foi identificada como simulada.");

const selection = { addressId: address.id, quoteId: quote.id, serviceId: quote.options[0].serviceId };
const preview = await api("/checkouts/preview", { method: "POST", body: selection });
if (preview.totals.total.amountMinor !== preview.totals.subtotal.amountMinor - preview.totals.discount.amountMinor + preview.totals.shipping.amountMinor) throw new Error("Total da prévia está inconsistente.");

const idempotencyKey = crypto.randomUUID();
const checkoutBody = { ...selection, expectedTotal: preview.totals.total };
const result = await api("/checkouts", { method: "POST", expected: 201, headers: { "Idempotency-Key": idempotencyKey }, body: checkoutBody });
if (result.payment !== null || result.order.status !== "pending_payment") throw new Error("Pagamento desativado deveria criar pedido pendente sem sessão de pagamento.");
const replay = await api("/checkouts", { method: "POST", expected: 201, headers: { "Idempotency-Key": idempotencyKey }, body: checkoutBody });
if (replay.order.id !== result.order.id) throw new Error("Requisição idempotente criou ou retornou outro pedido.");

const reused = await api("/checkouts", { method: "POST", expected: 409, headers: { "Idempotency-Key": idempotencyKey }, body: { ...checkoutBody, serviceId: "2" } });
if (reused?.error?.details?.[0]?.code !== "idempotency_key_reused") throw new Error("Reuso divergente da chave não foi recusado.");
await api(`/orders/${result.order.id}/payment`, { method: "POST", body: {}, expected: 503 });
await api(`/orders/${result.order.id}/payment/sync`, { method: "POST", body: {}, expected: 503 });
const listed = await api("/orders?limit=12");
if (!listed.data.some((order) => order.id === result.order.id)) throw new Error("Pedido criado não apareceu em Meus Pedidos.");
const cancelled = await api(`/orders/${result.order.id}/cancel`, { method: "POST", body: {} });
if (cancelled.status !== "cancelled" || cancelled.canPay || cancelled.canCancel) throw new Error("Cancelamento não atualizou as capacidades do pedido.");
await api(`/me/addresses/${address.id}`, { method: "DELETE", expected: 204 });
const remainingAddresses = await api("/me/addresses");
if (remainingAddresses.data.some((item) => item.id === address.id)) throw new Error("Endereço removido continuou na listagem.");

console.log(`Checkout E5 ao vivo validado: CRUD de endereço com máscaras, cupom inválido, frete indisponível/fixture, prévia, pedido, idempotência, pagamento desativado, listagem e cancelamento. TEST_EMAIL=${email} ORDER_ID=${result.order.id}`);

