-- Migration 0027: Per-outreach-profile Easy Sending identity (From + keys).
-- Secrets stay server-side; Pro mailbox remains workspace-scoped (ADR 0010).

ALTER TABLE workspaces ADD COLUMN profile_send_settings_json TEXT;
