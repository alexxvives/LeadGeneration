# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-07-16 (rich pitch + settings polish)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Policy:** commit + `git push` after every meaningful batch (user request).

### This pass
- Pitch **bold/italic/underline/lists** kept through preview, Create Draft, and
  send (HTML + plain fallback for Resend/Maileroo/Gmail/SMTP).
- Settings Easy: From name is inbox identity only (no draft sign-off sync);
  removed “Must match your verified domain”; Maileroo/Resend help copy clarified.
- Sending-key eye no longer clears a saved mask; longer mask; eye disabled on
  saved keys (select + paste to replace).

### Next
1. Point Maileroo/Resend dashboards at the webhook URL in Settings → Easy.
2. Soft-cap warning popup on send; Microsoft Graph Mail.Send.
3. Confirm `MAILEROO_VERIFY_API_KEY` in prod Wrangler secrets.
4. Deploy this batch when user asks.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
