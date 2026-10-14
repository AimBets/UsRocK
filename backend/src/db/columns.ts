import { customType, timestamp } from "drizzle-orm/pg-core";

/** Case-insensitive text (extension created in migration 0000_init). Used for slugs, SKUs and emails. */
export const citext = customType<{ data: string }>({ dataType: () => "citext" });

/** Full-text search vector; always a generated column, never written by the application. */
export const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** Lowercase kebab-case, as used in public URLs. Mirrored by the API validation in shared/slug.ts. */
export const SLUG_PATTERN_SQL = "^[a-z0-9]+(-[a-z0-9]+)*$";
