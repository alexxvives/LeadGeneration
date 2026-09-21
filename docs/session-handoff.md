# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-09-21 (LUMIA assignee picker live)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Migrations:** 0021–**0039** (applied on prod D1).  
**Deploy:** Worker `33141cd5-2302-433e-b95b-f30e0d63dfc1` (Windows: `cf:build` + `wrangler deploy`).

### This pass
- LUMIA people fetch now uses the same `filterBoardId` as tasks (no `boards[0]` /
  AKADEMO fallback). Invites GET no longer fails the whole request when invite
  listing throws. Deployed to prod.

### Next
1. Hard-refresh Tasks on LUMIA → Add task → expect alexxvives, j.d.h.jharo, onaparadell.
2. Pending invite `adriviveslliset@gmail.com` is not in the picker until accepted.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
