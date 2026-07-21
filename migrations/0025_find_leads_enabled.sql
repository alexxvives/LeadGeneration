-- Migration 0025: per-workspace toggle for Find leads (Search).
-- Admin can disable Search for Insider (or any) accounts without changing plan.
-- 1 = Search / live find enabled (default). 0 = tab blocked + createRun rejected.

ALTER TABLE workspaces ADD COLUMN find_leads_enabled INTEGER NOT NULL DEFAULT 1;
