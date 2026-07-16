-- Migration 0014: per-workspace toggle for Zeruh email verification at send.
-- 1 = verify before send when MAILEROO_VERIFY_API_KEY / ZERUH_API_KEY is set.
-- 0 = skip verify (still demo-safe). NULL treated as enabled.

ALTER TABLE workspaces ADD COLUMN email_verify_enabled INTEGER NOT NULL DEFAULT 1;
