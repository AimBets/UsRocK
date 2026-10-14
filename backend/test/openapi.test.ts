import { afterEach, describe, expect, it } from "vitest";
import type { App } from "../src/app.js";
import { buildTestApp } from "./helpers/app.js";

let app: App;
afterEach(async () => {
  await app.close();
});

describe("OpenAPI", () => {
  it("documents health routes with shared error responses", async () => {
    ({ app } = await buildTestApp());
    await app.ready();
    const document = app.swagger() as {
      openapi: string;
      paths: Record<string, { get: { responses: Record<string, unknown> } }>;
      components: { schemas: Record<string, unknown> };
    };
    expect(document.openapi).toBe("3.1.0");
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        "/api/v1/health",
        "/api/v1/health/live",
        "/api/v1/products",
        "/api/v1/products/{slug}",
        "/api/v1/collections",
        "/api/v1/collections/{slug}",
        "/api/v1/categories",
        "/api/v1/auth/register",
        "/api/v1/auth/login",
        "/api/v1/auth/logout",
        "/api/v1/auth/password/forgot",
        "/api/v1/auth/password/reset",
        "/api/v1/me",
        "/api/v1/me/password",
      ]),
    );
    for (const schema of ["ProductSummary", "ProductDetail", "ProductVariant", "Money", "PageInfo", "Collection", "Category", "CurrentUser"]) {
      expect(document.components.schemas).toHaveProperty(schema);
    }
    expect(Object.keys(document.paths["/api/v1/health"]?.get.responses ?? {})).toEqual(
      expect.arrayContaining(["200", "429", "500", "503"]),
    );
    expect(document.components.schemas).toHaveProperty("ErrorResponse");
    expect(document.components.schemas).toHaveProperty("HealthResponse");
  });

  it("serves the interactive docs only when enabled", async () => {
    ({ app } = await buildTestApp());
    expect((await app.inject({ method: "GET", url: "/docs" })).statusCode).toBe(404);
    await app.close();

    ({ app } = await buildTestApp({ env: { API_DOCS_ENABLED: "true" } }));
    const json = await app.inject({ method: "GET", url: "/docs/json" });
    expect(json.statusCode).toBe(200);
    expect(json.json()).toHaveProperty("paths./api/v1/health");
    const ui = await app.inject({ method: "GET", url: "/docs" });
    expect(ui.statusCode).toBe(200);
    expect(ui.headers["content-security-policy"]).toContain("script-src 'self'");
  });
});
