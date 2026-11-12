-- Allow a new draft after a send, keeping the sent outreach row as history.
-- lead_id was UNIQUE (one outreach per lead). Re-send now inserts a second row;
-- list/get helpers pick the current (open) draft when both exist.

PRAGMA foreign_keys = OFF;

CREATE TABLE outreach_0047 (
  id         TEXT PRIMARY KEY,
  lead_id    TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  run_id     TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  to_email   TEXT,
  subject    TEXT NOT NULL,
  body       TEXT NOT NULL,
  status     TEXT NOT NULL,
  sent_at    TEXT,
  error      TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT 'local',
  delivery_status TEXT NOT NULL DEFAULT 'unknown'
);

INSERT INTO outreach_0047 (
  id, lead_id, run_id, to_email, subject, body, status, sent_at, error,
  created_at, updated_at, workspace_id, delivery_status
)
SELECT
  id, lead_id, run_id, to_email, subject, body, status, sent_at, error,
  created_at, updated_at, workspace_id, delivery_status
FROM outreach;

DROP TABLE outreach;
ALTER TABLE outreach_0047 RENAME TO outreach;

CREATE INDEX IF NOT EXISTS outreach_lead_id_idx ON outreach (lead_id);
CREATE INDEX IF NOT EXISTS outreach_run_id_idx  ON outreach (run_id);
CREATE INDEX IF NOT EXISTS outreach_sent_to_email_idx
  ON outreach (lower(to_email), sent_at DESC)
  WHERE status = 'sent';
CREATE INDEX IF NOT EXISTS outreach_ws_lead_idx
  ON outreach (workspace_id, lead_id);
CREATE INDEX IF NOT EXISTS outreach_lead_sent_idx
  ON outreach (lead_id, sent_at DESC);

PRAGMA foreign_keys = ON;
