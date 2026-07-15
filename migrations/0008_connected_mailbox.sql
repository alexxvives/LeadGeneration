-- Migration 0008: Pro mailbox OAuth (ADR 0010) — one connected mailbox per workspace.
--
-- Stores provider + email + encrypted tokens as a JSON blob so the shape can
-- evolve without more ALTER TABLEs. Tokens are AES-GCM ciphertext (never plain).
-- Multi-inbox deferred — overwrite on reconnect.
--
-- Apply:
--   npm run cf:migrate        (production D1)
--   npm run cf:migrate:local  (local D1 dev)

ALTER TABLE workspaces ADD COLUMN connected_mailbox_json TEXT;
