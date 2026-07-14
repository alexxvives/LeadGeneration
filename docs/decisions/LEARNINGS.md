# Learnings Log

Append dated entries. Newest at top. Keep each entry short and factual.

---

### 2026-07-14 — Auth edge split, lockfile, Studio modularize, docs hygiene
- **Email providers must not live in `auth.config.ts`.** Auth.js asserts an
  adapter whenever an email/magic-link provider is registered. Middleware uses
  the edge config with no adapter → `MissingAdapter` spam whenever
  `RESEND_API_KEY` is set locally. Fix: Credentials-only on the edge; Resend +
  Nodemailer only in `auth.ts` **and only when a D1 adapter exists**.
- **`package.json` / `package-lock.json` must stay in sync for Cloudflare.**
  CF builds use `npm ci`. Adding `@dnd-kit/*` + `leaflet` to `package.json`
  without regenerating/committing the lockfile fails install with "Missing: …".
- **Studio split:** keep orchestration in `Studio.tsx`; Pipeline kanban →
  `PipelineView.tsx`, runs list → `RunsView.tsx`, empty/layout chrome →
  `StudioHelpers.tsx`. Dead `AccountMenu.tsx` removed (sign-out is in shell).
- **Docs inventory:** keep all ADRs (superseded 0003 is history, not clutter).
  Keep `business-plan.md` (strategy) vs `commercialization.md` (build) separate —
  cross-link only. No merge of email-providers into how-it-works.
- **Chrome DevTools for agents** (Chrome 150+ / chrome-devtools-mcp): memory
  snapshots, extension mgmt, bundled skills, URL allow/block patterns. Useful
  for agent UI debugging when Playwright alone isn't enough — see
  https://developer.chrome.com/blog/new-in-devtools-150/#devtools-for-agents

### 2026-07-14 — CRM stage model + Pipeline dnd-kit + follow-ups + location autocomplete
- **CRM stage is a separate field from email-workflow status.** `LeadStatus`
  (queued/approved/sent/…) drives the email flow; `CrmStage` (new/contacted/
  in_conversation/closed/not_interested) drives the Pipeline kanban. The two
  concerns are fully independent — both live on the Lead.
- **Auto-advancing crmStage on send.** When `sendApprovedOutreach` succeeds,
  `service.ts` reads the current lead's `crmStage` and advances it from "new"
  to "contacted" (with `contactMethod: "email"`) only if it's still "new". Any
  manually set stage is left untouched.
- **dnd-kit PointerSensor + `distance: 8` cleanly separates click from drag.**
  Cards have a separate grip handle icon for the drag `listeners`; the click
  area (`onClick`) is a sibling button. This avoids the drag/click collision
  without any custom state tracking.
- **LocationSuggestion type exported from the route file.** The geocode route
  exports `LocationSuggestion` as a named type so `client-api.ts` can import
  it with `import type` — keeps the type colocated with the API that produces it.
- **Unicode curly quotes inside TypeScript string literals break the parser.**
  `"` (U+201C) and `"` (U+201D) are treated as string terminators by the tsc
  parser, not as ordinary characters. Fix: use ASCII `"` or single-quote strings.
- **`followUps` stored as JSON TEXT in D1** (same pattern as `emails`, `phones`,
  etc.). The `parseFollowUps` helper in `d1-store.ts` deserialises safely.

### 2026-07-14 — Codebase + docs audit

- **`docs/commercialization.md` was actively misleading.** It was written when
  Supabase was the planned stack (before ADR 0005 switched to D1/Auth.js). The
  copy-paste prompt inside it said "Auth + DB: Supabase" — an agent following it
  would build the wrong thing. Rewritten to reflect the actual D1/Auth.js stack
  and current phase status (all four commercial phases built; only deployment
  remains).
- **`GET /api/outreach` does not exist** — the route file only has `POST`. No
  dead route to clean up. `listOutreach()` exists on `LeadRepository` but is not
  exposed to the client, which is correct (board data comes through `/api/board`).
- **"New" pipeline column is intentionally always empty.** Auto-drafting during
  the run moves every lead from `new` → `queued` immediately. This is a known
  UX quirk documented now in `how-it-works.md` §3. The fix (when desired) is a
  separate `crmStage` field on Lead that the user advances manually — keeping the
  email-workflow status (`queued/approved/sent`) separate from the CRM stage
  (`New/Contacted/In Conversation/Closed/Not Interested`).
- **Improvement backlog recorded.** Top items: location geo-picker (multi-select
  country/city), CRM stage model (prerequisite for drag-and-drop + follow-ups),
  bulk draft/approve, lead notes, saved ICPs, Outreach tab consolidation into
  Pipeline, keyboard shortcuts in the drawer.

### 2026-07-14 — Phase A finish + Phase B lead quality
- **Sender name is API-safe via the Run, not localStorage.** Added `Run.senderName`
  (types → both stores → migration `0004`). The client puts the sender-profile
  `displayName` into the create-run payload; `generateDraft` reads `run.senderName`.
  The compliance footer keeps the **env** from-identity (`OUTREACH_FROM_*`) — only the
  sign-off is personalized. Keeps constitution Art. III.5 (no secrets/localStorage on
  server) intact and makes re-drafts consistent.
