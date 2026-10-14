import { afterEach, describe, expect, it } from "vitest";
import type { App } from "../src/app.js";
import { REDACTED } from "../src/config/logger.js";
import { buildTestApp } from "./helpers/app.js";

let app: App;
afterEach(async () => {
  await app.close();
});

describe("structured logging", () => {
  it("logs JSON with request id, method and path only", async () => {
    let logs;
    ({ app, logs } = await buildTestApp());
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/health/live?email=cliente@example.com&token=abc",
      headers: { cookie: "usrock_session=very-secret-session", authorization: "Bearer very-secret-token" },
    });

    const incoming = logs.lines.find((line) => line.msg === "incoming request");
    expect(incoming).toMatchObject({
      service: "usrock-backend",
      requestId: res.headers["x-request-id"],
      req: { method: "GET", path: "/api/v1/health/live" },
    });
    const raw = logs.raw();
    expect(raw).not.toContain("cliente@example.com");
    expect(raw).not.toContain("very-secret-session");
    expect(raw).not.toContain("very-secret-token");
  });

  it("redacts sensitive fields logged by application code", async () => {
    let logs;
    ({ app, logs } = await buildTestApp());
    await app.ready();
    app.log.info(
      { email: "cliente@example.com", customer: { cpf: "000.000.000-00", phone: "+5511999999999", name: "ok" }, payment: { card: { cardNumber: "4111" } } },
      "customer event",
    );
    const line = logs.lines.find((entry) => entry.msg === "customer event");
    expect(line).toMatchObject({
      email: REDACTED,
      customer: { cpf: REDACTED, phone: REDACTED, name: "ok" },
      payment: { card: { cardNumber: REDACTED } },
    });
  });
});
