# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-08-18 (Calendar + follow-up notes)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Migrations:** 0021–**0030** remote applied.

### This pass
- Lead drawer **+ Follow-up** saves a dated reminder on the lead (registered in
  `followUps`). Sends and phone logs already journal the same way.
- New studio **Calendar** tab (`?view=calendar`): month grid of follow-ups,
  emails sent, and phone calls. Click an item to open the lead; tick follow-ups
  done.
- `AGENTS.md`: commit **and** `git push` after every change (no waiting to be asked).

### Next
1. Deploy after `tsc`/`lint` green.
2. Optional: wrangler secret delete leftover Gmail / Zeruh keys.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
