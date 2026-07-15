# Learnings Log

Append dated entries. Newest at top. Keep each entry short and factual.

---

### 2026-07-15 — First-class Boards (ADR 0014)
- `Board` entity + `Lead.boardId` / `Run.boardId`; Default board auto-created
  per workspace; orphans back-filled via `ensureDefaultBoard`.
- Sidebar: Dashboard (top), Boards nav, board picker above account (All =
  default filter). Search/import open `BoardAssignModal` (no inline Current/
  New list). Migration `0011_boards.sql`.

### 2026-07-15 — Settings save false-positive + send path bugs
- Root cause of “Maileroo not saving”: `getCtx` could scope D1 to workspace
  `"local"` under auth → UPDATE 0 rows while API returned `{ ok: true }`. Fixed
  with fail-closed `AuthError` + `NotFoundError` when `updateWorkspace` is null.
- Empty inactive key fields wiped the other provider on PATCH — now dirty-only
  (+ explicit clear flags). Secrets never SSR’d; form uses `has*Key` flags.
- `preferredSendPath` (migration 0010): Google only when path is Pro. Metered
  demo sends no longer mark Contacted. Magic link requires successful `signIn`.

### 2026-07-15 — Easy Maileroo send + safe test guidance
- ADR 0011: Easy path is Resend **or** Maileroo BYO key (`mailerooApiKey` +
  `easyEmailProvider`). Verify (Zeruh) stays separate from Maileroo send.
- Migration `0009_maileroo_send.sql` for D1; JSON store normalizes defaults.
- Safe E2E testing: leave sends in **demo/simulate** (no BYO key / no Google
  connect), or send only to addresses you own. Never blast fake lead emails
  from personal Gmail or a production domain.

### 2026-07-15 — Google mailbox OAuth E2E (local)
- Env: `GMAIL_OAUTH_CLIENT_ID` / `SECRET` → Connect Google enabled in Settings → Pro.
- Flow: `/api/mailbox/google/start` → consent → callback stores AES-GCM refresh
  token on workspace (`connectedMailbox`); send prefers Gmail over Resend.
- Warmup self-report (age + volume) at connect → soft daily recommend (UI).
- **Hostinger/GoDaddy:** registrar doesn't matter for Resend — user pastes
  SPF/DKIM/DMARC at wherever DNS is hosted; Resend never needs the registrar
  account. Same for Cloudflare/Namecheap.
- **Pro ≠ Hostinger/Zoho mail:** Pro OAuth is Google Workspace / Microsoft 365
  only. Zoho/Hostinger/cPanel mailboxes → Easy (Resend) + domain DNS. No
  Hostinger OAuth — they aren't a Gmail-style send API.
- Prod still needs Wrangler secrets + D1 migration 0008.

### 2026-07-15 — ADR 0010 accepted + studio UX fixes
- **ADR 0010 accepted:** Google mailbox OAuth first; multi-inbox deferred.
  Warmup: free = slow manual ramp; automated networks are paid — no free
  durable warmup product to rely on; no in-house network.
- **Bug:** `newId` used Node `crypto.randomUUID` → broke client notes in
  LeadDrawer (local + prod). Fixed via `globalThis.crypto.randomUUID`.
- **UX:** removed Outreach “Before real inbox delivery” banner → simulate
  confirm modal on send when no provider; pipeline columns shorter; parked
  stages collapsed by default; lead info drawer centered; Easy/Pro toggle
  right-aligned on Settings.

### 2026-07-15 — Easy send path shipped (P0) + mailbox ADR proposed
- Deleted root `SKILL.md` (data-scraper-agent) — wrong stack; noted in roadmap.
- Settings: Easy (Resend wizard) vs Pro (coming soon) via `SendSetupPanel`.
- Live DNS: `fetchResendDomainHealth` + `POST /api/providers/resend/domain-health`;
  Domain health is the Sending hero (copyable SPF/DKIM + DMARC hint + poll).
- Webhooks: Resend tags `lodestar_ws` / `lodestar_outreach`; fallback
  `findLatestSentByEmail` (cross-workspace). ADR **0010** proposed for OAuth —
  do not implement until accepted.
- Sequence templates remain Day+3/+7 HITL stubs (P1 polish later).

