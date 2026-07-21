# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-07-21 (tour lag + Insider FC)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Local:** admin ops chrome; Insider invites; account delete (live only).
**Migrations:** 0021–**0025** local; **remote D1 needs `npm run cf:migrate`** (incl. `find_leads_enabled`).

### This pass
- Tour steps 2–3 lag: one navigation (board preserved), no loading flash on
  soft board sync, tip fade instead of remount, empty-view tour anchors.
- Insider “Credits unavailable”: `remaining_credits` snake_case parse fix.
- Soft lock 404: clear stale `?board=` before heartbeat.
- Admin Dashboard: removed tenants subtitle.

### Next
1. Deploy (credits + tour + lock fixes).
2. `npm run cf:migrate` (remote) if not already.
3. Measure email-found % on live Firecrawl runs.
4. Optional dogfood non-admin account for Search/Pipeline.
5. Human: `git filter-repo` purge of deleted LEADS xlsx from history.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
