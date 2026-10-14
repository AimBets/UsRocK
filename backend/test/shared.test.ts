import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError } from "../src/shared/errors.js";
import { addMoney, brl, moneySchema, multiplyMoney } from "../src/shared/money.js";
import { buildPage, decodeCursor, encodeCursor, paginationQuerySchema } from "../src/shared/pagination.js";

describe("pagination", () => {
  const cursorShape = z.object({ createdAt: z.string(), id: z.string() });

  it("applies default and maximum limits", () => {
    expect(paginationQuerySchema.parse({})).toEqual({ limit: 24 });
    expect(paginationQuerySchema.parse({ limit: "10" }).limit).toBe(10);
    expect(paginationQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ cursor: "not base64url!" }).success).toBe(false);
  });

  it("round-trips opaque cursors", () => {
    const cursor = encodeCursor({ createdAt: "2026-10-13T00:00:00.000Z", id: "p1" });
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(cursor, cursorShape)).toEqual({ createdAt: "2026-10-13T00:00:00.000Z", id: "p1" });
  });

  it("rejects tampered cursors as a validation error", () => {
    const tampered = encodeCursor({ id: 1 });
    for (const cursor of [tampered, "Zm9v", "____"]) {
      try {
        decodeCursor(cursor, cursorShape);
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe("VALIDATION_ERROR");
      }
    }
  });

  it("builds a page from limit + 1 rows", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const page = buildPage(rows, 2, (row) => ({ id: row.id }), (row) => row.id);
    expect(page.data).toEqual(["a", "b"]);
    expect(page.pageInfo.hasNextPage).toBe(true);
    expect(decodeCursor(page.pageInfo.nextCursor ?? "", z.object({ id: z.string() }))).toEqual({ id: "b" });

    const last = buildPage(rows.slice(0, 2), 2, (row) => ({ id: row.id }), (row) => row.id);
    expect(last.pageInfo).toEqual({ limit: 2, hasNextPage: false, nextCursor: null });
  });
});

describe("money", () => {
  it("uses integer centavos only", () => {
    expect(brl(12990)).toEqual({ amountMinor: 12990, currencyCode: "BRL" });
    expect(() => brl(129.9)).toThrow(RangeError);
    expect(() => brl(-1)).toThrow(RangeError);
    expect(moneySchema.safeParse({ amountMinor: 129.9, currencyCode: "BRL" }).success).toBe(false);
    expect(moneySchema.safeParse({ amountMinor: 100, currencyCode: "USD" }).success).toBe(false);
  });

  it("adds and multiplies without floating point drift", () => {
    expect(addMoney(brl(10), brl(20))).toEqual(brl(30));
    expect(multiplyMoney(brl(12990), 3)).toEqual(brl(38970));
    expect(() => multiplyMoney(brl(100), 1.5)).toThrow(RangeError);
  });
});
