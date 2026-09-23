# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-09-23 (Conversation clock badge, aurora tasks)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Migrations:** 0021–**0040** applied on prod D1. No new migration this pass.  
**Deploy:** Local until `cf:build` + `wrangler deploy`. Prod still uses the previous studio chrome until then. This pass did not deploy.

### This pass
- Conversation cards use a rose clock in the same round badge as the step mark. Pipeline keeps the bare clock.
- Calendar tasks are aurora. Notes stay amber.

### Next
1. `npm run cf:build` then `$env:OPEN_NEXT_DEPLOY='true'; npx wrangler deploy` so prod matches the step list, touch rule, and this chrome.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
