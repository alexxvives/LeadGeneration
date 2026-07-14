# 0005. Switch database to Cloudflare D1 and auth to Auth.js

- Status: accepted
- Date: 2026-07-14
- Supersedes: [0003 — Supabase for auth + database](0003-supabase-auth-and-db.md)

## Context

ADR 0003 chose Supabase for auth + database citing the convenience of having
auth, Postgres, and row-level security (RLS) in one provider. Shortly after, it
became clear that the lead developer already runs Cloudflare D1 + Auth.js
successfully on another project. The primary argument for Supabase — "one
provider for auth + DB" — weakens when D1 + Auth.js is already a known-working
combination, and staying 100% within the Cloudflare ecosystem (the chosen deploy
target per ADR 0004) reduces the vendor count and the deploy complexity.

Additionally, on closer analysis:
- **RLS is defense-in-depth, not the primary isolation mechanism.** Workspace
  scoping is enforced in the service layer (`service.ts` → `LeadRepository`).
  RLS is a useful backstop but not a hard requirement.
- **D1 is faster for reads** — SQLite at the edge, replicated globally, vs.
  Supabase's single-region Postgres instance on free/pro tiers.
- **Auth.js is a zero-surprise session library** for Next.js App Router and
  is provider-agnostic (email magic link, Google OAuth, GitHub OAuth, credentials
  all work without changing anything else).

## Decision

Replace `SupabaseStore` with `D1Store` (`src/lib/db/d1-store.ts`) as the
production persistence backend, and adopt **Auth.js** (formerly NextAuth) for
authentication in Phase 1. The `LeadRepository` interface and `getDb()` are
unchanged from the outside; `getDb(binding?)` now selects `D1Store` when a
Cloudflare D1Database binding is passed (Workers runtime), else `JsonStore`
(local dev / demo mode — no change there).

SQL arrays (`emails`, `phones`, `tags`, `fit_reasons`) are serialised as JSON
strings in TEXT columns; the mapper in `d1-store.ts` handles this transparently.
The migration is SQLite-compatible: `migrations/0001_init.sql` (Wrangler default
path, applied with `wrangler d1 migrations apply`).

Auth.js session storage will use a D1 adapter (or JWT-only sessions, which need
no DB table) — decided in Phase 1 when auth is wired. No auth code is introduced
in Phase 0.

## Alternatives considered

- **Keep Supabase (0003 as written).** Valid, but adds a second external
  vendor when we're already committed to Cloudflare, and the RLS advantage is
  smaller than it first appeared given service-layer enforcement.
- **Cloudflare D1 + Clerk (auth SaaS).** Fast to wire but adds a third-party
  service with its own pricing, and Auth.js is more than sufficient for our auth
  needs and integrates directly with Next.js.
- **Durable Objects for state.** Overengineered for a relational Run→Lead→Outreach
  model. D1 is the right tool.

## Consequences

- ✅ Single hosting vendor (Cloudflare) for compute, DB, CDN, WAF, and
  eventually Turnstile — simpler ops and billing.
- ✅ D1 is faster at the edge for reads than a single-region Postgres.
- ✅ Zero-key demo mode and local dev are fully preserved: `getDb()` without a
  binding always returns `JsonStore` (constitution Article I.2).
- ✅ The Workers-only `fs` limitation of `JsonStore` is not a production concern:
  D1 is the production backend; JSON is local-only.
- ⚠️ **SQLite array limitation:** `emails[]`, `phones[]`, `tags[]`, and
  `fit_reasons[]` are JSON-encoded TEXT. The mapper is the single place that
  handles this; no service or UI changes. Future array operations (e.g.
  `WHERE 'x' = ANY(emails)`) need an explicit `json_each()` query — not
  currently needed.
- ⚠️ **No RLS:** workspace isolation is enforced in `service.ts` via
  `workspaceId` filters added in Phase 1. This requires disciplined service-layer
  coverage, documented in the workspace schema ADR (Phase 1).
- ⚠️ D1 binding (`env.DB`) is request-scoped in Workers; `D1Store` is not a
  singleton. `JsonStore` keeps its singleton for the in-process write chain.
- ⚠️ Auth.js details (adapter choice, session strategy, OAuth providers) are
  deferred to Phase 1 — adding that note here avoids re-litigating this decision.
