// Drizzle schema entry point. Each domain module will own its tables in
// `src/modules/<module>/<module>.schema.ts` and re-export them here so that
// drizzle-kit and the typed client see the whole database.
//
// Conventions (see docs/API_CONTRACTS.md, "Modelo de dados"):
// - snake_case columns (configured via `casing`), uuid primary keys;
// - money as integer centavos (`*_minor` bigint/integer columns), never numeric floats;
// - `created_at` / `updated_at` as timestamptz;
// - versioned JSON documents (landing pages) stored as immutable jsonb rows.
//
// E1 intentionally defines no business tables yet.
export {};
