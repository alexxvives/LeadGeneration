# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-10-03 (Akademo wave 2 review list)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Migrations:** 0021–**0040** applied on prod D1. No new migration this pass.  
**Deploy:** Not deployed. Prod studio chrome is still the previous build.

### This pass
- Research-only CSV for review, not imported: `docs/leads/akademo-wave2-500.csv` (492 rows). Oposiciones 125, Idiomas 150, FP 93, Colegios y centros 124.
- Nothing was written to the AKADEMO board and no email was sent. FP stayed under 100 because later hits were national chains, government portals, or presencial-only.
- Wave 1 (40 rows) is `akademo-new-leads.csv` in the repo root.

### Next
1. Review `docs/leads/akademo-wave2-500.csv`, then import it with wave 1 onto the AKADEMO board only if the rows still look right.
2. `npm run cf:build` then `$env:OPEN_NEXT_DEPLOY='true'; npx wrangler deploy` so prod matches the step list, touch rule, and studio chrome.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
