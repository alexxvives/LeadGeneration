# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-07-19 (onboarding + invite UX)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Local:** onboarding/invite/fit/template polish; `tsc` + `lint` green.
**Migrations:** 0021–0024 applied locally; **remote D1 not yet** (`npm run cf:migrate`).

### This pass
- New signup forces product tour (`hermes_force_tutorial`); tour done is per-user.
- Pending board invites: redirect to Boards after login/tour; dashed invite cards.
- Pipeline cards show fit score; empty template preview placeholder; language
  auto-slot on blur; shortened Maileroo/Resend hints.

### Next
1. `npm run cf:migrate` (remote) then deploy Worker.
2. Human: `git filter-repo` purge of deleted LEADS xlsx from history.
3. Optional: Queues/DO for search >50 (TODO in config); soft-lock banner.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
