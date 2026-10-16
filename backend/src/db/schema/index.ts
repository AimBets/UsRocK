// Drizzle schema entry point. Each domain module owns its tables in
// `src/modules/<module>/<module>.schema.ts` and re-exports them here so that
// drizzle-kit and the typed client see the whole database.
//
// Conventions (see docs/API_CONTRACTS.md, "Modelo de dados"):
// - snake_case columns (configured via `casing`), uuid primary keys;
// - money as integer centavos (`*_minor` columns), never numeric floats;
// - `created_at` / `updated_at` as timestamptz;
// - versioned JSON documents (landing pages) stored as immutable jsonb rows.
export * from "../../modules/catalog/catalog.schema.js";
export * from "../../modules/accounts/accounts.schema.js";
export * from "../../modules/marketing/marketing.schema.js";
export * from "../../modules/cart/cart.schema.js";
export * from "../../modules/favorites/favorites.schema.js";
export * from "../../modules/newsletter/newsletter.schema.js";
export * from "../../modules/addresses/addresses.schema.js";
export * from "../../modules/orders/orders.schema.js";
export * from "../../modules/payments/payments.schema.js";
export * from "../../modules/shipping/shipping.schema.js";
export * from "../../modules/notifications/notifications.schema.js";
export * from "../../modules/audit/audit.schema.js";
