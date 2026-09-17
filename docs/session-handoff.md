# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-09-17 (collaborator create focus)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Migrations:** 0021–**0037** applied on prod D1 (`lodestar-prod`).  
**Deploy:** push to master for CI / Workers deploy.

### This pass
- Fixed New collaborator modal jumping focus to the ✕ on every keystroke.
- Contact drawer focuses the name field on open, not on parent re-renders.

### Next
1. Hard-refresh, Add collaborator, type in Name — cursor should stay put.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
