import { z } from "zod";
import { errors } from "./errors.js";

export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 100;

/**
 * Cursor pagination query (`?limit=24&cursor=...`). Cursors are opaque to clients:
 * they must be passed back unchanged and never parsed or constructed by the frontend.
 */
export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  cursor: z.string().min(1).max(512).regex(/^[A-Za-z0-9_-]+$/).optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const pageInfoSchema = z
  .object({
    limit: z.number().int(),
    hasNextPage: z.boolean(),
    nextCursor: z.string().nullable(),
  })
  .meta({ id: "PageInfo" });

export type PageInfo = z.infer<typeof pageInfoSchema>;

/** Standard list envelope: `{ data: T[], pageInfo }`. */
export function paginatedResponseSchema<T extends z.ZodType>(item: T) {
  return z.object({ data: z.array(item), pageInfo: pageInfoSchema });
}

export function encodeCursor(payload: Record<string, string | number>): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

/** Decodes and validates a cursor; any tampering or shape mismatch is a 400, never a 500. */
export function decodeCursor<T extends z.ZodType>(cursor: string, shape: T): z.infer<T> {
  try {
    const parsed = shape.safeParse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    if (parsed.success) return parsed.data;
  } catch {
    // fall through to the uniform error below
  }
  throw errors.validation([{ path: "querystring.cursor", message: "Cursor inválido ou expirado.", code: "invalid_cursor" }]);
}

/**
 * Builds the page from `limit + 1` fetched rows: the extra row only signals that another
 * page exists. `cursorFor` receives the last row actually returned.
 */
export function buildPage<Row, Item>(
  rows: Row[],
  limit: number,
  cursorFor: (row: Row) => Record<string, string | number>,
  toItem: (row: Row) => Item,
): { data: Item[]; pageInfo: PageInfo } {
  const hasNextPage = rows.length > limit;
  const pageRows = hasNextPage ? rows.slice(0, limit) : rows;
  const last = pageRows.at(-1);
  return {
    data: pageRows.map(toItem),
    pageInfo: { limit, hasNextPage, nextCursor: hasNextPage && last ? encodeCursor(cursorFor(last)) : null },
  };
}
