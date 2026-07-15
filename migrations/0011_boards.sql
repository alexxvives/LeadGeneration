-- First-class Boards: named lead collections within a workspace (ADR 0014).
-- Every workspace gets a Default board via ensureDefaultBoard() in the service
-- layer; existing leads/runs are back-filled there on first access.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS boards (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name         TEXT NOT NULL,
  is_default   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS boards_workspace_id_idx ON boards (workspace_id);
CREATE INDEX IF NOT EXISTS boards_workspace_default_idx
  ON boards (workspace_id, is_default);

ALTER TABLE runs ADD COLUMN board_id TEXT;
ALTER TABLE leads ADD COLUMN board_id TEXT;

CREATE INDEX IF NOT EXISTS leads_board_id_idx ON leads (board_id);
CREATE INDEX IF NOT EXISTS runs_board_id_idx ON runs (board_id);
