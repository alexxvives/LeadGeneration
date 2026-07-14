-- Migration 0006: per-workspace email sending identity.
--
-- Adds nullable columns to workspaces so each tenant can configure their own
-- from-name, from-email, reply-to, physical address, and (optionally) their
-- own Resend API key for custom-domain sending — all via the Settings UI,
-- without touching .env files. NULL values fall back to the platform env vars.
--
-- Apply:
--   npm run cf:migrate        (production D1)
--   npm run cf:migrate:local  (local D1 dev)

ALTER TABLE workspaces ADD COLUMN from_name       TEXT;
ALTER TABLE workspaces ADD COLUMN from_email      TEXT;
ALTER TABLE workspaces ADD COLUMN reply_to        TEXT;
ALTER TABLE workspaces ADD COLUMN physical_address TEXT;
ALTER TABLE workspaces ADD COLUMN resend_api_key  TEXT;
