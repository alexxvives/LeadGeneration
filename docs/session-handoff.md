# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-09-13 (Phone top bar + locations)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Migrations:** 0021–**0036** applied on prod D1 (`lodestar-prod`).  
**Deploy:** push to master for CI / Workers deploy; run `npm run cf:migrate`
in the same release window as any schema-dependent code.

### This pass
- Conversations: follow-up tag bottom-right; `shortLocation` drops
  venue/floor (Teknon / 1er pis → city only).
- Phone top bar: search icon (not board). Board picker in the overlay.
  Live = pulse-dot next to the title (tap to take control).
- Phone Pipeline: scrolling stage tabs, no on-card Move select.
- Collaborators: removed the empty “Select a collaborator…” pane.

### Next
1. Hard-refresh on a phone: top-bar search, overlay board, live dot.
2. Confirm conversation locations show city/country only.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
