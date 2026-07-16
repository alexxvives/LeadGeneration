# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-07-16 (Zeruh toggle + outreach UX)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Policy:** commit + `git push` after every meaningful batch (user request).

### This pass
- Removed Maileroo “Domain DNS…” blurb; Easy path has Zeruh **verify emails**
  toggle + credits bar (Leads/Sends/Verifies). Migration `0014_email_verify_enabled`.
- Pitch preview `<br>` fix; AI personalize moved under preview; “No draft yet”
  removed; Runs is informational only; active profile shown on Search/Outreach.
- Drafts sync to Search’s selected profile (`setActiveOutreachProfile`).

### Next
1. Apply D1 migration `0014` on prod (`npm run cf:migrate`) before deploy.
2. Soft-cap warning popup on send; Microsoft Graph Mail.Send.
3. Confirm `MAILEROO_VERIFY_API_KEY` in prod Wrangler secrets.
4. Deploy when user asks.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
