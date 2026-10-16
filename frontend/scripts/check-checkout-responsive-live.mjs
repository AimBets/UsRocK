import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const edge = process.env.USROCK_BROWSER_PATH ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const origin = process.env.USROCK_STOREFRONT_ORIGIN ?? "http://localhost:3000";
const email = `codex-e5-visual-${Date.now()}@example.test`;
const cookies = new Map();
const output = join(tmpdir(), "usrock-e5-responsive");
await mkdir(output, { recursive: true });

function updateCookies(response) {
  const values = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  for (const value of values) {
    const [pair] = value.split(";"); const separator = pair.indexOf("="); const name = pair.slice(0, separator); const content = pair.slice(separator + 1);
    if (content) cookies.set(name, content); else cookies.delete(name);
  }
}
async function api(path, { method = "GET", body, expected = 200, headers = {} } = {}) {
  const response = await fetch(`${origin}/api/v1${path}`, { method, headers: { Accept: "application/json", Origin: origin, ...headers, ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(cookies.size ? { Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; ") } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  updateCookies(response); const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (response.status !== expected) throw new Error(`${method} ${path}: esperado ${expected}, recebido ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

const products = await api("/products?limit=6");
const variant = products.data.flatMap((product) => product.variants).find((item) => item.availability !== "out_of_stock");
if (!variant) throw new Error("Variante disponível ausente.");
await api("/cart/items", { method: "POST", body: { variantId: variant.id, quantity: 1 } });
await api("/auth/register", { method: "POST", expected: 201, body: { email, password: "UsRock-E5-visual-seguro", name: "Visual E5 Codex", acceptTerms: true, marketingEmailOptIn: false } });
const address = await api("/me/addresses", { method: "POST", expected: 201, body: { label: "Casa", recipientName: "Visual E5 Codex", recipientDocument: "52998224725", recipientPhone: "11999991234", postalCode: "13010000", street: "Rua do Palco", number: "100", complement: "Apto 12", district: "Centro", city: "Campinas", state: "SP", isDefault: true } });

const port = 9334;
const browser = spawn(edge, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${join(tmpdir(), `usrock-edge-e5-${process.pid}`)}`, "--no-first-run", "about:blank"], { stdio: "ignore" });
async function waitForTarget() { for (let attempt = 0; attempt < 50; attempt += 1) { try { const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json()); const page = targets.find((target) => target.type === "page"); if (page) return page; } catch {} await new Promise((resolve) => setTimeout(resolve, 100)); } throw new Error("Edge CDP não iniciou."); }
const target = await waitForTarget();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
let sequence = 0; const pending = new Map();
socket.addEventListener("message", (event) => { const message = JSON.parse(event.data); if (!message.id) return; const callback = pending.get(message.id); if (!callback) return; pending.delete(message.id); if (message.error) callback.reject(new Error(message.error.message)); else callback.resolve(message.result); });
function command(method, params = {}) { const id = ++sequence; socket.send(JSON.stringify({ id, method, params })); return new Promise((resolve, reject) => pending.set(id, { resolve, reject })); }

async function navigate(name, path, width, expectedText) {
  await command("Emulation.setDeviceMetricsOverride", { width, height: 1200, deviceScaleFactor: 1, mobile: width < 768, screenWidth: width, screenHeight: 1200 });
  await command("Page.navigate", { url: `${origin}${path}` });
  for (let attempt = 0; attempt < 50; attempt += 1) { const state = await command("Runtime.evaluate", { expression: "document.readyState", returnByValue: true }); if (state.result.value === "complete") break; await new Promise((resolve) => setTimeout(resolve, 100)); }
  let visibleText = "";
  for (let attempt = 0; attempt < 50; attempt += 1) { const content = await command("Runtime.evaluate", { expression: "document.body.innerText", returnByValue: true }); visibleText = String(content.result.value); if (visibleText.toLocaleLowerCase("pt-BR").includes(expectedText.toLocaleLowerCase("pt-BR"))) break; if (attempt === 49) throw new Error(`${name} em ${width}px não exibiu ${expectedText}. Conteúdo: ${visibleText.slice(0, 600)}`); await new Promise((resolve) => setTimeout(resolve, 100)); }
  const metrics = await command("Runtime.evaluate", { expression: "({clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth})", returnByValue: true });
  const { clientWidth, scrollWidth } = metrics.result.value;
  if (clientWidth < width - 20 || clientWidth > width || scrollWidth > clientWidth) throw new Error(`${name} em ${width}px: clientWidth=${clientWidth}, scrollWidth=${scrollWidth}.`);
  const image = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(join(output, `${name}-${width}.png`), Buffer.from(image.data, "base64"));
}

async function waitForText(expectedText, context) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const content = await command("Runtime.evaluate", { expression: "document.body.innerText", returnByValue: true });
    if (String(content.result.value).toLocaleLowerCase("pt-BR").includes(expectedText.toLocaleLowerCase("pt-BR"))) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${context} não exibiu ${expectedText}.`);
}

async function clickButton(text, context) {
  const clicked = await command("Runtime.evaluate", {
    expression: `(() => { const text = ${JSON.stringify(text.toLocaleLowerCase("pt-BR"))}; const button = [...document.querySelectorAll("button")].find((item) => !item.disabled && item.innerText.toLocaleLowerCase("pt-BR").includes(text)); if (!button) return false; button.click(); return true; })()`,
    returnByValue: true,
  });
  if (!clicked.result.value) throw new Error(`${context}: botão ${text} não estava disponível.`);
}

async function captureState(name, width) {
  const metrics = await command("Runtime.evaluate", { expression: "({clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth})", returnByValue: true });
  const { clientWidth, scrollWidth } = metrics.result.value;
  if (clientWidth < width - 20 || clientWidth > width || scrollWidth > clientWidth) throw new Error(`${name} em ${width}px: clientWidth=${clientWidth}, scrollWidth=${scrollWidth}.`);
  const image = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(join(output, `${name}-${width}.png`), Buffer.from(image.data, "base64"));
}

let order;
try {
  await command("Page.enable"); await command("Runtime.enable"); await command("Network.enable");
  for (const [name, value] of cookies) {
    const stored = await command("Network.setCookie", { name, value, url: origin });
    if (!stored.success) throw new Error(`Edge recusou o cookie ${name}.`);
  }
  for (const width of [390, 768, 1024, 1440]) {
    await navigate("cart", "/carrinho", width, "Ir para checkout");
    await navigate("checkout", "/checkout", width, "Calcular entrega");
    await clickButton("Calcular entrega", `checkout em ${width}px`);
    await waitForText("Escolha a entrega", `checkout em ${width}px`);
    await captureState("checkout-shipping", width);
    const selected = await command("Runtime.evaluate", { expression: `(() => { const input = document.querySelector('.shipping-options input[type="radio"]'); if (!input) return false; input.click(); return true; })()`, returnByValue: true });
    if (!selected.result.value) throw new Error(`checkout em ${width}px não exibiu modalidade de entrega.`);
    await clickButton("Revisar pedido", `checkout em ${width}px`);
    await waitForText("Revise antes de pagar", `checkout em ${width}px`);
    await captureState("checkout-review", width);
    await navigate("addresses", "/conta/enderecos", width, "Seus destinos");
    await clickButton("Editar", `endereços em ${width}px`);
    await waitForText("Salvar alterações", `endereços em ${width}px`);
    await captureState("address-edit", width);
  }
  const quote = await api("/shipping/quotes", { method: "POST", body: { postalCode: address.postalCode } });
  const selection = { addressId: address.id, quoteId: quote.id, serviceId: quote.options[0].serviceId };
  const preview = await api("/checkouts/preview", { method: "POST", body: selection });
  const result = await api("/checkouts", { method: "POST", expected: 201, headers: { "Idempotency-Key": crypto.randomUUID() }, body: { ...selection, expectedTotal: preview.totals.total } });
  order = result.order;
  for (const width of [390, 768, 1024, 1440]) {
    await navigate("orders", "/conta/pedidos", width, order.number);
    await navigate("order-detail", `/conta/pedidos/${order.id}`, width, "Valores registrados");
    await navigate("payment-return", `/checkout/retorno?pedido=${order.id}`, width, "Nenhum parâmetro de sucesso");
  }
  await api(`/orders/${order.id}/cancel`, { method: "POST", body: {} });
  console.log(`Checkout E5 responsivo validado em 390, 768, 1024 e 1440 px. Capturas: ${output} TEST_EMAIL=${email} ORDER_ID=${order.id}`);
} finally {
  socket.close(); browser.kill();
}

