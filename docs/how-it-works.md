# How Lodestar Works

A plain-English tour of the product and the code behind it. For run/setup
instructions see [`../README.md`](../README.md); for principles see
[`constitution.md`](constitution.md).

---

## 1. The product in one sentence

You describe an ideal customer; Lodestar finds matching businesses on the web,
enriches each with contact info + a fit score, writes a personalized first email
for each, and lets you review, approve, and send — one lead at a time.

## 2. The five-step flow

```
Search  →  Enrich  →  Draft  →  Approve  →  Send
```

1. **Search** — On the studio's search hero you enter a **niche/ICP** (e.g.
   "dentist clinics"), an optional **location**, and optional **offer notes**.
   Submitting creates a `Run`.
2. **Enrich** — Each web result is turned into a `Lead`: company name, website,
   emails, phones, an "about" blurb, plus a transparent **fit score (0–100)**
   where every point is explained. (See
   [`search-and-enrichment.md`](search-and-enrichment.md).)
3. **Draft** — An `Outreach` email is **auto-generated for every lead** as part
   of the run, using the lead's profile + your offer notes. So leads arrive in
   the board already **"In review"** — your job is just review + send. You can
   edit or **Regenerate** any draft.
4. **Approve** — Open a lead (card or table row) to see the detail drawer. Edit
   the subject/body/recipient, then **Approve** or **Reject**. Nothing sends on
   approval alone.
5. **Send** — Approved emails send via your provider (or simulate in demo mode),
   **rate-limited**, with a compliance footer. Status flows
   `draft → approved → sent` (or `failed`). The **Approval queue** tab groups
   everything and can send all approved items in one throttled pass.

## 3. Screens

- **`/` Landing** — full-bleed aurora hero, the five steps, and the ethics/
  compliance section. Brand-first marketing view. Public.
- **`/pricing`** — the four plans (Free / Starter / Pro / Agency) with a
  monthly↔annual toggle and Stripe Checkout CTAs. Public.
- **`/login`** — sign-in. In local dev, any email + password (Credentials
  provider); in production, a Resend magic-link (+ Turnstile bot check). Public.
- **`/app` Studio** — the core app (behind login when auth is enforced):
  - Search hero (full when empty, compact "New search" once you have leads).
  - **Board** with a **Cards ⇄ Table** toggle (cards for scanning, table for
    density).
  - **Approval queue** tab with per-lead status and a "send all approved" action.
  - **Lead detail drawer** — contact info, the fit-score reasoning, the source
    URL (audit trail), and the outreach composer.
  - A **mode banner** showing whether search + email are live or demo.
- **`/app/settings`** — read-only status of which integrations are configured,
  the sending identity/compliance settings, and feature flags. Secrets are never
  shown; they come from `.env.local`.

## 4. Demo mode vs live mode

The app detects capabilities from environment variables (`config.ts`):

| Capability | No key (demo) | With key (live) |
| --- | --- | --- |
| Search + enrichment | Realistic generated sample leads | Real web results (Firecrawl → Exa) |
| Drafting / editing / approval | Full | Full |
| Email send | Simulated + logged, never delivered | Delivered via Resend or SMTP |

This is a hard product invariant: the whole UI works with zero keys.

## 5. How the code is arranged

Strict layering (never skipped — see the constitution):

```
Browser (components)
   │  fetch() via src/lib/client-api.ts
   ▼
Middleware (src/middleware.ts)         ← enforces auth on /app + /api (prod only)
   │
   ▼
API routes  (src/app/api/*/route.ts)   ← thin: build Ctx via getCtx() → service
   │
   ▼
Service layer  (src/lib/service.ts)    ← all coordination + plan/quota logic
   │                      │
   ▼                      ▼
Repository            Providers
(src/lib/db/*)        (search/*, outreach/*, email/*)
```

Every request is scoped by a **`Ctx { db, workspaceId, metered }`** built in
`src/lib/request-context.ts` (`getCtx()`): it resolves the Cloudflare D1 binding
(`src/lib/cf.ts`) and the session's workspace (Auth.js), then hands the service a
repository already scoped to that workspace. `metered` follows the D1 binding, so
the local JSON-store path is always unmetered/demo.

### Key modules

