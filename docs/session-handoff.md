# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-07-22 (skeleton loading)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Local:** admin ops chrome; Insider invites; account delete (live only).
**Migrations:** 0021–**0025** local **and remote** (`find_leads_enabled` applied).

### This pass
- Skeleton loaders (200ms deferred) on Studio views, Dashboard, Boards, Runs,
  Admin, Map, Settings route — replace blank spinners for slow loads.
- Prior: map @2k geocode fast-path; leads table single scroll; contact col cap.

### Next
1. Deploy; hard-refresh; confirm skeletons on slow board load + no double scroll.
2. Optional: allow importing same-name rows as distinct locations (address key).
3. Verify a sending domain in Resend; set `OUTREACH_FROM_EMAIL` on Worker.
4. Human: `git filter-repo` purge of deleted LEADS xlsx from history.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
