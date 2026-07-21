# HERMES mail

**Navigate to your next customer.** A human-in-the-loop lead generation studio.
Describe an ideal customer in plain English → Hermes Mail searches the web,
enriches each prospect, scores fit, drafts a personalized outreach email, and
puts every message in an approval queue. **Nothing is sent without your explicit
per-lead approval.**

Built with Next.js (App Router) + TypeScript + Tailwind. Runs fully offline in
demo mode — no API keys required to explore the whole flow.

---

## Quick start

```bash
npm install
npm run seed      # optional: pre-fill the board with demo leads
npm run dev       # http://localhost:3000
```

Open <http://localhost:3000> for the landing page, or go straight to
<http://localhost:3000/app> for the studio.

> No keys? You're in **demo mode**: searches return realistic sample leads and
> "sends" are simulated (never actually delivered). The entire UI works.

---

## The flow

**Search → Enrich → Draft → Approve → Send**

1. **Search** — Enter a niche/ICP (e.g. "dentist clinics") and optional location
   on the studio **Search** view.
2. **Enrich** — Each result is scraped for website, emails, phones, and an about
   blurb, then given a transparent 0–100 **fit score** (every point is explained).
3. **Draft** — A personalized first email is **auto-generated for every lead** as
   part of the run. Open any lead to edit or **Regenerate** the draft.
4. **Approve** — Review in the drawer, then **Approve** or **Reject** per lead.
   Use **Pipeline** for CRM stages and bulk draft/approve/send.
5. **Send** — Approved emails send via your provider, rate-limited, with a
   compliance footer. Status: `queued → approved → sent / failed`.

After a search, Hermes Mail opens **Pipeline** (kanban + leads table/cards/map).
Nothing is sent without per-lead approval.

---

## Environment variables

Copy `.env.example` → `.env.local` and fill in what you have. All are optional.

| Variable | Purpose | Without it |
| --- | --- | --- |
| `FIRECRAWL_API_KEY` | Live web search + page scrape | Demo leads |
| `MAX_LEADS_PER_RUN` | Leads discovered per search (default 50, hard max 50) | 50 |
| `RESEND_API_KEY` | Email sending via Resend (recommended) | Demo/simulated send |
| `SMTP_HOST/PORT/USER/PASS` | Email via SMTP (Nodemailer) | Demo/simulated send |
| `OUTREACH_FROM_NAME` / `OUTREACH_FROM_EMAIL` | Sender identity | Placeholder identity |
| `OUTREACH_REPLY_TO` | Reply-to address | Falls back to from email |
| `OUTREACH_PHYSICAL_ADDRESS` | CAN-SPAM mailing address in footer | Placeholder |
| `SEND_RATE_PER_MINUTE` | Outbound rate limit (default 5) | 5 |
| `ENABLE_CONTACT_FORM_AUTOMATION` | Feature flag (see below) | `false` (off) |
| `AUTH_SECRET` | **Enables + enforces auth/metering** (Auth.js) | Open studio, unmetered (demo) |
| `AUTH_RESEND_KEY` | Resend key for magic-link login (prod) | Dev uses any email+password |
| `NEXTAUTH_URL` | App base URL (redirects) | `http://localhost:3000` |
| `STRIPE_SECRET_KEY` | Stripe billing (server-side) | Billing disabled |
| `STRIPE_WEBHOOK_SECRET` | Verify Stripe webhooks | Webhook rejected |
| `STRIPE_{STARTER,PRO,AGENCY}_PRICE_ID` | Monthly Stripe Price IDs | Upgrade to that plan disabled |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | Signup bot check (prod) | No challenge |
| `SMOKE_API_KEY` | Lets `npm run smoke` bypass auth via `x-smoke-key` | Not needed in dev |

Check the **Settings** page in-app to see exactly which capabilities are live,
your plan, and usage. **Auth + metering are off until `AUTH_SECRET` is set** —
so `npm run dev` is always the open, zero-key demo.

### What works without keys vs. with keys

| Capability | No keys (demo) | With keys (live) |
| --- | --- | --- |
| Search & enrichment | Realistic sample leads | Real web results via Firecrawl |
| Fit scoring, drafting, editing | ✅ Full | ✅ Full |
| Approve / reject queue | ✅ Full | ✅ Full |
| Email send | Simulated (logged, not delivered) | Delivered via Resend/SMTP |

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run seed` | Pre-fill the local DB with demo leads |
| `npm run lint` | Lint |
| `npm run smoke` | Headless smoke test of the core flow (needs dev server running) |
| `npm run cf:build` | Build for Cloudflare Workers (OpenNext) |
| `npm run cf:preview` | Build + run the Worker locally (exercises real D1) |
| `npm run cf:deploy` | Build + deploy to Cloudflare Workers |
| `npm run cf:migrate` / `:local` | Apply D1 migrations (prod / local) |

---

## Deploy to Cloudflare

Local `npm run dev` runs plain Next.js in demo mode (JSON store, zero keys).
Production runs on **Cloudflare Workers** via `@opennextjs/cloudflare`, backed by
**D1**. One-time setup:

```bash
# 1. Create the D1 database, then paste the returned database_id into wrangler.jsonc
npx wrangler d1 create lodestar-prod

# 2. Apply migrations (creates workspaces/auth tables + adds workspace_id + usage)
npm run cf:migrate            # production D1
npm run cf:migrate:local      # local D1 (for `npm run cf:preview`)

