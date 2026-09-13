# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-09-13 (DatePicker z-index + drawer polish)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Migrations:** 0021–**0037** — run `npm run cf:migrate` for **0037**
(`lead_documents`) in the same release window as this deploy.  
**Deploy:** push to master for CI / Workers deploy.

### This pass
- Collaborator cards: no avatar circle.
- Calendar day marks larger (icons + counts on phone too).
- Conversation cards: **Follow-up** (not “Follow-up needed”).
- Skeletons match chrome (phone vs desktop; Conversations/Collaborators cards).
- Live lock copy only on the Live chip / phone pulse-dot — not page body.
- Sales-stage chips scroll horizontally on phone.
- **Waiting on us** on → opens Follow-up composer.
- About sits in the lead-info column.
- Closed leads: drag-and-drop **Documents** (ADR 0038, 4 MB).
- **DatePicker:** popover was `z-[80]` under drawers (`z-[1100]`) — month
  opened but stayed invisible. Now `z-[1200]`; Escape closes the picker
  only. Calendar month/year menus are portaled the same way.

### Next
1. `npm run cf:migrate` on prod D1 before relying on documents.
2. Hard-refresh: open a lead note date — month should sit above the drawer.
3. Calendar view: month and year menus should list options.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
