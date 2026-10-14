import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type { App } from "../src/app.js";
import { errors, type ErrorResponse } from "../src/shared/errors.js";
import { buildTestApp, TEST_ORIGIN } from "./helpers/app.js";

const probeRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/probe/items",
    { schema: { body: z.object({ quantity: z.number().int().min(1), sku: z.string().min(3) }), response: { 201: z.object({ ok: z.boolean() }) } } },
    async (_request, reply) => reply.status(201).send({ ok: true }),
  );
  app.post(
    "/probe/cart",
    { schema: { body: z.object({ items: z.array(z.object({ quantity: z.number().int().min(1) })) }) } },
    async () => ({}),
  );
  app.get("/probe/conflict", async () => {
    throw errors.conflict("Pedido já foi pago.");
  });
  app.get("/probe/crash", async () => {
    throw new Error("connection to db-internal:5432 failed for user admin");
  });
  app.get("/probe/bad-response", { schema: { response: { 200: z.object({ id: z.string() }) } } }, async () => {
    return { id: 123 } as unknown as { id: string };
  });
};

let app: App;

async function setup() {
  const built = await buildTestApp();
  app = built.app;
  await app.register(probeRoutes, { prefix: "/api/v1" });
  await app.ready();
  return built;
}

afterEach(async () => {
  await app.close();
});

describe("request id", () => {
  it("generates a UUID and returns it in the header and error body", async () => {
    await setup();
    const res = await app.inject({ method: "GET", url: "/api/v1/missing" });
    const id = res.headers["x-request-id"];
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.json<ErrorResponse>().error.requestId).toBe(id);
  });

  it("propagates a well-formed incoming X-Request-Id", async () => {
    await setup();
    const res = await app.inject({ method: "GET", url: "/api/v1/health/live", headers: { "x-request-id": "next-req_12345678" } });
    expect(res.headers["x-request-id"]).toBe("next-req_12345678");
  });

  it("replaces a malformed incoming X-Request-Id (log injection)", async () => {
    await setup();
    const res = await app.inject({ method: "GET", url: "/api/v1/health/live", headers: { "x-request-id": "abc\" injected {" } });
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("error envelope", () => {
  it("returns 404 for unknown routes", async () => {
    await setup();
    const res = await app.inject({ method: "GET", url: "/api/v1/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json<ErrorResponse>().error).toMatchObject({ code: "NOT_FOUND", message: "Rota não encontrada." });
  });

  it("maps schema validation failures to VALIDATION_ERROR with field paths", async () => {
    await setup();
    const res = await app.inject({ method: "POST", url: "/api/v1/probe/items", payload: { quantity: 0, sku: "x" } });
    expect(res.statusCode).toBe(400);
    const { error } = res.json<ErrorResponse>();
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.details?.map((detail) => detail.path).sort()).toEqual(["body.quantity", "body.sku"]);
  });

  it("reports nested field paths as documented in API_CONTRACTS", async () => {
    await setup();
    const res = await app.inject({ method: "POST", url: "/api/v1/probe/cart", payload: { items: [{ quantity: 0 }] } });
    expect(res.json<ErrorResponse>().error.details).toEqual([
      { path: "body.items.0.quantity", message: "Too small: expected number to be >=1", code: "too_small" },
    ]);
  });

  it("returns AppError status, code and message", async () => {
    await setup();
    const res = await app.inject({ method: "GET", url: "/api/v1/probe/conflict" });
    expect(res.statusCode).toBe(409);
    expect(res.json<ErrorResponse>().error).toMatchObject({ code: "CONFLICT", message: "Pedido já foi pago." });
  });

  it("hides internal error details from the client but logs them", async () => {
    const { logs } = await setup();
    const res = await app.inject({ method: "GET", url: "/api/v1/probe/crash" });
    expect(res.statusCode).toBe(500);
    expect(res.json<ErrorResponse>().error).toMatchObject({ code: "INTERNAL_ERROR", message: "Erro interno. Tente novamente mais tarde." });
    expect(res.body).not.toContain("db-internal");
    expect(logs.raw()).toContain("db-internal");
  });

  it("treats a response that violates its schema as a 500", async () => {
    await setup();
    const res = await app.inject({ method: "GET", url: "/api/v1/probe/bad-response" });
    expect(res.statusCode).toBe(500);
    expect(res.json<ErrorResponse>().error.code).toBe("INTERNAL_ERROR");
  });

  it("rejects malformed JSON with BAD_REQUEST", async () => {
    await setup();
    const res = await app.inject({ method: "POST", url: "/api/v1/probe/items", headers: { "content-type": "application/json" }, payload: "{bad" });
    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorResponse>().error.code).toBe("BAD_REQUEST");
  });

  it("rejects non-JSON bodies with UNSUPPORTED_MEDIA_TYPE", async () => {
    await setup();
    const res = await app.inject({ method: "POST", url: "/api/v1/probe/items", headers: { "content-type": "text/plain" }, payload: "quantity=1" });
    expect(res.statusCode).toBe(415);
    expect(res.json<ErrorResponse>().error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });
});

describe("security", () => {
  it("sets hardening headers", async () => {
    await setup();
    const res = await app.inject({ method: "GET", url: "/api/v1/health/live" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("allows CORS only for configured origins", async () => {
    await setup();
    const allowed = await app.inject({ method: "OPTIONS", url: "/api/v1/probe/items", headers: { origin: TEST_ORIGIN, "access-control-request-method": "POST" } });
    expect(allowed.headers["access-control-allow-origin"]).toBe(TEST_ORIGIN);
    expect(allowed.headers["access-control-allow-credentials"]).toBe("true");

    const denied = await app.inject({ method: "OPTIONS", url: "/api/v1/probe/items", headers: { origin: "https://evil.example", "access-control-request-method": "POST" } });
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("blocks state-changing requests from unknown origins", async () => {
    await setup();
    const payload = { quantity: 1, sku: "abc" };
    const foreign = await app.inject({ method: "POST", url: "/api/v1/probe/items", headers: { origin: "https://evil.example" }, payload });
    expect(foreign.statusCode).toBe(403);
    expect(foreign.json<ErrorResponse>().error.code).toBe("FORBIDDEN");

    const sameSite = await app.inject({ method: "POST", url: "/api/v1/probe/items", headers: { origin: TEST_ORIGIN }, payload });
    expect(sameSite.statusCode).toBe(201);

    const serverToServer = await app.inject({ method: "POST", url: "/api/v1/probe/items", payload });
    expect(serverToServer.statusCode).toBe(201);
  });

  it("rate limits with the standard envelope and Retry-After", async () => {
    const built = await buildTestApp({ env: { RATE_LIMIT_MAX: "2" } });
    app = built.app;
    await app.ready();
    await app.inject({ method: "GET", url: "/api/v1/health/live" });
    await app.inject({ method: "GET", url: "/api/v1/health/live" });
    const res = await app.inject({ method: "GET", url: "/api/v1/health/live" });
    expect(res.statusCode).toBe(429);
    expect(res.headers["retry-after"]).toBeDefined();
    expect(res.json<ErrorResponse>().error.code).toBe("RATE_LIMITED");
  });

  it("rejects bodies over the size limit", async () => {
    await setup();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/probe/items",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ quantity: 1, sku: "x".repeat(1024 * 1024 + 1) }),
    });
    expect(res.statusCode).toBe(413);
    expect(res.json<ErrorResponse>().error.code).toBe("PAYLOAD_TOO_LARGE");
  });
});
