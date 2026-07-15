-- Migration 0010: preferred Easy vs Pro send path (Settings tab).
-- 'easy' | 'pro' — null/empty treated as: pro if mailbox connected else easy.

ALTER TABLE workspaces ADD COLUMN preferred_send_path TEXT;
