# 0006. Workspace schema & service-layer isolation

- Status: accepted
- Date: 2026-07-14

## Context

Commercialization needs multi-tenancy: every `Run`/`Lead`/`Outreach` must belong
to a tenant so plans, quotas, and data are scoped per customer. D1/SQLite has no
row-level security (ADR 0005), so isolation must be enforced elsewhere. We also
must preserve zero-key demo mode (constitution Art. I.2), where there is no auth
and no real tenant.

Open question the task left to us: should `LeadRepository` gain a `workspaceId`
parameter on every method, or should `getDb()` accept a workspace and return a
scoped store?

## Decision

Add a `workspaces` table (migration `0002`) and a `workspace_id` column to
`runs`, `leads`, and `outreach`. Introduce a `Workspace` domain type carrying the
plan + Stripe linkage + usage counters.

**`getDb(binding?, workspaceId?)` returns a repository already scoped to a
workspace.** Every `runs/leads/outreach` read and write inside `D1Store` /
`JsonStore` is filtered by `workspace_id = ?`; writes stamp the same id.
Workspace + auth tables are global (not scoped). The service layer chooses the
workspace (from the session, via `getCtx()`), so isolation is *enforced in the
service layer* per constitution Art. II.2 — the store is just the mechanism.

The implicit workspace id `"local"` is used for demo/dev. `JsonStore` treats a
row with no `workspaceId` as `"local"`, so pre-existing seed data stays visible.

## Alternatives considered

- **`workspaceId` on every repository method.** More explicit at call sites but
  noisier, and easy to forget one argument and leak across tenants. A
  constructor-scoped store makes the safe path the default path.
- **Rely on RLS.** Not available in D1/SQLite (ADR 0005).
- **A separate `WorkspaceRepository`.** Rejected: workspace CRUD is small and
  cohesive with the same store/binding; a second interface adds ceremony. The
  workspace methods live on `LeadRepository` but are explicitly *not* scoped.

## Consequences

- ✅ One wiring point (`getDb`) controls tenancy; service signatures gained a
  `Ctx { db, workspaceId, metered }` instead of a workspace arg per call.
- ✅ `JsonStore` instances are now created per request (per workspace scope), so
  its write-serialization chain moved from instance to a module-level shared
  chain to keep concurrent file writes ordered.
- ⚠️ Isolation depends on the store always applying the `workspace_id` filter —
  covered once in each `D1Store`/`JsonStore` method. Any new query must include
  it. Getters that miss the filter would leak across tenants.
- ⚠️ `workspace_id` cross-tenant `getRun`/`getLead` return `null` (row exists but
  not in scope), which the routes already treat as 404 — the desired behavior.
