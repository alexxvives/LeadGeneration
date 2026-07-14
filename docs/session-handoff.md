# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still go in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-07-14

**Stage:** MVP complete; **commercialization Phase 0 done** (D1 repository swap;
Supabase removed). Awaiting review before Phase 1.

**Works today:** full Search → Enrich → Draft → Approve → Send flow, demo mode
with zero keys, per-lead approval + rate limiting. Persistence now selects
between the JSON file store (default/offline) and Supabase (when configured) via
`config.ts::databaseProvider()` — **no user-visible change**.

**Live keys configured** (in `.env.local`, not committed): Firecrawl, Exa.
Email defaults to demo unless Resend/SMTP set. Supabase not yet configured →
still on JSON store.

### Recently done
- **Commercialization Phase 0 — D1 repository swap** (no user-visible change):
  `D1Store` (`src/lib/db/d1-store.ts`) behind `LeadRepository`; `getDb(binding?)`
  returns D1Store when a Cloudflare D1 binding is passed (Workers runtime) else
  JsonStore (local/demo). SQLite migration at `migrations/0001_init.sql`
  (arrays → JSON TEXT; Wrangler format). Supabase fully removed (`@supabase/supabase-js`
  uninstalled, `supabase/` dir deleted). Auth strategy switched to **Auth.js**
  (wired in Phase 1). ADRs [0003](decisions/0003-supabase-auth-and-db.md) (superseded),
  [0004](decisions/0004-cloudflare-opennext-deploy.md),
  [0005](decisions/0005-switch-to-d1-auth-js.md). Verified: `tsc` clean, `lint`
  clean, `npm run smoke` 11/11 on JSON path. Repo live at
  https://github.com/alexxvives/LeadGeneration.
- **Search "mode" toggle** — `standard` / `smart` / `local` strategies
  (`src/lib/search/query.ts` + `runSearch`). Smart/local expand + merge + rank.
- **Deliverability guide** added to landing page (`/` → #domain section) — 6-step
  "how to not get your domain banned" content marketing section.
- **v0 MCP** added to `~/.cursor/mcp.json` (needs `V0_API_KEY` from v0.dev/account).
  21st.dev credits exhausted (100/month free limit) — v0 is now the primary UI
  generation tool. 21st.dev key kept for unlimited logo search.
- **Project skill** created: `.cursor/skills/lodestar-ui/SKILL.md` — full brand
  design system reference (tokens, patterns, anti-patterns) auto-loaded by agents.

### In flight / decisions pending
- **Commercialization** — plan in `docs/commercialization.md`. **Phase 0 done**
  (see above); **Phase 1 (Auth + workspaces + RLS) not started** — awaiting
  review + Supabase project setup. Locked choices: Supabase (auth+DB), Stripe
  (billing), workspaces (multi-tenancy), Cloudflare/OpenNext deploy, phased build.
- **D1 live verification** — D1Store is implemented and type-checked; actual D1
  binding is injected at Workers deploy time. Full live verification happens when
  the Cloudflare deploy phase (Phase 4/later) runs `wrangler d1 migrations apply`
  and wires `getRequestContext().env.DB` into the API routes.
- **Email deliverability** — use a dedicated warmed sending domain for cold
  outreach; do NOT use Postmark/transactional ESPs for cold. See
  `docs/email-providers.md`.

### Known issues / gotchas
- **21st.dev Magic MCP** — credits exhausted on free tier (100/month). Now using
  v0 MCP instead. To re-enable 21st.dev generation: upgrade at 21st.dev/pricing
  ($20/mo Pro). Logo search still works (unlimited, no credits used).
- **v0 MCP** — needs `V0_API_KEY` in `~/.cursor/mcp.json`. Get from v0.dev/account.
- PowerShell shell: `&&` is not a valid separator — chain with `;`.
- Node 24 type-strips TS scripts; `@/…` aliases don't resolve in `scripts/*`.

### Next likely steps
1. **Review Phase 0**, then start **Phase 1 — Auth.js + workspaces**
   (`docs/commercialization.md`). RLS is not used (D1/SQLite); workspace
   isolation is enforced in the service layer.
2. Search quality Tier 1: structured extraction + email verification
   (`docs/search-and-enrichment.md`).

---

## How to update this file
At the end of a session that changed state, rewrite the **Status** block:
bump the date, move finished items to "Recently done", refresh "In flight",
"Known issues", and "Next likely steps". Delete stale bullets — this is a
snapshot, not a changelog (that's `LEARNINGS.md`).
