# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-07-15 (leads/map/outreach polish + pitch prompt)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Policy:** commit + `git push` after every meaningful batch (user request).

### This pass
- Leads: Export Excel next to title; table/cards/map toggle on the count row;
  map fills viewport height; discarded off the map; New pins mist-gray again.
- Outreach: Sent is a full-height column beside Ready to send (4 columns).
- Pitch “Generate from website”: stronger prompt + page-language detection
  (fixes bilingual tagline regurgitation like akademo-edu.com).

### Next
1. Commit + deploy so live Workers picks up UI + pitch prompt.
2. Point Maileroo Dashboard webhook at `/api/webhooks/maileroo`.
3. Confirm Wrangler `NEXTAUTH_URL` = live Workers URL (Connect Google).
4. Soft-cap warning popup on send; Maileroo live DNS panel.
5. Microsoft Graph Mail.Send.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
