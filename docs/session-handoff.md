# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-07-21 (admin ops + Firecrawl credits + UI)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Local:** admin-only nav; Insider invite links; light-mode toggles; marketing contrast.
**Migrations:** 0021–0024 applied locally; **remote D1 not yet** (`npm run cf:migrate`).

### This pass
- Firecrawl: contact links from markdown → `/contacto`/`/contact` only (no JSON extract).
- Admin: Dashboard = platform overview; Users + Insider signup link; no studio product nav.
- Settings: Resources under Plan & usage; light-mode switch + profile buttons.
- Marketing readability (landing, how-it-works, ethics, deliverability).
- Prospeo deferred; keep MyEmailVerifier (cheaper free tier than switching).

### Next
1. Deploy after `npm run cf:migrate` (remote) if needed.
2. Measure email-found % on live Firecrawl runs.
3. Optional: dogfood account (non-admin) for Search/Pipeline testing.
4. Human: `git filter-repo` purge of deleted LEADS xlsx from history.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
