# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-07-19 (password cookie swap)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Deployed:** Redeploy required — `/api/auth/password` session cookie rewrite.

### This pass
- Auth: `POST /api/auth/password` clears chunked Auth.js cookies and sets a new
  JWT (bypasses broken client signIn/signOut account switch on Workers).

### Next
1. Redeploy (required for admin login).
2. Verified `OUTREACH_FROM_EMAIL` (+ optional `MAILEROO_API_KEY`) for invites.
3. Soft-lock banner + 423 on concurrent edit.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
