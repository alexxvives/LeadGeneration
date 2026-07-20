# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-07-19 (admin UX polish)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Local:** admin UI + unmetered admin + audit 1–17; `tsc` + `lint` green.
**Migrations:** 0021–0024 applied locally; **remote D1 not yet** (`npm run cf:migrate`).

### This pass
- Admin Platform/Users: account filter (`select-ink`), `input-ink` search field;
  removed Platform “Admin” eyebrow + “View all users” pill; Studio header titles
  for admin views (no more Search bleed-through).
- Admin excluded from tracked Users/overview counts (`users.is_admin`).
- Admin unmetered (`getCtx` metered=false) + usage bars hidden in Studio.
- Clarified `BOOTSTRAP_ADMIN_PASSWORD` is first-boot only — not needed once an
  admin row exists (may delete Wrangler secret).

### Next
1. `npm run cf:migrate` (remote) then deploy Worker.
2. Human: `git filter-repo` purge of deleted LEADS xlsx from history.
3. Optional: Queues/DO for search >50 (TODO in config); soft-lock banner.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
