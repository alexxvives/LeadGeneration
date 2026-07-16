# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-07-15 (profiles + verify Q&A)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Policy:** commit + `git push` after every meaningful batch (user request).

### This pass
- **Verify vs send:** bounce check = Zeruh (`MAILEROO_VERIFY_API_KEY` / alias
  `ZERUH_API_KEY`) on enrich + before send — works regardless of Resend/Gmail
  send path. Get key: Maileroo dashboard → Email Verification / Zeruh SSO, or
  zeruh.com → API key → `.env.local` + Wrangler secret.
- **Outreach profiles:** multi-profile list; pitch versions per language; search
  profile picker (or none → Review without draft). Flag PNGs (not emoji GB/ES).
- Saved flash inline; blur-save only when dirty; Easy 3-step copy removed;
  outreach row click opens info; Excel = Table + conditional formatting + dropdowns.

### Next
1. Point Maileroo Dashboard webhook at `/api/webhooks/maileroo`.
2. Soft-cap warning popup on send; Microsoft Graph Mail.Send.
3. Optional: AI-assist translate when adding a missing pitch language version.
4. Confirm `MAILEROO_VERIFY_API_KEY` in prod Wrangler secrets.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
