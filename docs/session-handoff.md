# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-07-19 (logo/search/boards + account switch)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Deployed:** D1 migrations `0019` + `0020` on prod. Redeploy for latest UI/auth.

### This pass
- BrandMark: `mail` same size/family as `HERMES` (aurora color only).
- Search: Standard also ranks by fit; Smart copy includes ~3× credits; Best for
  trimmed; credits line shown under strategy blurb.
- Boards: delete control outside card (top-right); stats = Leads row +
  Contacted/Sent/Closed row; Invite keeps header space.
- Auth: hard `location.assign` after credentials sign-in; JWT clears prior
  workspace and always overwrites email/name on account switch.

### Next
1. Redeploy; set verified `OUTREACH_FROM_EMAIL` (+ optional `MAILEROO_API_KEY`)
   so board-invite mail reaches arbitrary addresses (not only Resend onboarding).
2. Soft-lock banner + 423 on concurrent edit.
3. Optional: Firecrawl/LLM company-type extract.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
