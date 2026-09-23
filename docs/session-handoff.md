# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-09-23 (Lead info chips + unresponsive clock)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Migrations:** 0021–**0040** applied on prod D1. No new migration this pass.  
**Deploy:** Local until `cf:build` + `wrangler deploy`. Prod still uses the old touch rule until then.

### This pass
- Lead info stage chips and “Where they are” stay on one scrolling row.
- Pipeline unresponsive clock is a solid rose badge at the start of the card title.
- Follow-up reminders no longer count as a touch. Moving a card into a step no longer overrides an older note. An open task still hides the clock.

### Next
1. `npm run cf:build` then `$env:OPEN_NEXT_DEPLOY='true'; npx wrangler deploy` so prod matches the step list and this touch rule.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
