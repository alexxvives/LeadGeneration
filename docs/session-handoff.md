# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-08-24 (Invites never expire)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Migrations:** 0021–**0033** remote applied.

### This pass
- Board invites no longer expire (ADR 0028). LUMIA pending invite to
  `onaparadell@gmail.com` restored in prod D1 (`expires_at` far future)
  so she can Accept on Boards with that Google account.

### Next
1. Deploy Worker so invite TTL removal is live (D1 already unblocks the
   current Worker).
2. Ona: sign in as `onaparadell@gmail.com` → Boards → **Accept invite**.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
