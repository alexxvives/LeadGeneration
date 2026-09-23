# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-09-23 (Conversation steps + email-note dedupe)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Migrations:** 0021–**0040** (0040 is local until `cf:migrate` on prod).  
**Deploy:** Worker `33141cd5` still live; this pass is local until `cf:build` + `wrangler deploy`.

### This pass
- Pipeline title toggle: Stages vs In conversation buckets (Evaluating → Pending delivery, plus automatic Unresponsive).
- Conversations cards: step mark instead of Demo done; Follow-up chip removed. Drawer uses a “Where they are” dropdown.
- Duplicate bare “Email sent” notes collapsed on read/merge/write (ADR 0040).

### Next
1. Apply migration 0040 on prod D1 before deploy (`npm run cf:migrate`), then `npm run cf:build` and `$env:OPEN_NEXT_DEPLOY='true'; npx wrangler deploy`.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
