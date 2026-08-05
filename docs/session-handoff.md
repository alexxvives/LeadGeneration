# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-08-05 (Sending profile name + deploy)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Migrations:** 0021–**0027** remote applied (local: run `cf:migrate:local` if needed).

### This pass
- Root cause of “How do you want to send? name doesn’t change”: feature commit
  never pushed (connection reset) / never deployed; migrate had already run.
- UI: heading shows active profile (`· {name}`); hydrate notifies Sending;
  legacy seed = active only; empty shells for other profiles.
- Push + `cf:build` then `cf:deploy` required for live.

### Next
1. Hard-refresh Settings — switch profiles; heading `· name` + Your name/From
   should follow the active profile.
2. User may delete the accidental duplicate empty board.
3. Human: `git filter-repo` purge of deleted LEADS xlsx from history.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
