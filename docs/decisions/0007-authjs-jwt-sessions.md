# 0007. Auth.js session strategy: JWT + split edge/server config

- Status: accepted
- Date: 2026-07-14

## Context

ADR 0005 chose Auth.js and deferred the session-strategy decision to Phase 1.
Now we must pick JWT sessions vs database (D1-adapter) sessions, and reconcile
three constraints:

1. Local `npm run dev` must work with **zero external keys** (Art. I.2).
2. Production login is a **Resend magic-link** — Auth.js "email" providers
   *require* a database adapter to persist verification tokens.
3. Middleware runs on the **edge**, where Node APIs (`fs`) are illegal — so the
   config used by middleware must not import the DB (`JsonStore` pulls in `fs`).

## Decision

**Use JWT sessions (`session.strategy = "jwt"`).** No `sessions` table lookups,
no per-request DB round-trip, and it plays well with Cloudflare Workers.

**Providers:**
- Local dev: a **Credentials** provider that accepts any email + password.
  Registered *only when auth is not enforced* (`AUTH_SECRET` unset), so it can
  never be an any-password backdoor in production.
- Production: the **Resend** magic-link provider, registered when
  `AUTH_RESEND_KEY`/`RESEND_API_KEY` is set.

**A D1 adapter is still attached** (in `src/auth.ts`, lazily, when a binding is
present) purely so the magic-link flow can store `users`/`verification_tokens`.
Sessions remain JWT; the adapter is not used for session storage.

**Config is split** to respect the edge boundary:
- `src/auth.config.ts` — edge-safe base (providers, secret, JWT strategy, the
  `session` callback). No DB imports. Used by `middleware.ts`.
- `src/auth.ts` — full server config: adds the D1 adapter and the
  workspace-provisioning `jwt` callback (which touches the DB). Imported only by
  the `/api/auth` route and server helpers (`getCtx`) — never by middleware.

Workspace provisioning happens in the `jwt` callback **only at sign-in** (when
`user` is set): it finds-or-creates the user's default workspace and caches
`workspaceId` on the token, so middleware never needs the DB.

Auth is **enforced only when `AUTH_SECRET` is set** (`authRequired()`). Local dev
with no secret leaves the studio open and unmetered — preserving demo mode.

## Alternatives considered

- **Database sessions (D1 adapter sessions).** A DB read on every request, and
  the Credentials provider (needed for keyless dev) *requires* JWT anyway. JWT
  is the only strategy compatible with both providers.
- **Single auth config file.** Simpler on paper, but importing the DB-aware
  config into middleware drags `fs` into the edge bundle → build failure. The
  split is the standard Auth.js v5 pattern for exactly this reason.
- **Clerk / hosted auth.** Adds a third-party vendor; rejected in ADR 0005.

## Consequences

- ✅ Zero-key dev + magic-link prod + Stripe all coexist without a session table.
- ✅ Middleware bundle stays edge-safe (no `fs`).
- ⚠️ `jose` (via `@auth/core`) triggers benign "Edge Runtime" build warnings for
  `CompressionStream`; Auth.js doesn't compress JWTs and Workers provides the
  API, so it's a no-op. Documented in LEARNINGS.
- ⚠️ JWTs carry `workspaceId`; changing a user's workspace requires the token to
  refresh (re-login) or an `unstable_update`. Acceptable for the single-workspace
  MVP.
- ⚠️ Production requires `AUTH_RESEND_KEY` (or `RESEND_API_KEY`) or there is no
  usable sign-in provider. Documented in `.env.example`.
