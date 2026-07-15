# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-07-15 (send hygiene + Maileroo webhooks)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Policy:** commit + `git push` after every meaningful batch (user request).

### This pass
- Delivery UI: dropped Resend-only webhook hint.
- **Maileroo webhooks:** `POST /api/webhooks/maileroo` + tags on send; optional
  `MAILEROO_WEBHOOK_SECRET`.
- Send strips legacy “Sent by / unsubscribe mailto / placeholder” footers baked
  into old drafts; new footer is STOP (+ real US address only).
- Drafts: Settings sign-off + offer passed on regenerate; less template-y copy;
  junk nav blurbs rejected.
- Pitch generate: heuristic fallback when Workers AI fails; clearer fetch errors.

### Next
1. Redeploy Workers (AI binding + webhook route live).
2. Point Maileroo Dashboard webhook at `/api/webhooks/maileroo`.
3. Confirm Wrangler `NEXTAUTH_URL` = live Workers URL (Connect Google).
4. Soft-cap warning popup on send; Maileroo live DNS panel.
5. Microsoft Graph Mail.Send.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
