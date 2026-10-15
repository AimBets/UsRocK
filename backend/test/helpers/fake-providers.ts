import { createHmac } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Local stand-ins for the Mercado Pago and SuperFrete HTTP APIs. They speak HTTP so the real
 * clients (headers, body shape, status handling, parsing) are exercised; no external call is made.
 */

interface Recorded {
  method: string;
  path: string;
  headers: IncomingMessage["headers"];
  body: unknown;
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? (JSON.parse(text) as unknown) : undefined;
}

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

export interface FakePayment {
  id: string;
  status: string;
  status_detail?: string;
  external_reference: string;
  transaction_amount: number;
  currency_id?: string;
  live_mode?: boolean;
  date_approved?: string | null;
}

export async function startFakeMercadoPago() {
  const requests: Recorded[] = [];
  const paymentsById = new Map<string, FakePayment>();
  const preferencesByKey = new Map<string, string>();
  const state = { failPreferences: false, failReads: false };
  let preferenceCounter = 0;

  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://fake");
      const body = await readBody(request);
      requests.push({ method: request.method ?? "", path: url.pathname, headers: request.headers, body });

      if (request.method === "POST" && url.pathname === "/checkout/preferences") {
        if (state.failPreferences) return json(response, 503, { message: "unavailable" });
        // Same idempotency key → same preference, like the real API.
        const key = String(request.headers["x-idempotency-key"] ?? "");
        let id = preferencesByKey.get(key);
        if (!id) {
          preferenceCounter += 1;
          id = `pref-${preferenceCounter}`;
          if (key) preferencesByKey.set(key, id);
        }
        return json(response, 201, {
          id,
          init_point: `https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=${id}`,
          sandbox_init_point: `https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=${id}`,
        });
      }
      if (state.failReads) return json(response, 500, { message: "error" });
      if (request.method === "GET" && url.pathname === "/v1/payments/search") {
        const reference = url.searchParams.get("external_reference");
        return json(response, 200, { results: [...paymentsById.values()].filter((payment) => payment.external_reference === reference).map(withDefaults) });
      }
      const match = /^\/v1\/payments\/(\d+)$/.exec(url.pathname);
      if (request.method === "GET" && match) {
        const payment = paymentsById.get(match[1]!);
        return payment ? json(response, 200, withDefaults(payment)) : json(response, 404, { message: "not found" });
      }
      json(response, 404, { message: "unknown route" });
    })();
  });

  const withDefaults = (payment: FakePayment) => ({ currency_id: "BRL", live_mode: false, status_detail: "accredited", ...payment });

  const url = await listen(server);
  return {
    url,
    requests,
    state,
    setPayment(payment: FakePayment) {
      paymentsById.set(payment.id, payment);
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export async function startFakeSuperFrete() {
  const requests: Recorded[] = [];
  const labels = new Map<string, { id: string; status: string; tracking: string | null; print: { url: string } | null; price: number }>();
  const state = { quoteStatus: 200, quoteBody: undefined as unknown, failLabels: false };
  let labelCounter = 0;

  const defaultQuote = [
    { id: 1, name: "PAC", price: 22.5, delivery_time: 7, delivery_range: { min: 5, max: 7 }, company: { id: 1, name: "Correios" }, has_error: false },
    { id: 2, name: "SEDEX", price: "41.90", delivery_time: 2, delivery_range: { min: 1, max: 2 }, company: { id: 1, name: "Correios" }, has_error: false },
    { id: 17, name: "Mini Envios", error: "Peso excedido", has_error: true },
  ];

  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://fake");
      const body = await readBody(request);
      requests.push({ method: request.method ?? "", path: url.pathname, headers: request.headers, body });
      if (request.method === "POST" && url.pathname === "/api/v0/calculator") {
        return json(response, state.quoteStatus, state.quoteBody ?? defaultQuote);
      }
      if (state.failLabels) return json(response, 503, {});
      if (request.method === "POST" && url.pathname === "/api/v0/cart") {
        labelCounter += 1;
        const label = { id: `SF${labelCounter}`, status: "pending", tracking: null, print: null, price: 21.5 };
        labels.set(label.id, label);
        return json(response, 200, { id: label.id, price: label.price, status: label.status });
      }
      const info = /^\/api\/v0\/order\/info\/(.+)$/.exec(url.pathname);
      if (request.method === "GET" && info) {
        const label = labels.get(decodeURIComponent(info[1]!));
        return label ? json(response, 200, label) : json(response, 404, {});
      }
      json(response, 404, {});
    })();
  });

  const url = await listen(server);
  return {
    url,
    requests,
    state,
    setLabel(id: string, changes: { status: string; tracking?: string | null }) {
      const label = labels.get(id);
      if (!label) throw new Error(`label ${id} not found`);
      Object.assign(label, changes, changes.status !== "pending" ? { print: { url: `https://sandbox.superfrete.com/_etiqueta/pdf/${id}` } } : {});
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Signs a Mercado Pago notification the way the platform does (see verifyMercadoPagoSignature). */
export function mercadoPagoSignature(secret: string, dataId: string, requestId: string, ts = Math.floor(Date.now() / 1000)) {
  const v1 = createHmac("sha256", secret).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest("hex");
  return `ts=${ts},v1=${v1}`;
}

export function superFreteSignature(secret: string, rawBody: string) {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}
