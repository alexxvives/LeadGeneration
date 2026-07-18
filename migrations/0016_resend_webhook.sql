-- Per-workspace Resend delivery webhook (auto-registered when BYO key is saved).
-- signing_secret verifies Svix signatures for that tenant's Resend account.

ALTER TABLE workspaces ADD COLUMN resend_webhook_id TEXT;
ALTER TABLE workspaces ADD COLUMN resend_webhook_secret TEXT;
