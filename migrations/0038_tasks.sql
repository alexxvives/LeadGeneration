-- First-class workspace tasks (ADR 0039) — unified with journal kind "task".
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  board_id TEXT,
  title TEXT NOT NULL,
  owner_user_id TEXT,
  owner_name TEXT,
  deadline TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  lead_id TEXT,
  contact_id TEXT,
  journal_follow_up_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tasks_board ON tasks(board_id);
CREATE INDEX IF NOT EXISTS idx_tasks_lead ON tasks(lead_id);
CREATE INDEX IF NOT EXISTS idx_tasks_contact ON tasks(contact_id);
CREATE INDEX IF NOT EXISTS idx_tasks_journal ON tasks(journal_follow_up_id);
