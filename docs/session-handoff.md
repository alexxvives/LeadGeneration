# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-09-13 (Wide layout + phone chrome)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Migrations:** 0021–**0036** applied on prod D1 (`lodestar-prod`).  
**Deploy:** push to master for CI / Workers deploy; run `npm run cf:migrate`
in the same release window as any schema-dependent code.

### This pass
- Studio fills the pane (no 90rem cap). Header usage meters removed.
- Phone: Settings + sign-out in overlay (not top-bar gear). Pipeline hint
  is “move to change stage”; compact on-card stage select. Calendar cells
  no longer overflow on 390px. Studio default theme is light.

### Next
1. Hard-refresh on a phone (or 390px): overlay Settings, Pipeline move,
   Calendar month + day list.
2. Confirm ultrawide Pipeline columns stretch and kanban drag still works.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
