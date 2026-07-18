# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-07-18 (auto Resend webhooks + M1)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Policy:** commit + `git push` after every meaningful batch (user request).

### This pass
- Resend BYO: auto-register delivery webhook when user saves API key
  (migration `0016_resend_webhook.sql`) — no per-user Resend dashboard setup.
- M1 layering: `draft-preview` + `format-location`; Settings copy updated.

### Next
1. `npm run cf:migrate` (0016) + deploy this branch.
2. Existing customers: re-save Resend key once to register the webhook.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
