# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-07-22 (leads instant chrome)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Local:** admin ops chrome; Insider invites; account delete (live only).
**Migrations:** 0021–**0025** local **and remote** (`find_leads_enabled` applied).

### This pass
- Leads: single toolbar tree (no remount on hydrate); body skeleton only;
  warm revisit skips blank frame; filter keeps stale rows; nav highlight
  optimistic; table virtualized (`@tanstack/react-virtual`).

### Next
1. Deploy; hard-refresh; confirm Leads nav + Table/Cards/Map feel instant @2k.
2. Optional: allow importing same-name rows as distinct locations (address key).
3. Verify a sending domain in Resend; set `OUTREACH_FROM_EMAIL` on Worker.
4. Human: `git filter-repo` purge of deleted LEADS xlsx from history.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
