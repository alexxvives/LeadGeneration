-- One workspace per owner (audit C2.8). Deduplicate race-created rows, then
-- enforce with a partial unique index on owner_user_id.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS _ws_owner_keepers (
  owner_user_id TEXT PRIMARY KEY,
  keep_id TEXT NOT NULL
);

INSERT OR REPLACE INTO _ws_owner_keepers (owner_user_id, keep_id)
SELECT owner_user_id, id
FROM (
  SELECT
    owner_user_id,
    id,
    ROW_NUMBER() OVER (
      PARTITION BY owner_user_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM workspaces
  WHERE owner_user_id IS NOT NULL
)
WHERE rn = 1;

CREATE TABLE IF NOT EXISTS _ws_owner_dups (
  dup_id TEXT PRIMARY KEY,
  keep_id TEXT NOT NULL
);

INSERT OR REPLACE INTO _ws_owner_dups (dup_id, keep_id)
SELECT w.id, k.keep_id
FROM workspaces w
JOIN _ws_owner_keepers k ON k.owner_user_id = w.owner_user_id
WHERE w.owner_user_id IS NOT NULL AND w.id != k.keep_id;

-- Reassign tenant-scoped rows from duplicate workspaces onto the keeper.
UPDATE runs
SET workspace_id = (SELECT keep_id FROM _ws_owner_dups d WHERE d.dup_id = runs.workspace_id)
WHERE workspace_id IN (SELECT dup_id FROM _ws_owner_dups);

UPDATE leads
SET workspace_id = (SELECT keep_id FROM _ws_owner_dups d WHERE d.dup_id = leads.workspace_id)
WHERE workspace_id IN (SELECT dup_id FROM _ws_owner_dups);

UPDATE outreach
SET workspace_id = (SELECT keep_id FROM _ws_owner_dups d WHERE d.dup_id = outreach.workspace_id)
WHERE workspace_id IN (SELECT dup_id FROM _ws_owner_dups);

UPDATE boards
SET workspace_id = (SELECT keep_id FROM _ws_owner_dups d WHERE d.dup_id = boards.workspace_id)
WHERE workspace_id IN (SELECT dup_id FROM _ws_owner_dups);

-- Merging boards can leave multiple defaults per workspace — keep earliest.
CREATE TABLE IF NOT EXISTS _board_default_keepers2 (
  workspace_id TEXT PRIMARY KEY,
  keep_id TEXT NOT NULL
);

INSERT OR REPLACE INTO _board_default_keepers2 (workspace_id, keep_id)
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

UPDATE boards SET is_default = 0
WHERE is_default = 1
  AND id NOT IN (SELECT keep_id FROM _board_default_keepers2);

DROP TABLE IF EXISTS _board_default_keepers2;

DELETE FROM workspaces
WHERE id IN (SELECT dup_id FROM _ws_owner_dups);

DROP TABLE IF EXISTS _ws_owner_dups;
DROP TABLE IF EXISTS _ws_owner_keepers;

DROP INDEX IF EXISTS workspaces_owner_idx;

CREATE UNIQUE INDEX IF NOT EXISTS workspaces_owner_unique
  ON workspaces (owner_user_id)
  WHERE owner_user_id IS NOT NULL;
