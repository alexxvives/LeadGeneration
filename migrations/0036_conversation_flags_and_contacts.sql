-- In-conversation CRM flags + board-scoped collaborators (ADR 0036).
ALTER TABLE leads ADD COLUMN waiting_on_us INTEGER NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN demo_done INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  board_id TEXT NOT NULL,
  name TEXT NOT NULL,
  organization TEXT,
  email TEXT,
  phone TEXT,
  location TEXT,
  follow_ups TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE INDEX IF NOT EXISTS idx_contacts_workspace ON contacts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_contacts_board ON contacts(board_id);
