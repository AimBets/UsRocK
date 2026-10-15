const origin = process.env.USROCK_STOREFRONT_ORIGIN ?? "http://localhost:3000";
const mailpit = process.env.USROCK_MAILPIT_ORIGIN ?? "http://127.0.0.1:8025";
const email = `codex-e4-${Date.now()}@example.test`;
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

async function api(path, { method = "GET", body, expected = 200 } = {}) {
  const response = await fetch(`${origin}/api/v1${path}`, {
    method,
    headers: {
      Accept: "application/json",
      Origin: origin,
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
if (products.data.length !== 6) throw new Error(`Catálogo deveria conter 6 produtos; recebeu ${products.data.length}.`);
const variants = products.data.slice(0, 3).map((product) => product.variants.find((variant) => variant.availability !== "out_of_stock")?.id);
if (variants.some((id) => !id)) throw new Error("Três variantes disponíveis são necessárias para o check.");

for (const variantId of variants) await api("/cart/items", { method: "POST", body: { variantId, quantity: 1 } });
const persistedGuest = await api("/cart");
if (persistedGuest.owner !== "guest" || persistedGuest.items.length !== 3) throw new Error("Persistência da sacola visitante falhou.");
const couponCart = await api("/cart/coupon", { method: "PUT", body: { code: "DEMO10" } });
if (couponCart.coupon?.status !== "applied" || couponCart.totals.discount.amountMinor <= 0) throw new Error("Cupom DEMO10 não foi aplicado pelo servidor.");

await api("/auth/register", {
  method: "POST",
  expected: 201,
  body: { email, password: "UsRock-E4-teste-seguro", name: "Teste E4 Codex", acceptTerms: true, marketingEmailOptIn: false },
});
const merged = await api("/cart");
if (merged.owner !== "customer" || merged.items.length !== 3) throw new Error("Mesclagem da sacola após login falhou.");
const changed = await api(`/cart/items/${merged.items[0].id}`, { method: "PATCH", body: { quantity: 2 } });
if (changed.items.find((item) => item.id === merged.items[0].id)?.quantity !== 2) throw new Error("Alteração de quantidade não persistiu.");

await api(`/me/favorites/${products.data[0].id}`, { method: "PUT", body: {} , expected: 204 });
const favorites = await api("/me/favorites");
if (!favorites.data.some((item) => item.product.id === products.data[0].id)) throw new Error("Favorito não foi sincronizado.");

await api("/newsletter/subscriptions", { method: "POST", expected: 202, body: { email, consent: true, source: "footer" } });
let message;
for (let attempt = 0; attempt < 30; attempt += 1) {
  const list = await fetch(`${mailpit}/api/v1/messages`).then((response) => response.json());
  const summary = list.messages.find((item) => JSON.stringify(item.To ?? item.to ?? "").includes(email));
  if (summary) {
    message = await fetch(`${mailpit}/api/v1/message/${summary.ID ?? summary.id}`).then((response) => response.json());
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}
if (!message) throw new Error("O e-mail de confirmação não chegou ao Mailpit.");
const serialized = JSON.stringify(message);
const confirmToken = serialized.match(/newsletter\\?\/confirmar\?token=([A-Za-z0-9_-]{43})/)?.[1];
const unsubscribeToken = serialized.match(/newsletter\\?\/cancelar\?token=([A-Za-z0-9_-]{43})/)?.[1];
if (!confirmToken || !unsubscribeToken) throw new Error("Os links de confirmação/descadastro não foram encontrados no Mailpit.");
await api("/newsletter/confirm", { method: "POST", body: { token: confirmToken } });
await api("/newsletter/unsubscribe", { method: "POST", body: { token: unsubscribeToken } });

await api("/auth/logout", { method: "POST", body: {}, expected: 204 });
await api("/me/favorites", { expected: 401 });

console.log(`Comércio ao vivo validado: visitante, persistência, cupom, login/mesclagem, quantidade, favorito e newsletter via Mailpit. TEST_EMAIL=${email}`);
