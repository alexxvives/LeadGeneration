# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-07-15 (push + Leads UX + send roadmap)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Policy:** commit + `git push` after every meaningful batch (user request).

### This pass
- Leads header: true center grid — title | Export+Table/Cards/Map | usage bars.
- Lead table: `max-h-[calc(100dvh-11rem)]` + sticky header; page doesn’t scroll,
  table body does.
- Prior: Outreach/Pipeline full-height columns; Pipeline whole-card drag + ⓘ.
- Plan: [`docs/roadmap-send-paths.md`](roadmap-send-paths.md) — Easy Resend vs
  Pro Google/Microsoft; OSS backlog; gstack/SKILL.md notes.

### Next
1. Deploy CF so production Leads matches local.
2. P0 from send roadmap: Easy-path Settings wizard + DNS poll hero.
3. ADR before building mailbox OAuth.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
