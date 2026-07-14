-- Lodestar — Phase 1: workspaces (multi-tenancy) + Auth.js tables
--
-- Adds:
--   • workspaces         — one tenant per row; owns runs/leads/outreach; holds
--                          the plan + Stripe linkage. Usage counters are added
--                          separately in 0003_usage_counters.sql.
--   • workspace_id       — a scoping column on runs/leads/outreach. Every query
--                          in D1Store filters by it (ADR 0006 — no RLS in D1;
--                          isolation is enforced in the service layer).
--   • Auth.js D1 tables  — users / accounts / sessions / verification_tokens,
--                          matching @auth/d1-adapter's schema. Sessions are JWT
--                          (ADR 0007) so the sessions table is unused today, but
--                          the email magic-link flow needs verification_tokens.
--
-- Apply via Wrangler:
--   npx wrangler d1 migrations apply lodestar-prod --local   (dev)
--   npx wrangler d1 migrations apply lodestar-prod           (production)

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS workspaces (
  id                     TEXT PRIMARY KEY,
  name                   TEXT NOT NULL,
  owner_user_id          TEXT,
  plan_id                TEXT NOT NULL DEFAULT 'free',
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id        TEXT,
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS workspaces_owner_idx
  ON workspaces (owner_user_id);
CREATE INDEX IF NOT EXISTS workspaces_stripe_customer_idx
  ON workspaces (stripe_customer_id);

-- Scope existing tables to a workspace. Existing rows default to 'local'.
ALTER TABLE runs     ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'local';
ALTER TABLE leads    ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'local';
ALTER TABLE outreach ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'local';

CREATE INDEX IF NOT EXISTS runs_workspace_idx     ON runs     (workspace_id);
CREATE INDEX IF NOT EXISTS leads_workspace_idx    ON leads    (workspace_id);
CREATE INDEX IF NOT EXISTS outreach_workspace_idx ON outreach (workspace_id);

-- ── Auth.js (@auth/d1-adapter) schema ──
CREATE TABLE IF NOT EXISTS "accounts" (
  "id" text NOT NULL,
  "userId" text NOT NULL DEFAULT NULL,
  "type" text NOT NULL DEFAULT NULL,
  "provider" text NOT NULL DEFAULT NULL,
  "providerAccountId" text NOT NULL DEFAULT NULL,
  "refresh_token" text DEFAULT NULL,
  "access_token" text DEFAULT NULL,
  "expires_at" number DEFAULT NULL,
  "token_type" text DEFAULT NULL,
  "scope" text DEFAULT NULL,
  "id_token" text DEFAULT NULL,
  "session_state" text DEFAULT NULL,
  "oauth_token_secret" text DEFAULT NULL,
  "oauth_token" text DEFAULT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" text NOT NULL,
  "sessionToken" text NOT NULL,
  "userId" text NOT NULL DEFAULT NULL,
  "expires" datetime NOT NULL DEFAULT NULL,
  PRIMARY KEY (sessionToken)
);

CREATE TABLE IF NOT EXISTS "users" (
  "id" text NOT NULL DEFAULT '',
  "name" text DEFAULT NULL,
  "email" text DEFAULT NULL,
  "emailVerified" datetime DEFAULT NULL,
  "image" text DEFAULT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS "verification_tokens" (
  "identifier" text NOT NULL,
  "token" text NOT NULL DEFAULT NULL,
  "expires" datetime NOT NULL DEFAULT NULL,
  PRIMARY KEY (token)
);
