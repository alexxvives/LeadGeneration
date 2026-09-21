# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-09-21 (Board people in assignee picker)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Migrations:** 0021–**0039** (applied on prod D1).  
**Deploy:** push to master for CI / Workers deploy.

### This pass
- Task assignee options now come from **board owner + all accepted
  collaborators** (`listBoardPeopleForUi`), not just the signed-in user.

### Next
1. Hard-refresh Tasks → Add task → see everyone on the active board.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
