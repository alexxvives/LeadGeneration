# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still live in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-07-15 (leads UX + import + secrets)

**Live:** https://leadgeneration.alexxvives.workers.dev  
**Policy:** commit + `git push` after every meaningful batch (user request).

### This pass
- Pitch generate shows which AI wrote it (Workers AI / Groq / Gemini).
- Leads UX: centered table/cards/map; map pin count top-right + legend bottom;
  info drawer ~wider with Notes column on the right; Export stays by title.
- Outreach: dropped Needs draft (search/import auto-draft); Sent column kept;
  equal-height Edit/✓/→ actions; draft popup has Save draft + Approve label.
- Pipeline: unknown contact method highlights the ⓘ icon only.
- Excel import: Opportunity column, hyperlink websites, formula phones, short
  locations; navigates to Leads after import.
- **Cloudflare secrets gap:** `wrangler secret list` currently only has
  AUTH_SECRET, NEXTAUTH_URL, RESEND_API_KEY, FIRECRAWL_API_KEY. Gmail / Groq /
  Gemini are missing — restore via `docs/cloudflare-secrets.md` (deploy does
  not wipe secrets; something else deleted them).

### Next
1. User: re-`wrangler secret put` for GMAIL_* + GROQ + GEMINI; then commit/deploy.
2. Point Maileroo Dashboard webhook at `/api/webhooks/maileroo`.
3. Soft-cap warning popup on send; Maileroo live DNS panel.
4. Microsoft Graph Mail.Send.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
