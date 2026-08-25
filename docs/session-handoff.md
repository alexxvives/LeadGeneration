# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-08-25 (lock 423 / empty list)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Migrations:** 0021–**0033** remote applied.

### This pass
- Collaborator heartbeat is HTTP 200 `{ acquired: false }`, not 423 — view
  still loads leads; edits stay locked. Lock effect no longer restarts on
  every board poll. Shared-board GET resolves owner leads by id. Orphan
  heal no longer `SELECT *` the workspace on each Worker isolate.
- Deployed to https://leadgeneration.alexxvives.workers.dev (version
  `3ab87647-26d9-4597-ab12-9158afcadcfe`).

### Next
1. Two-browser check on production: second user should see leads + Live chip, no 423 in the console.
2. Ona: sign in as `onaparadell@gmail.com` → Boards → **Accept invite**.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
