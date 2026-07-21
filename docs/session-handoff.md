# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-07-21 (Insider FC parse + board lock)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Local:** admin ops chrome; Insider invites; account delete (live only).
**Migrations:** 0021–**0025** local; **remote D1 needs `npm run cf:migrate`** (incl. `find_leads_enabled`).

### This pass
- Insider “Credits unavailable”: `getFirecrawlRemainingCredits` now reads
  `remaining_credits` (Firecrawl snake_case); was looking for camelCase only.
- Soft lock 404 during tutorial: validate/clear stale `?board=` / localStorage
  ids against workspace boards before heartbeat.
- Admin Dashboard: removed “Live snapshot of tenants…” subtitle.

### Next
1. Deploy (credits fix is live-critical for Insider).
2. `npm run cf:migrate` (remote) if not already.
3. Measure email-found % on live Firecrawl runs.
4. Optional dogfood non-admin account for Search/Pipeline.
5. Human: `git filter-repo` purge of deleted LEADS xlsx from history.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
