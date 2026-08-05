# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-08-05 (Sending profile name live)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Migrations:** 0021–**0027** remote applied.  
**Deployed:** version `89662cac-…` (`cf:build` + `cf:deploy` after push).

### This pass
- Root cause: feature commit never pushed (connection reset) / never deployed;
  migrate 0027 had already run.
- UI: heading shows `How do you want to send? · {profile}`; hydrate notifies;
  legacy seed = active only.
- Pushed + deployed.

### Next
1. Hard-refresh Settings — switch profiles; confirm heading + Your name/From.
2. User may delete the accidental duplicate empty board.
3. Human: `git filter-repo` purge of deleted LEADS xlsx from history.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