# 3. Set secrets (never commit these)
npx wrangler secret put AUTH_SECRET            # npx auth secret to generate
npx wrangler secret put AUTH_RESEND_KEY
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put STRIPE_STARTER_PRICE_ID
npx wrangler secret put STRIPE_PRO_PRICE_ID
npx wrangler secret put STRIPE_AGENCY_PRICE_ID
npx wrangler secret put TURNSTILE_SECRET_KEY
# (plus FIRECRAWL_API_KEY / RESEND_API_KEY / etc. as needed)

# 4. Preview locally, then deploy
npm run cf:preview
npm run cf:deploy
```

`NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `NEXTAUTH_URL` are non-secret and can live in
`wrangler.jsonc` `vars` or the dashboard. Point your Stripe Dashboard webhook at
`https://<your-domain>/api/webhooks/stripe` and use its signing secret as
`STRIPE_WEBHOOK_SECRET`. In Stripe, create one **monthly recurring Price** per
paid plan (Starter/Pro/Agency) and paste each Price ID into the matching secret.

---

## Project structure

```
src/
  middleware.ts              Auth enforcement on /app + /api (prod only)
  auth.config.ts / auth.ts   Auth.js v5 (edge base / full server + email providers)
  app/
    page.tsx                 Landing (full-bleed hero)
    pricing/                 Public pricing page (plans + Stripe CTAs)
    login/                   Sign-in (dev credentials / prod magic-link)
    app/                     The studio (app shell, behind login)
      page.tsx               Search / Pipeline / Runs + lead drawer
      settings/page.tsx      Capabilities, plan & usage, billing, resources
    api/                     Thin route handlers → getCtx() → services
      runs/ board/ outreach/ send/ settings/ contact-form/ geocode/
      leads/ providers/ auth/ billing/ webhooks/stripe/ turnstile/
  components/                UI (BrandMark, icons, ui, studio/*)
  lib/
    types.ts                 Typed models: Workspace / Run / Lead / Outreach
    config.ts                Env + capability detection (incl. authRequired)
    plans.ts                 Plans/quotas/price-env — single source of truth
    request-context.ts       getCtx(): binding + session → scoped repo
    cf.ts                    Cloudflare D1 binding resolver
    workspace.ts             Workspace provisioning + usage window
    errors.ts                QuotaError (→ 402)
    fit-score.ts             Transparent heuristic scoring
    service.ts               App services + plan/quota enforcement
    db/                      Repository abstraction + JSON store + D1 store
    search/ outreach/ email/ billing/   providers + Stripe client
data/                        Local JSON DB (git-ignored)
migrations/                  D1 SQL 0001–0006
scripts/                     seed + smoke test
```

### Documentation

Deeper docs live in [`docs/`](docs/), indexed by [`AGENTS.md`](AGENTS.md):

- [`docs/how-it-works.md`](docs/how-it-works.md) — product + flow + architecture
- [`docs/constitution.md`](docs/constitution.md) — the principles all code follows
- [`docs/search-and-enrichment.md`](docs/search-and-enrichment.md) — how search works + roadmap
- [`docs/email-providers.md`](docs/email-providers.md) — Resend vs Maileroo vs SES
- [`docs/business-plan.md`](docs/business-plan.md) — market / positioning (strategy)
- [`docs/commercialization.md`](docs/commercialization.md) — auth / plans / Stripe build status
- [`docs/roadmap-next.md`](docs/roadmap-next.md) — next product value phases
- [`docs/decisions/`](docs/decisions/) — ADRs + learnings log

### Persistence

The app only talks to the `LeadRepository` interface in `src/lib/db/index.ts`.
`getDb(binding?, workspaceId?)` returns a workspace-scoped `D1Store` when a
Cloudflare D1 binding is present (production) and a `JsonStore` otherwise (local
dev / demo). No UI or API-route changes are needed to switch backends — the
service layer builds the scoped repo via `getCtx()`.

---

## Compliance & responsible use (please read)

Hermes Mail is designed to keep you on the right side of anti-spam law and platform
Terms of Service. The guardrails are **on by default**:

- **Human-in-the-loop by design.** No email is sent without explicit per-lead
  approval. There is no "auto-blast".
- **Rate limiting.** Outbound sends are throttled per minute (`SEND_RATE_PER_MINUTE`)
  to protect deliverability and behave responsibly.
- **Clear identity + unsubscribe.** Every draft includes your from-identity, a
  physical mailing address, and an unsubscribe placeholder. **Wire the
  unsubscribe link to a real one-click opt-out before commercial sending.**
- **Public web only.** Enrichment never authenticates into or scrapes content
  behind a login.
- **Contact-form automation is a demo-only stub.** It is gated behind
  `ENABLE_CONTACT_FORM_AUTOMATION` (off by default) and, even when enabled, only
  *simulates* a submission — it never posts to a real site. Auto-submitting
  contact forms can violate ToS and computer-misuse / anti-spam laws. The code is
  clearly commented where **legal review is required before commercializing**.

You are responsible for complying with CAN-SPAM (US), CASL (Canada), GDPR/ePrivacy
(EU/UK), and any platform Terms of Service that apply to how you use this tool.

---

## Notes

- Local persistence is a JSON file at `data/db.json` (git-ignored). Delete it to
  reset. It's structured behind a repository interface for an easy Supabase swap.
- Outreach drafting is template-based (no LLM key needed). Swap in an LLM inside
  `src/lib/outreach/draft.ts` without touching the approval/send flow.
