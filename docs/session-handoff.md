# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-08-05 (per-profile Sending identity)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Migrations:** 0021–**0027** (0027 = `profile_send_settings_json` — apply local + remote).

### This pass
- Easy Sending identity (From + Resend/Maileroo/SMTP keys) is **per outreach
  profile** (ADR 0021). Active profile drives send/test-send. Pro mailbox
  still workspace-scoped. Settings Sending reloads on profile switch.
- Earlier: Resend bounce tags fix; Draft all → Ready.

### Next
1. `npm run cf:migrate` (+ `:local`) for 0027; deploy (`cf:build` then `cf:deploy`).
2. Hard-refresh Settings — switch profiles and confirm From/keys differ.
3. User may delete the accidental duplicate empty board.
4. Human: `git filter-repo` purge of deleted LEADS xlsx from history.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
