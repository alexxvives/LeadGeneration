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

## 5. Open ops (human)

1. Apply D1 migrations through **0018** (`npm run cf:migrate`) then deploy.
2. Optional: platform `RESEND_WEBHOOK_SECRET` only if using Worker `RESEND_API_KEY` for outreach.
3. Delete leftover `ADMIN_EMAIL` / `ADMIN_PASSWORD` Wrangler secrets; rotate admin password hash in D1 when sharing widely.

---

## How to update

When you finish an item: set Status, one-line Notes, and refresh
`docs/session-handoff.md` Status block.
