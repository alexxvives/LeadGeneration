# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-07-15 (Google mailbox connect)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Policy:** commit + `git push` after every meaningful batch (user request).

### This pass
- **Pro path live locally:** Connect Google OAuth (ADR 0010) — start/callback
  APIs, encrypted refresh token on workspace, Gmail send behind `sendEmail()`,
  warmup self-report on connect. Microsoft = soon.
- Easy Resend path unchanged (DNS at any registrar incl. Hostinger/GoDaddy).
- Migration `0008_connected_mailbox.sql` — apply on CF before prod use.

### Next
1. Put `GMAIL_OAUTH_*` as Wrangler secrets + run `cf:migrate` → Connect Google in prod.
2. Soft-cap warning popup on send when over recommend.
3. Microsoft Graph Mail.Send (same seam).

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
