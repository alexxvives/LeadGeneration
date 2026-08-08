# HERMES mail audit tracker

Living checklist from the 2026-07-18 full-repo audit. Update status as items
ship. Details / evidence live in chat + code; this file is the task board.

**Legend:** `todo` · `doing` · `done` · `wontfix` · `blocked` (needs decision)

---

## 0. Meta

| ID | Item | Status | Notes |
|----|------|--------|-------|
| M0 | Create this tracker | done | `docs/AUDIT.md` |
| M1 | Admin-only plan/usage override | done | Defaults built-in; env optional |
| M2 | Rebrand → Hermes Mail | done | In progress elsewhere / branding |

---

## 1. Critical

| ID | Item | Status | Notes |
|----|------|--------|-------|
| C1 | Gate `/api/workspace/set-plan` + `reset-usage` | done | Admin when `authRequired()` |
| C2 | Email webhooks fail-open + cross-tenant match | done | BYO: auto-register on key save (0016); platform secret optional |
| C3 | Concurrent send race (no atomic claim) | done | `claimOutreachForSend` → `sending` |

---

## 2. High

| ID | Item | Status | Notes |
|----|------|--------|-------|
| H1 | Human Reject not in UI / docs lie | done | Undeliverable = verify only |
| H2 | Lead/Outreach `failed` dead / inconsistent | done | Transport → `failed` |
| H3 | `setOutreachDecision` allows re-approve of `sent` | done | Blocks `sent` / `sending` |
| H4 | Silent auto-approve on Send | done | Documented intentional |
| H5 | Fat webhook routes + `process.env` outside config | done | Secrets via `config.ts` |
| H6 | In-process rate limit on Workers | done | D1/JSON count of recent sends (no KV) |

---

## 3. Medium

| ID | Item | Status | Notes |
|----|------|--------|-------|
| M1 | UI imports `generateDraft` / warmup / enrich | done | `draft-preview` + `format-location`; warmup is client-local |
| M2 | Webhook idempotency + delivery monotonicity | done | Monotonicity; no event-id store |
| M3 | Orphaned search runs (no heal) | done | `healStuckSearchRuns` |
| M4 | Verify-reject dead-end UX | done | Stay in Contact Draft; edit To restores |
| M5 | Duplicate mailbox age types | done | warmup re-exports from `types.ts` |
| M6 | `SMOKE_API_KEY` prod risk | done | Documented |

---

## 4. Low / UX

| ID | Item | Status | Notes |
|----|------|--------|-------|
| L1 | `StatusPill` unused; Leads Status = CRM | done | Pipeline + Email columns |
| L2 | Export “Discarded” color legacy | done | Removed |
| L3 | Dialog a11y (`role="dialog"`) | done | Drawer + upgrade/verify modals |
| L4 | Mobile Pipeline / pickers | done | Scroll columns; pickers visible |
| L5 | Raw `invalid_email_removed` in drawer | done | Friendly mapping |
| L6 | Docs drift (how-it-works, cloudflare-secrets) | done | |

---

## 5. 2026-08-06 platform audit follow-ups

| ID | Item | Status | Notes |
|----|------|--------|-------|
| A1 | `draftOutreach` can reset sent | done | Guard like editOutreach |
| A2 | Pricing Annual toggle vs Checkout | done | Toggle removed (monthly only) |
| A3 | Soft-merge ghosts / board delete | done | Shrink/single-page + clear filter |
| A4 | Import cross-board relocate | done | Board-scoped company dedupe |
| A5 | canSendEmail vs Easy-only | done | Dropped mailbox OR |
| A6 | Mobile board / Pipeline / focus / Runs | done | Sheet, stage select, traps, open run |

---

## 6. Open ops (human)

1. Apply D1 migrations through **0030** (`npm run cf:migrate`) then deploy — **done** per session-handoff 2026-08-08.
2. Optional: platform `RESEND_WEBHOOK_SECRET` only if using Worker `RESEND_API_KEY` for outreach.
3. Delete leftover `ADMIN_EMAIL` / `ADMIN_PASSWORD` Wrangler secrets; rotate admin password hash in D1 when sharing widely.

---

## 7. 2026-08-08 hygiene & efficiency audit

Full findings: [`hygiene-audit-2026-08-08.md`](hygiene-audit-2026-08-08.md).  
July root `AUDIT_REPORT.md` is superseded for prioritization (many P0s fixed).

| ID | Item | Status | Notes |
|----|------|--------|-------|
| HYG-1 | Safe deletes (ProfilePicker, identity.ts, LUMIA dumps, `.firecrawl/`, `scripts/.wrangler/tmp`, stale AUDIT_REPORT) | done | 2026-08-08 |
| HYG-2 | Docs: Easy-only send in how-it-works / email-providers / secrets | done | Brand “Lodestar” leftovers remain in older roadmaps |
| HYG-3 | `listRuns` → LIMIT 1 latest run (PERF-03) | done | `getLatestRun` |
| HYG-4 | Full-table dedupe on search/import (PERF-02) | todo | P1 |
| HYG-5 | Async search queue (PERF-01) | todo | P1 |
| HYG-6 | Strip Pro/Gmail + Zeruh alias (SEND-01) | done | ADR 0026 |
| HYG-7 | Conditional quota gate + encrypt BYO keys (SEND-02, SEC-01) | todo | P2 |
| HYG-8 | `NODE_ENV` only via config.ts (LAY-03) | done | `env.isProduction()` |

---

## How to update

When you finish an item: set Status, one-line Notes, and refresh
`docs/session-handoff.md` Status block.
