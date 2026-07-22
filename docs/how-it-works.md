# How HERMES mail Works

A plain-English tour of the product and the code behind it. For run/setup
instructions see [`../README.md`](../README.md); for principles see
[`constitution.md`](constitution.md).

---

## 1. The product in one sentence

You describe an ideal customer; Hermes Mail finds matching businesses on the web,
enriches each with contact info + a fit score, writes a personalized first email
for each, and lets you review, approve, and send — one lead at a time.

## 2. The five-step flow

```
Search  →  Enrich  →  Draft  →  Approve  →  Send
```

1. **Search** — On the studio **Search** view you enter a **niche/ICP** (e.g.
   "dentist clinics") and an optional **location**. Submitting creates a `Run`.
   After a successful search (or demo load), the app navigates to **Pipeline**.
2. **Enrich** — Each web result is turned into a `Lead`: company name, website,
   emails, phones, an "about" blurb, plus a transparent **fit score (0–100)**
   where every point is explained. (See
   [`search-and-enrichment.md`](search-and-enrichment.md).)
3. **Draft** — An `Outreach` email is **auto-generated for every lead** as part
   of the run (lead email-status becomes `queued`). CRM stage stays **New** until
   you move the card or a send auto-advances it to **Contacted**. Edit any draft
   in the drawer, or **Regenerate**. Sign-off uses your **sender-profile display
   name** (Settings), passed via the API — the server never reads browser storage.
   Sign-off / from-identity come from Settings (and env defaults). Bodies stay
   natural — no STOP / mailing-address auto-footer (ADR 0012).
4. **Approve** — Open a lead (pipeline card, table row, or map pin) to see the
   detail drawer. Edit subject/body/recipient, then **Approve**. There is no
   Reject-draft control — bad addresses are removed automatically at verify
   (status **Undeliverable**). Nothing sends on approval alone. **Outreach**
   can draft-all / approve-selected; **send stays per-lead** (Art. I.1).
5. **Send** — From the drawer, Approve then Send. From the Outreach queue,
   Send may auto-approve the draft first (the click is the per-lead human
   gate). Status flows `draft → approved → sending → sent` (or `failed`).
   Successful send advances CRM stage to **Contacted**.

## 3. Screens

- **`/` Landing** — full-bleed aurora hero, the five steps, and the ethics/
  compliance section. Brand-first marketing view. Public.
- **`/pricing`** — the four plans (Free / Starter / Pro / Agency) with Stripe
  Checkout CTAs. Public.
- **Sign in** — marketing overlay (`AuthModal` via `/?signin=1`). **Password
  is primary** (hashed on the Auth.js `users` table). Platform admin is a
  normal account with `users.is_admin = 1` (first-boot:
  `admin@tryhermesmail.com` from `BOOTSTRAP_ADMIN_PASSWORD` or a one-time
  logged UUID). Magic link (SMTP/Resend) is **forgot password** (+ Turnstile
  when set). `/login` only redirects here (Auth.js `pages.signIn`). Unauth
  `/app` → `/?signin=1&callbackUrl=/app`.
