# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-10-03 (Akademo leads imported)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Migrations:** 0021–**0040** applied on prod D1. No new migration this pass.  
**Deploy:** Not deployed. Prod studio chrome is still the previous build.

### This pass
- Imported **513** new leads onto the AKADEMO board (`board_f56f7ebb891648d9a4e3`). Board is now **917**. Import run `run_ff46f5ae76b44bbe9d4c`. No email was sent; every new row is status `new`.
- Sources: wave 1 `akademo-new-leads.csv` (40) and `docs/leads/akademo-wave2-500.csv` (492). Mix on the board from this import: Idiomas 161, Oposiciones 133, Colegios y centros 129, FP 90.
- Left off the board: Instituto Europeo (already there). 18 rows that were city halls, public-school inboxes (`educa.madrid.org`, `educa.jcyl.es`, `xtec.cat`, `murciaeduca.es`, `edu.xunta.es`), or pages whose only “phone” was opening hours.
- Agency lead usage this month is 513 of 2,000.

### Next
1. Review the new AKADEMO rows and send one lead at a time.
2. `npm run cf:build` then `$env:OPEN_NEXT_DEPLOY='true'; npx wrangler deploy` so prod matches the step list, touch rule, and studio chrome.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
