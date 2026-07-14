-- Lodestar — Phase 2: per-workspace usage counters
--
-- Monthly quota metering (see src/lib/plans.ts + service.ts). Counters reset
-- lazily on the first read after `resets_at`. Demo mode (JsonStore / no D1
-- binding) is always free and unmetered, so these are production-only in
-- practice — but the columns exist for every workspace row.
--
-- Apply via Wrangler:
--   npx wrangler d1 migrations apply lodestar-prod --local   (dev)
--   npx wrangler d1 migrations apply lodestar-prod           (production)

ALTER TABLE workspaces ADD COLUMN leads_used_this_month INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workspaces ADD COLUMN sends_used_this_month INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workspaces ADD COLUMN resets_at TEXT;
