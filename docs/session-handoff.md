# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-09-15 (studio hygiene)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Migrations:** 0021–**0037** applied on prod D1 (`lodestar-prod`).  
**Deploy:** push to master for CI / Workers deploy.

### This pass
- Invalid/placeholder To addresses (`your@email`) are stripped, not sent.
- Conversation location drops `(despatx …, Planta 0.)` leftovers.
- Notes show author initials; collaborator journal matches lead notes.
- Done follow-ups hide the card chip (click the purple tag to complete).
- Collaborator cards pack content top-left.

### Next
1. Hard-refresh: send a lead with a junk To — address should disappear.
2. Conversation card for Teknon-style addresses should show **Barcelona**.
3. Complete a follow-up from notes; Pipeline/Conversations chips should go.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
