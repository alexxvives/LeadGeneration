# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-10-18 (onboarding tree)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Migrations:** none this pass. Checklist lives in `customFields.__onboarding`. Not deployed.

### This pass
- Pipeline focus toggle gains **Onboarding**. It lists leads in Onboarding or Reviewing contract and a Path A / Path B checkbox tree.

### Next
1. Deploy when asked.
2. Confirm Avante Oposiciones shows on AKADEMO after a hard refresh.
3. Re-send the reset LUMIA queue from Outreach.

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Version:** `b81cb596-534c-4c1e-84e0-56f4b08103cd`  
**Migrations:** 0021–**0040** applied on prod D1. No new migration this pass.

### This pass
- Ctrl+Z in Email body template failed because placeholder tint rewrote the editor DOM on each key. Tint is now on blur/load only. Not deployed.

### Next
1. Deploy when asked so production Settings gets Ctrl+Z.
2. Confirm Avante Oposiciones shows on AKADEMO after a hard refresh.
3. Re-send the reset LUMIA queue from Outreach. The drawer may still show an older “Email sent” note.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
