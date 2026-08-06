# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-08-07 (per-board verify + register flash + type menu)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Migrations:** 0021–**0029** remote applied; **0030** needs apply + deploy.  
**Note:** Deploy needed for this pass.

### This pass
- Fixed Contacted “register” flash: merge no longer lets empty `contactMethods`
  wipe cached methods; sent rows skip the nag.
- Outreach type filter: custom glass menu (not native select).
- Verify-before-send is **per board** (ADR 0025 / migration 0030). Settings
  switch UI unchanged — targets active sidebar board; Boards cards have toggles.

### Next
1. `npm run cf:migrate` (0030) + deploy + hard-refresh.
2. Optional later: annual Stripe Price IDs; async search queue; Pro mailbox.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
