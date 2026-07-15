# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-07-15 (Settings save fix pass)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Policy:** commit + `git push` after every meaningful batch (user request).

### This pass
- Fixed Settings “Saved but gone”: fail-closed `getCtx`, no silent null updates,
  dirty-only key PATCH, keys never SSR’d (`hasResendKey` / `hasMailerooKey`).
- `preferredSendPath` (Easy vs Pro) + migration 0010; demo send no longer advances
  CRM when metered; magic-link only claims success on real `signIn`.
- NEXTAUTH_URL localhost guard in Pro Settings.

### Next
1. Confirm Wrangler `NEXTAUTH_URL` = live Workers URL (Connect Google).
2. Soft-cap warning popup on send; Maileroo live DNS panel.
3. Perf follow-up: board `listOutreach` N+1, import full-lead scan (deferred).
4. Microsoft Graph Mail.Send.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
