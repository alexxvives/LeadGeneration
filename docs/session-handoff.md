# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-07-16 (pitch editor + draft freshness)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Policy:** commit + `git push` after every meaningful batch (user request).

### This pass
- Pitch editor: strip paste styles, Clear formatting, preserve line breaks;
  no “Template text · placeholders OK”; unified placeholder ? help.
- Drafts always use latest profile body (no stale run.offerNotes fallback);
  Create drafts then opens composer; Profile 1 naming; AI toggle restyle.
- Body↔sign-off single break; company shortens before “. ” subtitle.

### Next
1. Point Maileroo/Resend dashboards at the webhook URL in Settings → Easy.
2. Soft-cap warning popup on send; Microsoft Graph Mail.Send.
3. Confirm `MAILEROO_VERIFY_API_KEY` in prod Wrangler secrets.
4. Deploy this batch when user asks.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