### 2026-07-15 — Dual send plan + agent scrape tooling
- **Push policy:** user wants commit+push every meaningful change.
- **Plan:** `docs/roadmap-send-paths.md` — Easy=Resend+DNS guide; Pro=Google/
  Microsoft mailbox (ADR first). OSS backlog ranked P0–P2.
- **gstack `/scrape`:** Claude Code browser extract skill — useful for agent QA,
  not Lodestar production search (we use Firecrawl/Exa).
- **Root `SKILL.md` data-scraper-agent:** wrong stack (Python/Actions); don’t
  adopt for product scraping — **file removed**.
- **Leads UX:** centered Export/layout toggles; table viewport-capped scroll.

### 2026-07-15 — Cold email infra reality + OSS notes
- **CI:** `.github/workflows/ci.yml` is live; push `e8b4512` → Actions success.
- **Smartlead ≠ Resend:** competitors send through **warmed Google Workspace /
  Microsoft 365 inboxes** (OAuth/SMTP). User still configures DNS (SPF/DKIM/
  DMARC) on their domain; tools guide + check, they don’t silently own the
  registrar. Claimed “automatic DNS” usually means: buy domains via partner,
  show copy-paste records, poll until verified, plus mailbox warmup.
- **OSS inspiration:** [Wu-Wei-Mail](https://github.com/LuiHedlund02/Wu-Wei-Mail)
  (multi-inbox SMTP + IMAP replies; warmup still hard); OutreachStud-io
  (planned DNS checks / rotation — code early); PaulleDemon Email-automation
  (templates/follow-ups, BYO SMTP). Lodestar should stay HITL + BYO sender;
  mailbox-connect is a later product bet, not a Resend feature toggle.
- **UI:** Outreach + Pipeline columns use `100dvh` height; Pipeline cards are
  whole-card drag with circled-i info (no grip / advance arrow).

### 2026-07-15 — Outreach UX + send 400/409 + P1 bets
- **Send 400 then 409:** Resend/provider failure returned 400 and used to set
  outreach `failed`; retry then 409 (not approved). Now keep `approved` + store
  error so retry works after fixing domain/key.
- **Setup:** verified From domain in Resend + API key (platform or workspace).
- **Outreach UI:** 3-column Needs/Review/Ready; section batch buttons; Edit =
  draft-only drawer; ℹ = lead info (no composer).
- **P1:** sequence Day+3/+7 notes on send; `/api/webhooks/resend`; cross-run
  dedupe; Settings domain-health checklist; `RESEND_WEBHOOK_SECRET` in
  `.env.example`.

### 2026-07-15 — Studio IA + enrichment polish + competitor backlog
- **Nav:** Leads (`?view=leads`) and Outreach (`?view=outreach`) tabs; Pipeline
  is kanban-only. Search mode sits left of leads-to-find.
- **Drawer:** CRM stage pill (not “In review”); dated Notes journal; full
  address shown; Source URL removed from fit reasons.
- **Enrichment:** privacy/consent blurbs filtered; prefer meta description;
  intl street regex; demo leads get street addresses; table shows short city.
- **Skills:** accessibility, adr-skill, dogfood, acquire-codebase-knowledge
  copied into `.cursor/skills/` (SkillRepo CLI needs a key for auto-sync).
- **Backlog:** `docs/decisions/competitor-features-2026-07.md` (Smartlead etc.).

### 2026-07-15 — CI, verify path, Resend≠Maileroo, pipeline parked flat
- **GitHub Actions** `.github/workflows/ci.yml` — `tsc` + lint on push/PR.
- **ADR 0009:** Resend = send; Zeruh (Maileroo Verify) = verify
  (`MAILEROO_VERIFY_API_KEY`). Filter on enrich; block undeliverable on send.
- **Pipeline:** Not Interested + Discarded are peer columns (no nested Parked).
- **Selects:** `.select-ink` + `color-scheme: dark` for option menus.
- **Skills:** see `.cursor/skills/lodestar-agent-boosters` + SkillRepo links
  (accessibility, ADR, dogfood).

### 2026-07-15 — Pipeline polish, Discarded, dev plan override
- **Pipeline cards:** vertical centering via `items-center` + content
  `justify-center`; column scroll needs outer `max-h` + body `min-h-0
  overflow-y-auto` (flex children otherwise grow and clip).
- **Card subtitle** was `tags[0]` = first niche word — looked like a wrong
  category. Now email → location → website. Tags still niche phrase + city.
- **aboutBlurb** = first usable sentence from scraped page content / meta
  description (`extractBlurb`); often SEO junk — filter cookie/nav openers.
- **Discarded** CRM stage sits beside Not Interested under Parked (bad-fit
  leads vs prospect declined). No DB migration — `crm_stage` is free TEXT.
- **Dev mode** can force plan via `POST /api/workspace/set-plan` (no Stripe).

### 2026-07-15 — Tour v2, local settings, deliverability research
- **Tour:** separate pipeline-board + leads-table steps; tip waits until
  anchored (no center flash); Resend step = BYO domain, tip prefers left;
  confetti bursts from sides.
- **Localhost:** `ensureLocalWorkspace` so Sending identity is editable on
  JSON store; usage bars shown (tracked, not hard-capped) — explains why they
  were missing (`metered === false` hid them).
- **Do not** give clients a shared Lodestar send domain — burns reputation;
  Resend BYO is correct for v1; cold scale later = warmed Google/MS inboxes
  or Instantly/Smartlead (see `docs/email-providers.md`).
- **AGENTS.md #8:** commit and push after every meaningful change (for now).

### 2026-07-15 — Tour polish, LUMIA sign-off, click-select pipeline
- **Stale `.next` chunks** → 404 on `app-pages-internals.js` after heavy HMR;
  fix is delete `.next` + restart `npm run dev` (hard refresh).
- **Tour:** smarter tip placement (above/below/side), scroll-into-view,
  progress dots, Resend step, confetti on finish.
- **Sign-off:** profile builds `Name / Role | Company / site`; drafts use that
  block; mailing address appended at send only when lead location looks US.
- **Pipeline:** drag to move stages; Approve all lives only on Outreach
  (one toast with count). Draft all stays on New column.

### 2026-07-14 — Search lead-count, quieter compliance, Spanish drafts
- **`maxLeads` on CreateRunInput** — UI offers 5/10/15/25; Free capped at
  `FREE_MAX_LEADS_PER_RUN` (10) + monthly credits; paid uses `MAX_LEADS_PER_RUN`
  (default now 25).
- **Drafts no longer embed the scammy “Sent by… STOP…” block.** Editable body
  stays human; a quiet address + opt-out line is appended only at send time
  (`complianceFooter` in `sendApprovedOutreach`).
- **One name field:** Sending identity “Your name” syncs to localStorage
  `displayName` for draft sign-off; Outreach profile no longer asks again.
- **Reply-to ≠ CC.** Reply-to routes replies; CC on cold outreach hurts
  deliverability — keep sharing threads after they reply.
- **Physical address** remains for CAN-SPAM / ready-to-send checklist, even
  though the draft UI no longer shows the verbose footer.

### 2026-07-14 — Phase C + D product code (roadmap complete)
- **Bulk send removed from Pipeline.** Roadmap “per-lead send” means Approve
  can be bulk/selected; Send stays in the drawer only (Art. I.1).
- **`deliveryStatus` on Outreach** (`unknown|sent|bounced|replied`) is the
  stub for future Resend webhooks — same field, no schema churn. Marking
  `replied` also advances CRM → `in_conversation`.
- **Saved ICPs = localStorage** (`src/lib/saved-icps.ts`) for zero-key demo;
  server persistence can wait until metered multi-user needs sync.
- **Phase D deploy is ops, not missing architecture** — D1/auth/Stripe already
  wired; live path needs `AUTH_SECRET`, Stripe secrets, `cf:migrate` through
  **0007**, webhook URL. Usage bars only appear when `workspace.metered`.

### 2026-07-14 — Table Status = CRM stage; Excel export; Settings on account card
- **Two status models confuse users in the table.** `LeadStatus` (“In review”)
  is email-workflow; Pipeline columns use `crmStage`. Table Status must show
  `CrmStagePill` so it matches the funnel position the user just dragged to.
- **Excel over CSV for export:** `exceljs` (dynamic `import()` on click) gives
  aurora-styled headers, stage fill colors, frozen header, auto-filter — better
  than plain CSV for agency handoff without a server route.
- **Settings belongs on the account card**, not Workspace nav — Search /
  Pipeline / Runs are work surfaces; settings is account chrome. Keep Sign
  in/out as nested buttons with `stopPropagation` so the card can be a Link.
- **Pipeline email badge key was wrong:** `OutreachStatus` uses `"draft"`, not
  `"queued"` — badge map must use `draft` or “Draft ready” never shows.

### 2026-07-14 — Pipeline UX polish + chrome-devtools MCP
- **chrome-devtools-mcp** wired in `~/.cursor/mcp.json` (`npx -y chrome-devtools-mcp@latest`).
  Use it for live DOM/layout/network/memory debugging; keep Playwright for
  scripted smoke. Reload MCP servers in Cursor after config changes.
- **Pipeline bulk actions are column-local:** Draft/Approve on New; Send on
  Contacted. Global bulk bar removed — actions sit next to the work.
- **Not Interested collapses by default** so the main kanban is 4 equal columns
  (more card width). Droppable target still accepts drags when collapsed.
- **Map pins colored by `crmStage`** (mist/amber/aurora/aurora-light/rose) with
  a small legend — same palette as Pipeline column dots.


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

### 2026-07-14 — Go-live wizard; demo fallback kept
Do not delete zero-key fallbacks (constitution Art. I.2). Instead: (1) soften
“demo” copy when `canSearchLive` / `canSendEmail` are true, (2) treat placeholder
`OUTREACH_*` values as incomplete via `src/lib/identity.ts`, (3) first-visit
Getting Started wizard + Settings reopen (`/app?setup=1`). Settings Email delivery
now lists Resend and SMTP separately — Resend was missing from Integrations and
the old SMTP-only footer falsely said “demo” when Resend was already configured.

### 2026-07-14 — Onboarding tour + location pick + search UX
- Wizard jumped to step 3 because it auto-selected the first “incomplete”
  checklist item (search/email already green on prod). Always open on step 1.
- Replaced checklist modal with a coach-mark tour (Search → Pipeline →
  Settings); Settings has a temporary “Replay product tour” button.
- EmptyState image+`from-ink-950` gradient removed from Search — looked like a
  stray overlay under the form.
- Location must be picked from Photon suggestions (or cleared); free-typed
  “barcelona” let FC return Barcelona SC (NY). Also stop stamping search city
  onto every lead; filter scraped geo mismatches.
- Search progress is staged UI only — run is still one blocking request (true
  streaming needs async runs + poll).

Worker logs: `Page changed from static to dynamic at runtime /app, reason:
headers` after magic-link. `auth()`/`getCtx` called `headers()` on a route Next
had prerendered as static → OpenNext 500 (user saw “505”). Fix:
`export const dynamic = "force-dynamic"` on `/app` layout + page; remove
`getCtx` from layout entirely (wizard uses env identity defaults). Prior jwt
try/catch was necessary but not sufficient. Deploy on Windows: `npm run cf:build`
then `$env:OPEN_NEXT_DEPLOY='true'; npx wrangler deploy` (`cf:deploy` hits
miniflare spawn UNKNOWN).

### 2026-07-14 — Magic-link From fix + /app harden + landing
Auth mail From placeholder caused silent Resend rejects (fixed earlier). Post-
login `/app` 505: harden jwt provision (try/catch), recover workspace in
`getCtx` if token lacks `workspaceId`, and never let layout getCtx throw.
Branded magic-link HTML via `src/lib/auth-email.ts`. Landing redesigned with
live product preview (map + pipeline) — dropped missing hero image dependency.

### 2026-07-15 — Leadify rename + Easy send must not fall through to platform Resend
- **Brand:** user-facing “Lodestar” → “Leadify”. Keep internal `lodestar_*`
  storage keys / Resend tags for compatibility.
- **Easy send bug:** when a workspace Maileroo (or Resend) key was set, failure
  or missing preferred key still fell through to **platform** `RESEND_API_KEY`,
  producing Resend’s “domain is not verified” while the UI showed Maileroo.
  Fix: return the BYO Easy result (ok or error); only use platform Resend/SMTP
  when no workspace Easy key exists.
- **API key UX:** never SSR the real secret; show a masked value in the input
  when `has*Key` so the field looks filled.
- **Sender profile:** position/company fields were redundant with the editable
  sign-off textarea — removed from Settings UI (localStorage fields kept).

### 2026-07-15 — Spammy footers were old drafts + placeholder identity
- Emails that still showed `Sent by Your Name <you@yourdomain.com>` + placeholder
  address + `unsubscribe: mailto:…maileroo.org` were **legacy draft bodies** from
  the initial-commit template (footer used to be baked into the draft). Current
  send also appended a second STOP line → double footer.
- Fix: `stripLegacyCompliance()` at send; never emit Sent-by / mailto / placeholder
  address; Maileroo send now tags for `/api/webhooks/maileroo` (peer to Resend).
- Draft regenerate now sends Settings `signature` + `defaultOffer` so sign-off
  matches the profile; templates toned down; nav-junk blurbs skipped.

### 2026-07-15 — Locale drafts + Workers AI for blurbs/pitch
- **Draft language** follows lead `location` (ES/EN/FR/IT/DE/PT) via
  `src/lib/outreach/locale.ts` + multi-copy templates in `draft.ts`. Default EN.
- **Chose Workers AI** over Groq/Gemini: same Cloudflare deploy as D1, no extra
  vendor key in prod (`ai.binding` in wrangler). Local optional
  `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` REST. Demo stays template/heuristic.
- Lead blurbs polished after live search (concurrency 3). Default pitch:
  Settings → website + “Generate from website” → `/api/ai/pitch`.

### 2026-07-15 — Leadify identifiers + natural emails + pitch AI
- Runtime keys/tags renamed `lodestar_*` → `leadify_*` with one-time localStorage
  migration; webhook receivers still accept legacy tags. D1 CF database name
  remains `lodestar-prod` (id-bound).
- STOP / mailing-address footers removed from send path (ADR 0012). User found
  them scammy; constitution Art. I.3 amended.
- Pitch: no heuristic page-sentence fallback (ADR 0013). Cascade Workers AI →
  Groq → Gemini; otherwise clear error. Local needs CF REST or `GROQ_API_KEY` /
  `GEMINI_API_KEY`.
- Contacted-without-method highlighted in pipeline; setting method journals a
  follow-up via `updateLeadCrm`.

### 2026-07-15 — Leads layout + pitch prompt + AI billing notes
- Leads: Export Excel sits next to the title; table/cards/map toggle shares the
  count row. Map fills remaining viewport height; discarded pins hidden; New pin
  color back to mist gray (`#7f92b3`). Outreach Sent is a 4th vertical column.
- Pitch generate for akademo-edu.com regurgitated bilingual homepage slogans
  because the system prompt defaulted to English and didn’t forbid tagline
  paste. Tightened prompt + `outreachLangFromText()` so language follows the
  page and output must be a cold-email offer rewrite.
- Billing: Workers AI = 10k Neurons/day free then ~$0.011/1k on Paid Workers;
  Groq/Gemini only if keys are set (their free tiers apply). Local `.env` has
  neither Groq nor Gemini — prod uses the `AI` binding.

### 2026-07-15 — Excel import + CF secrets checklist
- `LEADS_example.xlsx` used **Opportunity** (not Name) plus Excel hyperlink
  objects and `=+34…` formula phones. Old parser mapped Name→empty company so
  only email rows imported, and websites rendered as `[object Object]`. Prefer
  Opportunity > Company > Name; unwrap hyperlink/formula cells; route import → Leads.
- Re-import skipped the two email rows as workspace duplicates from the first
  broken import; locations were over-shortened. Keep full Address; import mode
  **Current board** merges matches (email/domain) onto the open run and fills
  gaps; **New list** still skips workspace dupes. `displayWebsite` hides junk
  `[object Object]` URLs in UI.
- `wrangler secret list` on Worker `leadgeneration` was missing Gmail/Groq/
  Gemini — deploy does not clear secrets; document checklist in
  `docs/cloudflare-secrets.md`.
- Outreach “Needs draft” removed: search + import already auto-create drafts.
- Pipeline card list: drop `scrollbar-gutter:stable` (it reserved only the
  right edge and looked like uneven padding).