- **"Open run on board" = pin an `activeRunId` and overlay it in `refresh()`.** The
  board API still returns the latest run + capabilities/workspace; when a run is pinned
  we fetch `/api/runs/{id}` and overlay `{run, leads}`. A new search / demo / clear
  resets the pin. Avoids a second board endpoint.
- **Better company names:** many scraped titles are page names ("Contact Us", "Home").
  Split the title on separators, skip a generic-segment set, take the first brand
  segment, else prettify the domain base. Existing saved leads keep old names — only
  new runs benefit (naming happens at enrich time).
- **Email hygiene** lives in `extractEmails`: plausibility (single @, dotted 2–24 TLD,
  no edge/double dots), disposable-domain + no-reply/junk filtering, and personal-
  before-generic (`info@`, `hello@`) ranking so the most contactable address is primary.
- **`City, ST` needs a real region code.** Validating the 2-letter code against a
  US/CA set removes prose false-positives ("Learn, MO…") that were polluting map pins.
- **`npm run smoke` aborts natively on Windows** (`Assertion failed:
  !(handle->flags & UV_HANDLE_CLOSING)`, libuv async.c) on the **2nd** `fetch` —
  localhost *and* 127.0.0.1, with/without `--experimental-strip-types`. It's a Node/
  undici keep-alive teardown bug, not app code (create-run + all executed asserts pass;
  the browser hits `/api/board` fine). Verified the flow via Playwright + in-page
  `fetch` instead. TODO: give the harness a no-keep-alive dispatcher.

### 2026-07-14 — Funnel UX + map Playwright proof + credit copy
- Map blank was Leaflet remount + tile CDN fragility; Playwright confirmed fix
  (tiles + 11 markers). OSM tiles used instead of Carto-only.
- Firecrawl remaining can exceed monthly plan allotment (rollovers) — never render
  as `remaining / plan left`; show `N credits left · plan/mo`.
- Marketing Sign in ≠ Open studio. Sidebar gained Pipeline / Runs / Export / Help.
- Strategy recorded in `docs/roadmap-next.md`: features/funnel before more UI MCPs.

### 2026-07-14 — UX pass: nav consistency, sidebar, map, Maileroo-first, Firecrawl formats
- Shared `SiteNav` on landing/pricing/login; studio uses `StudioShell` sidebar with
  hover-animated icons. Auth modal gates "Open the studio" (guest continue in demo).
- Leads default to **table**; added **Map** view (Leaflet + Nominatim geocode of
  search location, jittered pins — leads only store a location string today).
- Firecrawl search no longer sends `scrapeOptions.formats` on `/v1/search` (that
  path was returning format validation errors); search first, then `/v1/scrape`
  markdown for top hits.
- Email preference aligned with `docs/email-providers.md`: **SMTP/Maileroo first**,
  Resend optional. Magic-link Nodemailer provider registered in `auth.ts` (server);
  sender.ts tries SMTP before Resend.

### 2026-07-14 — Commercial build (Phases 1–4): auth, workspaces, plans, Stripe, deploy
Shipped the full commercial MVP in one pass. Key facts learned:
- **`@opennextjs/cloudflare` exposes `getCloudflareContext()`**, not the older
  `getRequestContext()` (next-on-pages). Bindings are on `.env` (e.g. `env.DB`).
- **A local D1 proxy IS available during `npm run dev`** (getCloudflareContext
  resolves an empty miniflare D1), which broke demo mode with `no such table`.
  Fix: `getD1Binding()` returns `undefined` unless `NODE_ENV === "production"`,
  so `npm run dev` is always JSON-store/demo; use `npm run cf:preview` for D1.
- **Auth.js edge split is mandatory:** `src/auth.config.ts` (no DB, used by
  middleware) vs `src/auth.ts` (D1 adapter + workspace-provisioning jwt callback).
  Importing `JsonStore` (which imports `fs`) into middleware breaks the edge build.
- **JWT module augmentation path is `@auth/core/jwt`**, not `next-auth/jwt`
  (the latter throws "module cannot be found" in a `declare module`).
- **next-auth pulls `jose`**, which triggers benign build warnings about
  `CompressionStream`/`DecompressionStream` not being in the Edge Runtime. Auth.js
  doesn't compress JWTs and Workers provides these APIs, so it's a no-op.
- **`nodemailer` had to bump 6→7** to satisfy `@auth/core`'s peer range.
- **Metering is gated on the D1 binding** (`metered = !!binding`), NOT on auth —
  guarantees the JSON-store/demo path is always free + unmetered (Art. I.2).
