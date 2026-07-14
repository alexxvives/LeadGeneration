# 0003. Supabase for auth + database

- Status: accepted
- Date: 2026-07-13

## Context
Commercialization (`docs/commercialization.md`) requires real persistence
(multi-user, durable, concurrent), authentication, multi-tenant workspaces, and
row-level data isolation. The MVP persists to a local JSON file behind a
`LeadRepository` interface (ADR 0001), explicitly designed so the storage
backend can be swapped in one place (`getDb()`). We need a backend that covers
DB **and** auth **and** row-level security without stitching several services
together, while preserving the two hard invariants (constitution Article I):
human-in-the-loop approval and a fully working **zero-key demo mode**.

## Decision
Adopt **Supabase** (managed Postgres + Auth + Row-Level Security) as the
production backend. Implement `SupabaseStore` (`src/lib/db/supabase-store.ts`)
against the existing `LeadRepository` interface and select it in `getDb()` via
`config.ts::databaseProvider()`:

- If `SUPABASE_URL` **and** a Supabase key are present → `SupabaseStore`.
- Otherwise → `JsonStore` (the zero-key demo/offline default).

This keeps demo mode and offline install working with no keys, and makes Supabase
purely additive. Phase 0 mirrors the current schema 1:1 (no `workspace_id`, no
RLS yet) so the swap is invisible to the UI/service layer. Auth, workspaces, and
RLS land in Phase 1.

## Alternatives considered
- **Raw Postgres (Neon/RDS) + a separate auth library (NextAuth/Lucia).** More
  moving parts to wire and secure; auth + RLS + DB no longer share one model.
- **Firebase/Firestore.** Auth + DB in one, but document model fits our
  relational Run→Lead→Outreach shapes poorly and RLS-style rules are weaker for
  this use case.
- **PlanetScale / MySQL.** Solid DB, but no bundled auth or Postgres RLS, which
  is the exact primitive we want for per-workspace isolation.
- **Stay on the JSON file store.** Not concurrent-safe or multi-tenant; a
  non-starter for a hosted product (already flagged in ADR 0001).

## Consequences
- ✅ One provider for DB + auth + RLS; RLS is the right primitive for the
  Phase-1 workspace isolation model.
- ✅ Swap was a single-file change to `getDb()` plus one new repository impl —
  exactly what ADR 0001 set up. No UI/route/service changes.
- ✅ Demo mode + offline dev preserved: JSON store remains the default when keys
  are absent (constitution Article I.2).
- ⚠️ Phase 0 uses the **service-role key server-side** (bypasses RLS) and has
  **no RLS yet** — acceptable because it is single-tenant and server-only, but
  RLS + `workspace_id` are required before real multi-tenant traffic (Phase 1).
  The service-role key must never reach the client bundle (constitution III.5).
- ⚠️ Timestamps are stored as `timestamptz` and normalized back to ISO strings
  in the mapper; the exact string format may differ from the JSON store, but it
  is not user-visible (dates are formatted at render time).
- ⚠️ New runtime dependency (`@supabase/supabase-js`) and an external service in
  the hot path when enabled; the JSON fallback keeps local dev independent of it.
