# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-09-13 (Studio chrome polish)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Migrations:** 0021–**0036** applied on prod D1 (`lodestar-prod`).  
**Deploy:** push to master for CI / Workers deploy; run `npm run cf:migrate`
in the same release window as any schema-dependent code.

### This pass
- Conversations: hourglass (not sparkle) + demo icon on the title row;
  location tight under the name; phone cards no longer force X-scroll.
- Calendar month/year + note dates are branded dropdowns (`DatePicker`).
- Phone: no view subtitles. Live is a full-width Take bar. Add
  collaborator sits with the title (Create-board pattern).

### Next
1. Phone: Conversations cards stay in-pane; Live bar + Add collaborator
   align with the top bar.
2. Calendar: month/year menus and follow-up DatePicker match studio glass.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
