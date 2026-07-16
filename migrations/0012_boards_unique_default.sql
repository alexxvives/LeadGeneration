-- One Default board per workspace (ADR 0014). Deduplicate any race-created
-- extras, then enforce with a partial unique index.

PRAGMA foreign_keys = ON;

-- Keep earliest default per workspace; demote extras so we can reassign + delete.
CREATE TABLE IF NOT EXISTS _board_default_keepers (
  workspace_id TEXT PRIMARY KEY,
  keep_id TEXT NOT NULL
);

INSERT OR REPLACE INTO _board_default_keepers (workspace_id, keep_id)
SELECT workspace_id, id
FROM (
  SELECT
    workspace_id,
    id,
    ROW_NUMBER() OVER (
      PARTITION BY workspace_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM boards
  WHERE is_default = 1
)
WHERE rn = 1;

CREATE TABLE IF NOT EXISTS _board_default_dups (
  dup_id TEXT PRIMARY KEY,
  keep_id TEXT NOT NULL
);

INSERT OR REPLACE INTO _board_default_dups (dup_id, keep_id)
SELECT b.id, k.keep_id
FROM boards b
JOIN _board_default_keepers k ON k.workspace_id = b.workspace_id
WHERE b.is_default = 1 AND b.id != k.keep_id;

UPDATE leads
SET board_id = (
  SELECT keep_id FROM _board_default_dups d WHERE d.dup_id = leads.board_id
)
WHERE board_id IN (SELECT dup_id FROM _board_default_dups);

UPDATE runs
SET board_id = (
  SELECT keep_id FROM _board_default_dups d WHERE d.dup_id = runs.board_id
)
WHERE board_id IN (SELECT dup_id FROM _board_default_dups);

UPDATE boards SET is_default = 0
WHERE id IN (SELECT dup_id FROM _board_default_dups);

DELETE FROM boards
WHERE id IN (SELECT dup_id FROM _board_default_dups);

DROP TABLE IF EXISTS _board_default_dups;
DROP TABLE IF EXISTS _board_default_keepers;

CREATE UNIQUE INDEX IF NOT EXISTS boards_one_default_per_workspace
  ON boards (workspace_id)
  WHERE is_default = 1;
