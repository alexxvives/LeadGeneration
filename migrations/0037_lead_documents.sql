-- Files attached to closed leads (ADR 0038). Bytes stay in `content`.
CREATE TABLE IF NOT EXISTS lead_documents (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  content BLOB NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE INDEX IF NOT EXISTS idx_lead_documents_workspace ON lead_documents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_lead_documents_lead ON lead_documents(lead_id);
