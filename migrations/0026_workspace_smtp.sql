-- Migration 0026: Workspace BYO SMTP (Hostinger / generic) for Easy send.
-- Platform SMTP_* env remains auth / fallback only — not tenant mailboxes.

ALTER TABLE workspaces ADD COLUMN smtp_host TEXT;
ALTER TABLE workspaces ADD COLUMN smtp_port INTEGER;
ALTER TABLE workspaces ADD COLUMN smtp_user TEXT;
ALTER TABLE workspaces ADD COLUMN smtp_pass TEXT;
