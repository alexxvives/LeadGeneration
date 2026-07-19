# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-07-19 (studio UX + sharing)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Deployed:** (redeploy after this pass for D1 migrations 0019–0020)

### This pass
- Theme: light palette **studio-only** (`/app`); toggle top-right; marketing dark.
- Leads: shared pipeline filter (table/cards/map); Notes always on; Pipeline
  header sort/filter menu; Columns button removed.
- `companyType` on leads + Excel aliases + keyword suggest; drawer Google
  search plan-B when no website.
- Board invite/accept + soft lock (ADR 0015). Migrations `0019`, `0020`.

### Next
1. `npm run cf:migrate` then redeploy Worker so prod gets company_type + sharing tables.
2. Smoke: invite a second user to a board; confirm soft-lock banner + 423 on edit.
3. Optional: email delivery for invites; Firecrawl/LLM company-type extract.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
