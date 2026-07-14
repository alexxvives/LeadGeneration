-- Lodestar — Phase 0 schema for Cloudflare D1 (SQLite)
--
-- Mirrors src/lib/types.ts 1:1 so swapping getDb() to D1 is invisible to the
-- UI/service layer. Column mapping lives in src/lib/db/d1-store.ts.
--
-- SQLite differences from the original Postgres design:
--   • Arrays (emails, phones, tags, fit_reasons) → TEXT stored as JSON strings.
--     The d1-store maps them with JSON.parse/stringify.
--   • Timestamps → TEXT (ISO 8601); no conversion needed since we always store
--     and read ISO strings.
--   • Foreign keys are opt-in in SQLite; enable per-connection with the PRAGMA
--     below. D1 runs migrations with FK enforcement on by default.
--
-- Deliberately Phase-0 scoped: NO workspace_id, NO auth, NO RLS yet.
-- Those arrive in Phase 1 (Auth.js + workspaces). See docs/commercialization.md
-- and docs/decisions/0005-switch-to-d1-auth-js.md.
--
-- Apply via Wrangler:
--   npx wrangler d1 migrations apply <DATABASE_NAME> --local   (dev)
--   npx wrangler d1 migrations apply <DATABASE_NAME>           (production)

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS runs (
  id           TEXT PRIMARY KEY,
  niche        TEXT NOT NULL,
  location     TEXT,
  offer_notes  TEXT,
  status       TEXT NOT NULL,
  mode         TEXT NOT NULL,
  provider     TEXT NOT NULL,
  lead_count   INTEGER NOT NULL DEFAULT 0,
  error        TEXT,
  created_at   TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS leads (
  id           TEXT PRIMARY KEY,
  run_id       TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  company      TEXT NOT NULL,
  website      TEXT,
  emails       TEXT NOT NULL DEFAULT '[]',
  phones       TEXT NOT NULL DEFAULT '[]',
  contact_name TEXT,
  location     TEXT,
  about_blurb  TEXT,
  tags         TEXT NOT NULL DEFAULT '[]',
  fit_score    INTEGER NOT NULL DEFAULT 0,
  fit_reasons  TEXT NOT NULL DEFAULT '[]',
  source_url   TEXT NOT NULL,
  status       TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS outreach (
  id         TEXT PRIMARY KEY,
  -- UNIQUE enforces one outreach per lead (mirrors the type invariant).
  lead_id    TEXT NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
  run_id     TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  to_email   TEXT,
  subject    TEXT NOT NULL,
  body       TEXT NOT NULL,
  status     TEXT NOT NULL,
  sent_at    TEXT,
  error      TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS runs_created_at_idx   ON runs    (created_at DESC);
CREATE INDEX IF NOT EXISTS leads_run_id_idx      ON leads   (run_id);
CREATE INDEX IF NOT EXISTS leads_fit_score_idx   ON leads   (fit_score DESC);
CREATE INDEX IF NOT EXISTS outreach_lead_id_idx  ON outreach (lead_id);
CREATE INDEX IF NOT EXISTS outreach_run_id_idx   ON outreach (run_id);
