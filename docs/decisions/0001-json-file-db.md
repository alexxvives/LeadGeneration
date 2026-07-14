# 0001. Local JSON file DB behind a repository interface

- Status: accepted
- Date: 2026-07-13

## Context
The MVP must run with `npm install && npm run dev` on any machine, offline, with
no external services — but we also want a clean path to a real database
(Supabase) for commercialization.

## Decision
Persist to a local JSON file (`data/db.json`) via a `JsonStore` that implements a
`LeadRepository` interface. All app code depends only on the interface
(`getDb()`), never on the store.

## Alternatives considered
- **SQLite (better-sqlite3):** real DB, but native module compilation is risky on
  fresh Node 24 / Windows and could break the "just works" install goal.
- **Supabase from day one:** requires keys/network, breaks zero-key demo mode and
  offline install.

## Consequences
- ✅ Zero-dependency, offline, easy to reset (delete the file).
- ✅ Swapping to Supabase is a single-file change (`getDb()` + a new impl).
- ⚠️ Not concurrent-safe at volume; writes are serialized in-process only. Fine
  for a local single-user MVP, not for production multi-instance — which is
  exactly when we move to Supabase (see `docs/commercialization.md` Phase 0).