- **Stripe webhook uses `constructEventAsync`** (Web Crypto) over the raw
  `req.text()` body; App Router needs no body-parser opt-out (that's Pages Router).
- Service functions now take a `Ctx { db, workspaceId, metered }`; `getCtx()`
  (src/lib/request-context.ts) is the single place that resolves the binding +
  session → scoped repo. See ADRs 0006/0007/0008.

### 2026-07-14 — Switched from Supabase to Cloudflare D1 + Auth.js (ADR 0005)
Supabase was chosen in ADR 0003 for "auth + DB in one". Revisited immediately
when it became clear the lead dev already uses Cloudflare D1 + Auth.js on
another project, eliminating the learning-curve advantage of Supabase. Key
findings: (1) RLS is defense-in-depth, not the primary isolation mechanism —
service-layer workspace scoping is. (2) D1 reads are faster at the edge than
single-region Postgres. (3) Staying 100% Cloudflare reduces vendor count.
SQLite array limitation: `emails[]` etc. serialised as JSON TEXT — handled
transparently in `d1-store.ts` with `JSON.parse/stringify`. `getDb(binding?)`
is the injection point; no binding → JsonStore (local/demo unchanged).

### 2026-07-14 — Phase 0 Supabase swap: selection is env-driven, JSON is default
`getDb()` now returns `SupabaseStore` only when `SUPABASE_URL` + a Supabase key
are set (`config.ts::databaseProvider()`), else `JsonStore`. This keeps zero-key
demo/offline mode intact. Repository behaviors are mirrored exactly (listRuns =
newest first via `order created_at desc`; listLeads = `order fit_score desc`).
Timestamps are `timestamptz` normalized back to ISO in the mapper. Phase 0 has
**no `workspace_id` and no RLS** — the server uses the service-role key (bypasses
RLS); RLS + workspaces are Phase 1. `outreach.lead_id` is `unique` so
`getOutreachByLead` stays a safe single-row lookup. Note: OpenNext/Workers can't
use the `fs`-based JSON store — production must be Supabase (ADR 0004).

### 2026-07-14 — `npm run smoke` targets :3000; a stale server hijacks it
If port 3000 is already in use, `next dev` silently moves to 3002, but the smoke
script defaults to `http://localhost:3000` and will hang against whatever stale
process holds 3000. Point it explicitly: `$env:SMOKE_BASE_URL="http://localhost:3002"`
(PowerShell) before `npm run smoke`, or free port 3000 first.

### 2026-07-13 — v0 MCP replaces 21st.dev Magic for component generation
21st.dev Magic MCP hit its 100-credit free-tier monthly cap (credits, not a
config issue). Switched to **v0 by Vercel** (`v0-mcp-server` npm package) as
the primary UI generation tool — better fit for Next.js/App Router/shadcn/
Tailwind stack, returns full file paths + code, and has a comparable free tier.
21st.dev key kept in mcp.json since logo search (`logo_search`) is unlimited.
To activate: go to v0.dev/account → API Keys, paste key into mcp.json
`V0_API_KEY`. Created `.cursor/skills/lodestar-ui/SKILL.md` as a project-level
brand design system reference so any agent builds on-brand UI automatically.

### 2026-07-13 — Search "mode" toggle (standard/smart/local) added
`CreateRunInput.searchStrategy` drives `search/query.ts::buildQueries`, which
returns 1..N queries. `runSearch` runs each, dedupes pages by URL, enriches,
dedupes by domain, and (for multi-query modes) ranks by fit score before
capping to `MAX_LEADS_PER_RUN`. Smart/local use ~3× provider credits — gate any
future auto-runs on this. Invariant preserved: still falls back to demo data.

### 2026-07-13 — Node 24 runs TS scripts without a bundler
`npm run seed` / `scripts/*.ts` run under Node 24's type-stripping. Path aliases
(`@/…`) do **not** resolve there, so keep standalone scripts self-contained with
relative imports (see `scripts/seed.ts`).

### 2026-07-13 — @21st-dev/magic MCP returns spec-non-compliant content
The Magic MCP (`21st_magic_component_builder` / `_inspiration`) returns tool
results whose content block is missing the required `text` string, so Cursor's
MCP client rejects them (`invalid_union … expected string, received undefined`);
the builder degrades to `[object Object]`. It's already pinned to `@latest` with
a valid API key, so this is a **server-side format bug**, not config. Workaround:
build components by hand (better brand cohesion anyway) or clear the npx cache
and retry a newer build. Revisit periodically.

### 2026-07-13 — Firecrawl MCP search returned HTTP 401
`firecrawl_search` failed with 401 during setup, suggesting the configured
Firecrawl key may be expired/limited. The app's live search uses the same key
(`.env.local`); if the app stays in demo mode, verify the key at firecrawl.dev.
Do not transmit the key value from the agent to external services to "test" it.

### 2026-07-13 — stock-images MCP writes relative to the server's home dir
`download_image`'s `folder` is relative to the MCP server's cwd (the user's home
`C:\Users\alexx`), not the project. Always pass an **absolute project path**
(e.g. `.../LeadGenerator/public/images`) to save into the repo.

### 2026-07-13 — next 15.5.4 had a security advisory
Bumped to the patched `15.5.20` (the `backport` dist-tag of the 15.5 line) during
setup. Watch for further advisories on the 15.x line.
