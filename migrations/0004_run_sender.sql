-- Lodestar — Phase B: sender display name on runs
--
-- Persists the sender's display name (from the browser-only sender profile,
-- passed via the API — never read from localStorage on the server) so outreach
-- drafts and re-drafts sign consistently. Nullable; drafts fall back to
-- OUTREACH_FROM_NAME when absent. Mirrors src/lib/types.ts Run.senderName and
-- the mapping in src/lib/db/d1-store.ts.
--
-- Apply via Wrangler:
--   npx wrangler d1 migrations apply lodestar-prod --local   (dev)
--   npx wrangler d1 migrations apply lodestar-prod           (production)

ALTER TABLE runs ADD COLUMN sender_name TEXT;
