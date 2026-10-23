-- Composite indexes for the hot read paths (additive, safe to re-run).
-- Board hydrate / counts / summaries: WHERE workspace_id = ? AND board_id = ?
-- then lane predicates on crm_stage, ORDER BY created_at DESC.
CREATE INDEX IF NOT EXISTS leads_ws_board_stage_created_idx
  ON leads (workspace_id, board_id, crm_stage, created_at DESC);
-- "All boards" listing + run-scoped lists.
CREATE INDEX IF NOT EXISTS leads_ws_created_idx
  ON leads (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS leads_ws_run_idx
  ON leads (workspace_id, run_id);
-- Card outreach attach: WHERE workspace_id = ? AND lead_id IN (...).
CREATE INDEX IF NOT EXISTS outreach_ws_lead_idx
  ON outreach (workspace_id, lead_id);
-- Latest-sent lookups ORDER BY sent_at DESC per lead.
CREATE INDEX IF NOT EXISTS outreach_lead_sent_idx
  ON outreach (lead_id, sent_at DESC);
-- Contacts / Tasks views: WHERE workspace_id = ? AND board_id = ? ORDER BY ...
CREATE INDEX IF NOT EXISTS contacts_ws_board_created_idx
  ON contacts (workspace_id, board_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tasks_ws_board_updated_idx
  ON tasks (workspace_id, board_id, updated_at DESC);
