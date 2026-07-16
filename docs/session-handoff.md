# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-07-16 (draft UX + verify key)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Policy:** commit + `git push` after every meaningful batch (user request).

### This pass
- Pitch preview linebreak fix (contenteditable text + `<div>` lines).
- Sidebar **Outreach profile** dropdown (like Board); removed banner.
- Drafts use active profile’s primary (`en`) pitch — not stale location `es`.
- Contact Draft: unapproved stays; button `Create` → `Review`; Ready = approved.
- Docs: `MAILEROO_VERIFY_API_KEY` on Wrangler secrets checklist.

### Next
1. Apply D1 migration `0014` on prod if not done (`npm run cf:migrate`).
2. Soft-cap warning popup on send; Microsoft Graph Mail.Send.
3. Deploy when user asks (`MAILEROO_VERIFY_API_KEY` is now on the Worker).

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
