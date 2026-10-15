import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const edge = process.env.USROCK_BROWSER_PATH ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const origin = process.env.USROCK_STOREFRONT_ORIGIN ?? "http://localhost:3000";
const port = 9333;
const output = join(tmpdir(), "usrock-e4-responsive");
await mkdir(output, { recursive: true });
const browser = spawn(edge, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${join(tmpdir(), `usrock-edge-${process.pid}`)}`, "--no-first-run", "about:blank"], { stdio: "ignore" });

async function waitForTarget() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json());
      const page = targets.find((target) => target.type === "page");
      if (page) return page;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Edge CDP não iniciou.");
}

const target = await waitForTarget();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
let sequence = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const callback = pending.get(message.id);
  if (!callback) return;
  pending.delete(message.id);
  if (message.error) callback.reject(new Error(message.error.message)); else callback.resolve(message.result);
});
function command(method, params = {}) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

try {
  await command("Page.enable");
  await command("Runtime.enable");
  for (const width of [390, 768, 1024, 1440]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 1200, deviceScaleFactor: 1, mobile: width < 768, screenWidth: width, screenHeight: 1200 });
    for (const [name, path] of [["home", "/"], ["cart", "/carrinho"], ["favorites", "/favoritos"]]) {
      await command("Page.navigate", { url: `${origin}${path}` });
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const state = await command("Runtime.evaluate", { expression: "document.readyState", returnByValue: true });
        if (state.result.value === "complete") break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
      const metrics = await command("Runtime.evaluate", { expression: "({clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth})", returnByValue: true });
      const { clientWidth, scrollWidth } = metrics.result.value;
      if (clientWidth < width - 20 || clientWidth > width || scrollWidth > clientWidth) throw new Error(`${name} em ${width}px: clientWidth=${clientWidth}, scrollWidth=${scrollWidth}.`);
      const image = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      await writeFile(join(output, `${name}-${width}.png`), Buffer.from(image.data, "base64"));
    }
  }
  console.log(`Responsividade validada sem overflow em 390, 768, 1024 e 1440 px. Capturas: ${output}`);
} finally {
  socket.close();
  browser.kill();
}