- **`src/lib/types.ts`** — `Run`, `Lead`, `Outreach`, statuses. Source of truth.
- **`src/lib/service.ts`** — `createAndRunSearch` (search + enrich + auto-draft),
  `draftOutreach`, `setOutreachDecision`, `sendApprovedOutreach`, board reads.
- **`src/lib/config.ts`** — the only place that reads `process.env`; exposes
  `getCapabilities()`.
- **`src/lib/db/`** — `LeadRepository` interface with two backends: `JsonStore`
  (a serialized read-modify-write JSON file store, the zero-key default) and
  `D1Store` (Cloudflare D1 / SQLite, the production backend). `getDb(binding?)`
  selects D1Store when a D1Database binding is passed (Workers runtime), else
  JsonStore. Schema lives in `migrations/0001_init.sql` (Wrangler format).
- **`src/lib/search/`** — `runSearch()` picks a provider (Firecrawl → Exa),
  scrapes/enriches to leads, and **falls back to demo data** on missing key or
  error. `enrich.ts` extracts emails/phones/blurb; `fit-score.ts` scores.
- **`src/lib/outreach/draft.ts`** — template-based personalization + the
  CAN-SPAM-style compliance footer. Swap in an LLM here without touching the
  approve/send flow.
- **`src/lib/email/`** — `sendEmail()` (Resend → SMTP → demo) and a rolling
  per-minute `rate-limit.ts`.
- **`src/auth.config.ts` / `src/auth.ts`** — Auth.js v5. The `.config` file is
  edge-safe (used by middleware); `auth.ts` adds the D1 adapter + workspace
  provisioning (server only). JWT sessions (ADR 0007).
- **`src/lib/plans.ts`** — single source of truth for plans, quotas, and the env
  var names holding Stripe Price IDs.
- **`src/lib/workspace.ts`** — workspace provisioning + lazy monthly usage reset.
- **`src/lib/billing/stripe.ts`** — Stripe client + plan↔price mapping (server
  only; secret key never reaches the client).
- **`src/lib/request-context.ts`** — `getCtx()` + `getWorkspaceSummary()`.
- **`src/lib/errors.ts`** — `QuotaError` (→ API 402).

## 5a. Auth, workspaces, plans & billing (commercial layer)

- **Auth is enforced only when `AUTH_SECRET` is set** (`config.authRequired()`).
  Local dev with zero keys → studio is open, unmetered (constitution Art. I.2).
- **Workspaces** are the tenant. `workspaceId` is on every Run/Lead/Outreach and
  every store query filters by it (ADR 0006). The `"local"` workspace is used in
  demo/dev.
- **Plans/quotas** (Free/Starter/Pro/Agency) are enforced in `service.ts` only:
  `createAndRunSearch` checks lead credits; `sendApprovedOutreach` checks the
  send quota *after* the approval gate. Over-limit throws `QuotaError` → 402,
  which the UI turns into an upgrade modal. Metered workspaces track usage on the
  workspace row (reset lazily monthly). ADR 0008.
- **Stripe**: `/api/billing/checkout`, `/api/billing/portal`, and
  `/api/webhooks/stripe` (signature-verified; entitlement written server-side).

### Data lifecycle

A `Run` has many `Lead`s; each `Lead` has at most one `Outreach`. By default everything is persisted to `data/db.json` (git-ignored — delete it
to reset); in production on Cloudflare Workers, `getDb()` receives a D1 binding
and uses `D1Store` instead. The board always shows the most recent run.

## 6. Guardrails baked into the flow

- `sendApprovedOutreach` refuses anything not `approved` (returns 409 via the API).
- Rate limiter blocks bursts (429) and protects deliverability.
- Contact-form automation (`/api/contact-form`) is a stub: 403 unless the
  off-by-default flag is set, and even then it only *simulates*.
- The `npm run smoke` script asserts these guardrails on every run.

## 7. Where to change things

| I want to… | Edit |
| --- | --- |
| Change what a good lead looks like | `src/lib/fit-score.ts` |
| Improve search quality / add a provider | `src/lib/search/` (see its doc) |
| Change the email copy | `src/lib/outreach/draft.ts` |
| Add an email provider | `src/lib/email/sender.ts` (+ `config.ts`) |
| Change persistence backend | pass D1 binding to `getDb()`; impl in `src/lib/db/d1-store.ts` |
| Restyle UI | `src/components/**` + `src/app/globals.css` (stay on-brand) |
