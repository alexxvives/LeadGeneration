-- Migration 0015: per-workspace daily email-verify counters (plan-tiered).
-- Resets lazily when verifies_resets_at is in the past (next UTC midnight).

ALTER TABLE workspaces ADD COLUMN verifies_used_today INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workspaces ADD COLUMN verifies_resets_at TEXT;
