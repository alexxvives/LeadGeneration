# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-09-13 (Phone chrome follow-up)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Migrations:** 0021–**0036** applied on prod D1 (`lodestar-prod`).  
**Deploy:** push to master for CI / Workers deploy; run `npm run cf:migrate`
in the same release window as any schema-dependent code.

### This pass
- Phone Leads: one-row toolbar (search icon, layout+stage menu, Export, Add).
- Pipeline / Calendar: “Search leads…” is an icon below `lg` (lg+ unchanged).
- Phone Pipeline tabs wrap so Closed / Not interested are not swipe-clipped.
- Quota ≥80% (metered) or 402 → existing toast + Settings badge. No header
  UsageBar. Demo/unmetered stays quiet.
- Overlay nav is a fade-scroller; Settings stays pinned above the profile card.
- Earlier today: PWA home-screen icons + Contacts relabeled Collaborators
  under Engage (`?view=contacts` unchanged).

### Next
1. Hard-refresh on a phone: Leads compact toolbar, Pipeline tabs + search icon,
   overlay Settings still pinned (Admin accounts).
2. Confirm desktop Leads toolbar and Pipeline drag are unchanged.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
