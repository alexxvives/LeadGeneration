# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-08-07 (Draft all + pipeline card polish)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Migrations:** 0021–**0030** remote applied.

### This pass
- **Draft all** no longer auto-approves — drafts stay in Contact Draft until
  Approve (reverts 2026-08-04 Ready shortcut).
- Pipeline cards: removed per-card stage `<select>`; tags (follow-up / bounced /
  methods / replied) sit on the same row as FitMeter (cards stay shorter).
- Map pin geocode prefetch runs on **any** studio page (not only Pipeline/Leads
  / Map on screen).
- Contact actor → Notes (`Email sent by …`), not a pipeline card tag.
- Soft daily send-cap alert once per day (not on every send after the cap).

### Next
1. Deploy + hard-refresh to pick up UI/flow fixes.
2. Optional later: annual Stripe Price IDs; async search queue; Pro mailbox.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
