# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-09-21 (Tasks / calendar / layout polish)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Migrations:** 0021–**0039** (applied on prod D1).  
**Deploy:** Worker `33141cd5` still live; this pass is local until `cf:build` + `wrangler deploy`.

### This pass
- Task cards: no on-card status `<select>` (drag / edit sheet instead).
- Pipeline/outreach lead cards: removed the redundant info (i) icon.
- Layout: min-w-0 / overflow-x-hidden on studio shells; calendar/settings headers no longer use overlapping absolute chrome.
- Calendar: stronger today + selected + weekend/event fills; larger event chips on sm+; dated notes show on the month.

### Next
1. Deploy when ready (`npm run cf:build` then `$env:OPEN_NEXT_DEPLOY='true'; npx wrangler deploy`).

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