- **`/app` Studio** — the core app (behind login when auth is enforced). Sidebar
  nav: **Dashboard · Search · Pipeline · Leads · Outreach · Runs · Boards**.
  Board filter (**All** or one board) sits above the account card. Settings
  opens from the **account card** at the bottom of the sidebar (not a Workspace
  nav item). **Platform admins** get a slim ops nav (**Dashboard · Users**) and
  an ops-only Settings page (no outreach/send profiles). Views use `?view=`:

  - **Dashboard** (`?view=dashboard`) — workspace-wide stats across all boards
    (pipeline stages, sends, recent runs). Admins see the **platform** dashboard
    (`?view=admin`) instead.

  - **Search** (default / no `?view=`) — always-expanded search form + CSV/Excel
    import. Search and import open a board-picker modal; leads land on the
    chosen board (workspace **Default** if none). Import dedupes by **company
    name** only (not website/email — aggregators share those). Live search
    when Firecrawl is configured; otherwise load demo data. After a run, the
    app redirects to Pipeline. Integration status lives in Settings (no mode
    banner). **Find leads** can be paused per account by an admin — the Find
    leads button stays disabled (no pause banner); **Import stays available**.

  - **Admin Users** (`?view=admin-users`) — tenant table: plan override, Find
    leads toggle, typed `DELETE` account wipe (cancels Stripe when configured).

  - **Pipeline** (`?view=pipeline`) — CRM kanban for the active board filter
    (**All** = every board) across four active stages (*New · Contacted · In
    Conversation · Closed*) plus *Not Interested*. Drag cards between columns,
    or use quick-advance. Bulk draft/approve lives on **Outreach**, not here.
    CRM **New** = needs human review (there is no separate “In review” tag).

  - **Leads** (`?view=leads`) — full list for the active board filter (table /
    cards / map) with a shared **Pipeline** stage filter; Notes + Type columns
    always on. Pipeline header menu sorts or filters by stage. **Export Excel**.
    Table shows a short city label; the drawer keeps the full scraped address
    when available (or a Google search plan-B when no website).

  - **Outreach** (`?view=outreach`) — send queue: **Contact Draft** (Create /
    Review; unapproved drafts stay here) → **Ready** (only after Approve) →
    **Contacted**. Closing the draft drawer without Approve does not advance.
    Active outreach profile is chosen in the sidebar (next to Board). Send
    remains per-lead after approve (constitution Art. I.1).

  - **Runs** (`?view=runs`) — history of search runs (niche, location, provider,
    mode, lead count, status). Informative only — board filter lives in
    Pipeline / Leads.

  - **Boards** (`?view=boards`) — create / rename / delete named lead
    collections; invite collaborators by email (in-app accept). Soft lock when
    someone else is editing. Every workspace has a non-deletable **Default**
    board. Also linked from Settings → Boards.

  - **Lead detail drawer** — opens from any lead card/row/pin. Contact info
    (incl. full address), about blurb, fit-score reasons, CRM stage, dated notes
    journal, and the outreach composer (draft → edit → approve → send).

- **`/app/settings`** — sender profile, **Sending** dual path (Easy Resend + DNS
  health, or Pro Connect Google mailbox), plan/usage, Boards link, Integrations
  status, “Ready to send?” checklist, and **Danger zone** self-serve account
  deletion (live app only; type `DELETE`). Microsoft mailbox connect is next.
  Resources (Getting started wizard, How it works, Plans). No env-var names in
  the UI. Secrets are never shown. Reopen the guide via **Getting started**.
  Platform admins see a slim **Admin settings** page (tools + resources only —
  no Danger zone / outreach send setup).

## 4. Demo mode vs live mode

The app detects capabilities from environment variables (`config.ts`):

| Capability | No key (fallback) | With key (live) |
| --- | --- | --- |
| Search + enrichment | Realistic generated sample leads | Real web results (Firecrawl) |
| Drafting / editing / approval | Full | Full |
| Email send | Simulated + logged, never delivered | Delivered via connected Gmail, Resend, or SMTP |

This is a hard product invariant: the whole UI works with zero keys. The
**Getting Started** wizard walks new users from fallback → live (search key,
email transport, real `OUTREACH_*` identity). Placeholder from-email / address
values are treated as incomplete in Settings even though config returns string
defaults.

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
  JsonStore. Schema lives in `migrations/` (`0001`–`0015`, Wrangler format).
- **`src/lib/search/`** — `runSearch()` uses Firecrawl (demo when no key / Load demo),
  scrapes/enriches to leads, and **falls back to demo data** on missing key or
  error. `enrich.ts` extracts emails/phones/blurb; `fit-score.ts` scores.
- **`src/lib/outreach/draft.ts`** — locale-aware template personalization
  (language from lead location). No auto compliance footer (ADR 0012). Swap in
  an LLM here without touching the approve/send flow.
- **`src/lib/email/`** — `sendEmail()` (Google mailbox → Resend → SMTP → demo),
  domain health, mailbox OAuth helpers, and a rolling rate limit.
  per-minute `rate-limit.ts`.
- **`src/auth.config.ts` / `src/auth.ts`** — Auth.js v5. The `.config` file is
  edge-safe (Credentials for keyless dev only — used by middleware). `auth.ts`
  adds the D1 adapter, email/magic-link providers (SMTP then Resend), and
  workspace provisioning — **server only**, never imported by middleware.
  JWT sessions (ADR 0007).
- **`src/components/studio/`** — Studio UI: `Studio.tsx` orchestrates Search /
  Pipeline / Runs; `PipelineView.tsx`, `RunsView.tsx`, `SearchPanel.tsx`,
  drawer/table/map/card modules are separate.
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
and uses `D1Store` instead. Pipeline/Leads respect the sidebar board filter
(**All** by default). Each workspace has a **Default** board; see ADR 0014.

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
