import { afterEach, describe, expect, it } from "vitest";
import type { App } from "../src/app.js";
import { productAvailability, variantAvailability } from "../src/modules/catalog/availability.js";
import type { ErrorResponse } from "../src/shared/errors.js";
import { buildTestApp } from "./helpers/app.js";

describe("availability", () => {
  it("derives public state from available = onHand - reserved", () => {
    expect(variantAvailability(null)).toBe("out_of_stock");
    expect(variantAvailability({ onHand: 5, reserved: 5, lowStockThreshold: 3 })).toBe("out_of_stock");
    expect(variantAvailability({ onHand: 5, reserved: 2, lowStockThreshold: 3 })).toBe("low_stock");
    expect(variantAvailability({ onHand: 10, reserved: 2, lowStockThreshold: 3 })).toBe("in_stock");
    expect(variantAvailability({ onHand: 1, reserved: 0, lowStockThreshold: 0 })).toBe("in_stock");
  });

  it("reports a product as available as its best variant", () => {
    expect(productAvailability([])).toBe("out_of_stock");
    expect(productAvailability(["out_of_stock", "low_stock"])).toBe("low_stock");
    expect(productAvailability(["low_stock", "in_stock", "out_of_stock"])).toBe("in_stock");
  });
});

describe("catalog request validation (no database involved)", () => {
  let app: App;
  afterEach(async () => {
    await app.close();
  });

  const invalid = [
    ["/api/v1/products?limit=0", "querystring.limit"],
    ["/api/v1/products?limit=101", "querystring.limit"],
    ["/api/v1/products?sort=random", "querystring.sort"],
    ["/api/v1/products?priceMin=-1", "querystring.priceMin"],
    ["/api/v1/products?priceMin=500&priceMax=100", "querystring.priceMin"],
    ["/api/v1/products?inStock=yes", "querystring.inStock"],
    ["/api/v1/products?category=Camisetas%20Pretas", "querystring.category"],
    ["/api/v1/products/Not_A_Slug", "params.slug"],
    ["/api/v1/collections/..%2F..%2Fetc", "params.slug"],
  ] as const;

  it.each(invalid)("rejects %s", async (url, path) => {
    ({ app } = await buildTestApp());
    const res = await app.inject({ method: "GET", url });
    expect(res.statusCode).toBe(400);
    const { error } = res.json<ErrorResponse>();
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.details?.map((detail) => detail.path)).toContain(path);
  });

  it("rejects a malformed cursor before touching the database", async () => {
    ({ app } = await buildTestApp());
    const res = await app.inject({ method: "GET", url: "/api/v1/products?cursor=bm90LWpzb24" });
    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorResponse>().error.details?.[0]?.path).toBe("querystring.cursor");
  });
});
