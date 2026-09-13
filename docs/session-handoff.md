# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-09-13 (Conversation CRM upgrades)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Migrations:** 0021–**0036** (0036 = waiting/demo flags + `contacts` table).  
**Deploy:** push to master for CI / Workers deploy; run `npm run cf:migrate` so
prod D1 gets 0036.

### This pass
- Contact channels: WhatsApp + Organic / web.
- In-conversation: waiting-on-us star + demo-done toggles.
- `?view=conversations` card grid; notes newest-first.
- Board-scoped Contacts page; follow-ups on Calendar (ADR 0036).
- Bounce chip / toast / drawer button removed (silent email strip stays).

### Next
1. Apply D1 migration **0036** on prod (`npm run cf:migrate`).
2. Hard-refresh studio: Conversations, Contacts, Calendar contact events,
   WhatsApp/organic chips, no Bounced chip.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
