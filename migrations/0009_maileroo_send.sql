-- Migration 0009: Easy-path Maileroo send (BYO API key) alongside Resend.
-- See docs/decisions/0011-easy-resend-or-maileroo.md

ALTER TABLE workspaces ADD COLUMN maileroo_api_key TEXT;
-- 'resend' | 'maileroo' — which Easy provider the workspace prefers
ALTER TABLE workspaces ADD COLUMN easy_email_provider TEXT;
