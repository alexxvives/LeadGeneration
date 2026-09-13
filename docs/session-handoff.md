# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-09-13 (PWA icon + Collaborators)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Migrations:** 0021–**0036** applied on prod D1 (`lodestar-prod`).  
**Deploy:** push to master for CI / Workers deploy; run `npm run cf:migrate`
in the same release window as any schema-dependent code.

### This pass
- Home-screen web app: `favicon.ico`, `apple-touch-icon.png`,
  `public/icons/icon-{192,512}.png`, `public/manifest.webmanifest`.
  Install name is **Hermes mail**.
- Contacts tab moved to Engage and labeled **Collaborators**
  (`?view=contacts` unchanged).

### Next
1. On a phone: Add to Home Screen and confirm the wings icon + “Hermes mail”.
2. Confirm Collaborators sits under Engage in sidebar and overlay.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
