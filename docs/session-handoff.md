# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-09-13 (Prod D1 0036 applied)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Migrations:** 0021–**0036** applied on prod D1 (`lodestar-prod`).  
**Deploy:** push to master for CI / Workers deploy; run `npm run cf:migrate`
in the same release window as any schema-dependent code.

### This pass
- Applied remote migration **0036** (`contacts` table + `leads.waiting_on_us`
  / `leads.demo_done`). That was the cause of live 500s on `/api/board` and
  `/api/contacts` after the Conversation CRM deploy.

### Next
1. Hard-refresh studio — board + Contacts should load again.
2. Spot-check Conversations flags, Contacts page, Calendar contact events.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
