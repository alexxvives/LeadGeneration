-- Simultaneous editing: optimistic concurrency per lead.
-- version bumps on every lead write; updated_by_name names the last editor
-- for "Changed by X" conflict messages. lead_tree holds LUMIA tree progress
-- apart from custom_fields (NULL = not migrated yet; reads fall back to the
-- custom_fields "__lead_tree" key, which is left untouched). No data rewrite.
ALTER TABLE leads ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN updated_by_name TEXT;
ALTER TABLE leads ADD COLUMN lead_tree TEXT;

-- Idempotency keys for outreach sends and stage transitions (duplicate
-- clicks / two users / retries can't double-send).
CREATE TABLE IF NOT EXISTS idempotency_keys (
  workspace_id TEXT NOT NULL,
  key TEXT NOT NULL,
  scope TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, key)
);
