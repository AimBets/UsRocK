-- E1 baseline: database-level prerequisites only; no business tables yet.
-- citext provides case-insensitive text for emails and slugs (accounts, catalog, landing pages).
CREATE EXTENSION IF NOT EXISTS citext;
