# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-07-22 (outreach UX + settings persist)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Local:** admin ops chrome; Insider invites; account delete (live only).
**Migrations:** 0021–**0025** local **and remote** (`find_leads_enabled` applied).

### This pass
- Outreach: CRM past New → Contacted bucket; phone-only Ready + note prompt;
  Create uses lead-country language; empty pipeline/outreach show columns.
- Settings: fix pitch/flag save race (hydrate vs local write) + autosave.
- Leads: Type read-only in table; default sort = import/`created_at`; nicer
  delete progress; no Load demo on empty board.
- Prior: map drawer z-index; import name-only dedupe.

### Next
1. Deploy; hard-refresh; re-import LEADS onto LUMIA if still missing rows.
2. Verify a sending domain in Resend; set `OUTREACH_FROM_EMAIL` on Worker.
3. Measure email-found % on live Firecrawl runs.
4. Optional: ADR 0020 path A (cheap LLM extract) if quality/COGS need it.
5. Human: `git filter-repo` purge of deleted LEADS xlsx from history.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
