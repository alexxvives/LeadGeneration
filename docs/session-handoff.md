# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-09-23 (agent close-the-loop)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Migrations:** 0021–**0040** applied on prod D1. No new migration this pass.  
**Deploy:** Local until `cf:build` + `wrangler deploy`. Prod still uses the old touch rule until then. This pass did not deploy.

### This pass
- Always-on Cursor rule [`.cursor/rules/close-the-loop.mdc`](../.cursor/rules/close-the-loop.mdc): read constitution + session-handoff, prove with tsc/lint/smoke, click UI in **cursor-ide-browser**, write memory, commit + push. No product behavior change.
- `AGENTS.md` now has a short **How an agent ships** index to that rule and the UI/QA skills (`lodestar-ui`, `dogfood`, `accessibility`, `adr-skill`).

### Next
1. `npm run cf:build` then `$env:OPEN_NEXT_DEPLOY='true'; npx wrangler deploy` so prod matches the step list and the 2026-09-23 touch rule.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
