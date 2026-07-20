-- Persist outreach profiles on the workspace (audit U13 / step 16).

ALTER TABLE workspaces ADD COLUMN outreach_profiles_json TEXT;
