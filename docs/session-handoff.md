# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-07-21 (pre-ship fixes: import/403/credits/stripe)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Local:** admin ops chrome; Insider invites; account delete (live only).
**Migrations:** 0021–**0025** local; **remote D1 needs `npm run cf:migrate`** (incl. `find_leads_enabled`).

### This pass
- Find leads off: Search form blocked; **Import stays** on Search view (no redirect).
- Disabled Find leads → **403** on `POST /api/runs` (`ForbiddenError`).
- Insider: no invented credit fallback — null FC → “unavailable” + **402**.
- Account delete: best-effort Stripe cancel; cascade tokens/invites; admin typed `DELETE`.
- Admin Settings: no Danger zone. Admin Users: Insider pool display, toggle busy/toast, trash a11y.

### Next
1. `npm run cf:migrate` (remote) then deploy.
2. Measure email-found % on live Firecrawl runs.
3. Optional dogfood non-admin account for Search/Pipeline.
4. Human: `git filter-repo` purge of deleted LEADS xlsx from history.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
