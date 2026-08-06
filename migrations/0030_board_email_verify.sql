-- Per-board verify-before-send (Settings UI still edits the active board).
-- Seed from workspace so existing boards keep their current behavior.

ALTER TABLE boards ADD COLUMN email_verify_enabled INTEGER NOT NULL DEFAULT 1;

UPDATE boards
SET email_verify_enabled = COALESCE(
  (
    SELECT CASE WHEN w.email_verify_enabled = 0 THEN 0 ELSE 1 END
    FROM workspaces w
    WHERE w.id = boards.workspace_id
  ),
  1
);
