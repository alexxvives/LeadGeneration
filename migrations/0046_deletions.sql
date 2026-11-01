-- Round 9: "Deleted by X just now" notices. Small tombstone log, pruned after
-- ~1 day by the app on every write. New table only — no existing data touched.
CREATE TABLE IF NOT EXISTS deletions (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_name TEXT,
  board_id TEXT,
  deleted_by_id TEXT,
  deleted_by_name TEXT,
  deleted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deletions_board ON deletions (board_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_deletions_entity ON deletions (entity_id);
