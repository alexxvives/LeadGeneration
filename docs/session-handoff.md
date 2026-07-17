# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-07-17 (MEV verify + draft/warmup)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Policy:** commit + `git push` after every meaningful batch (user request).

### This pass
- MyEmailVerifier wired as preferred verify + credits UI (`MYEMAILVERIFIER_API_KEY`).
- Mailbox age picker under From email; soft-cap timer auto-advances bands.
- Draft dirty = real field diffs only; PitchEditor no longer fights Ready edits.
- Clearer Maileroo “X-API-Key” error when a verify key is pasted as send key.

### Next
1. Deploy so prod uses MEV (secret already set) + restart local after `.env.local`.
2. Confirm Verifies bar shows credits (phone-verify MEV account if 0).
3. If send still fails with X-API-Key: fix Maileroo **Sending** key in Settings.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
