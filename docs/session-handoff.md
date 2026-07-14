# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still go in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-07-14

**Stage:** **Commercial MVP built — Phases 1–4 complete** (Auth.js + workspaces,
plans + usage metering, `/pricing` + Stripe, Cloudflare Workers deploy config).
Code is `tsc`/`lint`/`smoke`-clean and `next build`-clean. **Not yet deployed or
live-verified** — needs a Cloudflare account + real Stripe/Resend keys (see below).

**Works today (local, zero keys):** full Search → Enrich → Draft → Approve → Send
flow in demo mode, per-lead approval + rate limiting — unchanged. Auth + metering
stay OFF until `AUTH_SECRET` is set, so `npm run dev` is always the open demo.

**Live keys configured** (in `.env.local`, not committed): Firecrawl, Exa.
Everything commercial (auth/Stripe/Turnstile/Resend/D1) is **not yet configured**.

### Recently done
- **Commercialization Phases 1–4 (this session)** — full commercial layer:
  - **Auth.js v5 (JWT sessions)** — split config: `src/auth.config.ts` (edge,
    used by middleware) + `src/auth.ts` (D1 adapter + workspace provisioning).
    Credentials provider (any password) for keyless dev; Resend magic-link for
    prod. `src/middleware.ts` protects `/app` + `/api` (with `SMOKE_API_KEY`
    bypass) only when `AUTH_SECRET` is set. ADR 0007.
  - **Workspaces** — `workspaceId` on Run/Lead/Outreach; `getDb(binding?, wsId?)`
    returns a workspace-scoped store; isolation enforced via `Ctx` in
    `service.ts`. Migration `0002`. ADR 0006.
  - **Plans + metering** — `src/lib/plans.ts` (Free/Starter $29/Pro $79/Agency
    $199); usage counters (migration `0003`) reset lazily monthly; `QuotaError`
    → 402. Demo/JSON path always free + unmetered (`metered = !!binding`). ADR 0008.
  - **`/pricing` + Stripe** — checkout, portal, signature-verified webhook;
    upgrade modal on quota hit; plan/usage in `/app/settings`.
  - **Cloudflare deploy** — `@opennextjs/cloudflare`, `wrangler.jsonc` (D1 binding
    `DB`, `database_id` = FILL_IN), `cf:*` scripts, Turnstile on signup (prod only).
  - Verified: `tsc` clean, `lint` clean, `npm run smoke` 11/11 (JSON path),
    `next build` clean (benign `jose`/Edge `CompressionStream` warnings only).
- **Commercialization Phase 0 — D1 repository swap**: `D1Store` behind
  `LeadRepository`; `migrations/0001_init.sql`; Supabase fully removed. ADRs 0003
  (superseded), 0004, 0005. Repo: https://github.com/alexxvives/LeadGeneration.
- **Search "mode" toggle**, **deliverability guide** on landing, **v0 MCP**,
  **`.cursor/skills/lodestar-ui/SKILL.md`** — see git history / LEARNINGS.

### In flight / decisions pending
- **Go live** — code is ready but unconfigured. To deploy: create D1
  (`wrangler d1 create lodestar-prod` → paste `database_id`), apply migrations,
  set Wrangler secrets (AUTH_SECRET, AUTH_RESEND_KEY, STRIPE_*, TURNSTILE_*),
  create Stripe products/prices, point the Stripe webhook at
  `/api/webhooks/stripe`. Full steps in README → "Deploy to Cloudflare".
- **Live verification pending** — auth-enforced flows, Stripe checkout/webhook,
  Turnstile, and real D1 queries are type-checked + build-clean but not exercised
  with live credentials.
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
1. **Deploy + live-verify** — fill Cloudflare/Stripe/Resend keys, deploy, and
   walk the auth → checkout → webhook → quota path end-to-end (README Deploy).
2. Search quality Tier 1: structured extraction + email verification
   (`docs/search-and-enrichment.md`).

---

## How to update this file
At the end of a session that changed state, rewrite the **Status** block:
bump the date, move finished items to "Recently done", refresh "In flight",
"Known issues", and "Next likely steps". Delete stale bullets — this is a
snapshot, not a changelog (that's `LEARNINGS.md`).
