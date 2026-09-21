# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-09-21 (LUMIA assignee picker)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Migrations:** 0021–**0039** (applied on prod D1).  
**Deploy:** Windows — `npm run cf:build` then `$env:OPEN_NEXT_DEPLOY='true'; npx wrangler deploy`.

### This pass
- **Root cause:** LUMIA has 3 people in prod D1 (you + j.d.h.jharo + onaparadell), but the
  Tasks UI was loading assignee options from `boards[0]` when the URL board param was
  missing — that board is **AKADEMO** (owner only). Alex also appeared from a legacy
  task row (`owner_user_id` fallback) even when the people list was wrong.
- **Fix (local, needs deploy):** people fetch uses the same `filterBoardId` as tasks;
  invites route no longer fails the whole request when invite listing throws.

### Next
1. Run `npm run cf:deploy`, hard-refresh Tasks on LUMIA → Add task → expect 3 names.
2. Pending invite `adriviveslliset@gmail.com` is not in the picker (not an accepted member yet).

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
