# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-07-19 (studio space + marketing sign-in)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Deployed:** D1 migrations `0019` + `0020` on prod. Redeploy for latest UI.

### This pass
- Search: removed monthly lead-credits leftover copy.
- Studio wider (`max-w-[90rem]`, tighter gutters); Leads Contact → icon+counts
  below `xl`; info drawer title wraps (no pencil); outreach row dividers fixed.
- Boards: Invite top-right; Create Board modal (not `prompt`); invite mail via
  platform Resend → Maileroo (`MAILEROO_API_KEY`) → SMTP.
- Marketing Sign in = dismissible overlay (not only `/login`); JWT overwrites
  email on account switch (admin ↔ personal).

### Next
1. Redeploy; set verified `OUTREACH_FROM_EMAIL` (+ optional `MAILEROO_API_KEY`)
   so board-invite mail reaches arbitrary addresses (not only Resend onboarding).
2. Soft-lock banner + 423 on concurrent edit.
3. Optional: Firecrawl/LLM company-type extract.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
