# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-07-14 (lead count, drafts, settings dev tools)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Local this pass (not redeployed):** search `maxLeads` (Free ≤10/run), Settings
Developer mode (tour + reset credits), single name field, quieter send-time
compliance, Spanish `Propuesta para…` drafts, Firecrawl badge without /mo plan,
usage bars side-by-side, fit % in drawer, Approve all flush right of New.

### Next for you
1. Try Search lead-count + Regenerate on a lead; Settings → Developer mode.
2. Deploy when ready: `npm run cf:build` then
   `$env:OPEN_NEXT_DEPLOY='true'; npx wrangler deploy`.
3. Product: platform Firecrawl credits on Free vs BYO; Resend connect UX.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
