# Learnings Log

Append dated entries. Newest at top. Keep each entry short and factual.

---

### 2026-07-22 — Leads instant chrome + virtualized table
- Unified Leads toolbar (no remount on hydrate). Skeleton only in body;
  filter lag keeps stale rows (no overlay). `useDeferredLoading(delay≤0)`
  shows sync. Warm Leads revisits skip `leadsBodyReady` blank frame.
  Sidebar nav uses pending view for instant highlight. Table rows windowed
  via `@tanstack/react-virtual` (~2k leads).

### 2026-07-22 — Leads paint-first nav + layout toggle
- Entering Leads paints chrome immediately, then mounts table/cards after rAF
  + transition (skeleton meanwhile). Layout toggle updates highlight sync;
  first-time pane mount is deferred with skeleton. Lite→full hydrate shows
  Leads shell + skeleton instead of empty flash.

### 2026-07-22 — Leads filter/layout UX (deferred + skeletons)
- Search + pipeline filter use `useDeferredValue` so inputs update immediately;
  list catches up with a content skeleton (~100ms). Layout toggle uses
  `startTransition` + cards skeleton; inactive panes freeze leads (no triple
  re-render). Card entrance animation capped to first 12. Removed “Pipeline”
  label beside the stage select.

### 2026-07-22 — Skeleton loading (200ms deferred)
- Replaced spinner-only waits with view-shaped `shimmer` skeletons
  (`src/components/studio/skeletons.tsx`). Shown only after **200ms** so fast
  loads don’t flash. Wired: Studio board load, Dashboard, Boards, Runs, Admin
  platform/users, Map overlay, `/app` + settings route `loading.tsx`.

### 2026-07-22 — Map speed @2k leads + table single scroll
- Map was geocoding **every unique street** via Nominatim (`Promise.all`) —
  normal to hang for minutes at 2k addresses. Fast path: 1× board location +
  jitter, then refine ≤60 city keys with concurrency 3; canvas `circleMarker`.
- Leads table double-scroll: outer `overflow-y-auto` + table `max-h` scroller.
  Table now fills flex slot (`absolute inset-0` / `h-full`); only inner scroll.

### 2026-07-22 — Import skips + studio UX/perf pass
- LEADS.xlsx: **2482** data rows → **2406** unique by normalized company name;
  **76** skipped as same-name duplicates (3 accent/punctuation variants).
  Report: `import-skipped-rows.csv` / `import-skip-analysis.json`.
- Contact method is now **multi-select** (`contactMethods[]`); TEXT column
  stores single value or JSON. Contacted without methods = amber highlight.
- Contacted in Outreach: **Register** (info) instead of draft/approve/send.
- Leads view: keep visited table/cards/map mounted; usage bars centered;
  header search filters leads. Pipeline card click opens info (drag still 8px).
- Dashboard: SQL/`summarizeLeads` aggregates + `?lite=1` board skip leads.

### 2026-07-22 — Outreach CRM sync, phone Ready, settings save race
- Pipeline stages past New (`contacted`…`not_interested`) now count as
  **Contacted** in Outreach (`isContacted`).
- Phone-only leads start in **Ready**; green arrow logs call + opens info
  notes with today selected. No Edit without email.
- Create draft language prefers **lead location/country**, not Settings flag.
- Settings pitch/flag “lost on refresh”: hydrate could overwrite a fresh
  localStorage save; fixed with `updatedAt` + skip stale hydrate + debounced
  autosave + flush on flag switch.
- Lead list default order: `created_at ASC` (import order), not fit DESC.
- Type column read-only in table; niche stopwords include `die`/articles.

### 2026-07-22 — Import dedupe = company name; map drawer under Leaflet
- LEADS→LUMIA gap (~206) was import merge on **website host / email**.
  Aggregators (Instagram, Facebook, Doctoralia, Booksy `help.es@…`) collapsed
  unrelated locations. Import now dedupes on **normalized company name only**.
- Map lead click opened LeadDrawer under the map: Leaflet panes/controls use
  z-index ~600–1000; drawer was `z-50`. Raised drawer to `z-[1100]`.

### 2026-07-22 — Import TYPE + map + `{company}` = “Dra”
- LEADS.xlsx type column is **Categoria** (not Type) — alias list missed it;
  AI sometimes mapped sparse cols. Fix: categoria/tipo aliases + denser-col
  reconcile. Map: Nominatim often fails long street addresses when filter→1
  lead and no city hint — geocode now falls back to city/country tails.
- `{company}` used `shortCompany` split on `. ` → “Dra. Barriga | …” became
  “Dra”. Placeholders now use the full company string.
- Import does **not** scrape; missing Website + business email →
  `websiteFromEmail` invents `https://domain` (AQVA case).

### 2026-07-22 — Bulk-delete still 400 on live
- Client chunking was in git but live still saw **one** oversized POST (Worker
  logs: 400, ~242ms CPU — not N×500 chunks). Hardening: `{ boardId }` set-based
  clear (D1 `DELETE … WHERE board_id`) for full-board wipe; ids path kept as
  chunked fallback. Deploy required for the browser to pick it up.

### 2026-07-21 — Bulk-delete 400 on “select all”
- `/api/leads/bulk-delete` zod-maxes `ids` at **500**. Selecting all on a
  ~600+ lead board POSTed one body → 400; optimistic hide then `refresh()`
  restored rows. Fix: client chunks at 500 with progress; UI already hides
  rows + modal while chunks run.

### 2026-07-21 — Bad import: Gmail companies + invented websites
- Pre-fix import mapped company→empty `Name`, then invented company/website
  from email domain → 132× `company=Gmail` / `https://gmail.com`, hundreds of
  domain-slug names (`Ismet`, `Mohg`). Phones usually matched the email row;
  “wrong phone” cases are mostly **duplicate emails** in the xlsx (multi-site
  brands).
- Fix: never invent website/company from free-mail domains; `domainKey` ignores
  them for merge. Repaired alexxvives D1 from `LEADS.xlsx` (576 rows).

### 2026-07-21 — Fast import + cancel
- Import was slow because each new row did `fetchPublicPageText` + optional AI
  pitch-fit (concurrency 3). Spreadsheet-only path now: score from columns,
  chunk 250, soft progress bar, Cancel aborts fetch + marks run failed.
- Trade-off: no auto about-blurb/phone fill from the site on import (drawer
  enrich / Find leads still can).

### 2026-07-21 — Import “0 / 617” on LEADS.xlsx
- File has ~2482 rows; only **617 have email**. AI mapped `company` → empty
  `Name` instead of `Opportunity` → client kept only email rows → UI showed
  `0 / 617`. Progress stuck at 0 until first chunk finished (was website enrich).
- Fix: prompt + density reconcile (Opportunity beats sparse Name).
- Cursor **IDE** can build that xlsx; Cursor **API** still ≠ in-app search
  (ADR 0020 clarification).

### 2026-07-21 — Invite toast + tour demo cleanup
- Board invite ok copy: just “Invite saved/emailed for {email}.” (no Resend
  troubleshooting blurb).
- Tour demo seed: track lead ids; delete on Skip/Done so sample leads don’t
  stay on the board after the tutorial.

### 2026-07-21 — Cursor API ≠ Firecrawl (ADR 0020)
- Rejected using Cursor Pro / `@cursor/sdk` as Insider scrape/search. Coding
  agents ≠ web search+scrape; subscription ≠ Worker scrape credits.
- Deferred path A: cheap LLM extract on FC markdown; path B (second
  SearchProvider) only if FC cost still hurts after A. No code change yet.
- Having a Cursor **API key** still doesn’t change this — SDK is agents-on-repo,
  not Firecrawl-class search/scrape.

### 2026-07-21 — Find leads: no pause banner; credits ≠ UI disable
- Off: keep Search form, disable Find leads only — no “paused” banner/title.
- On: client must not grey out submit for null/0 Firecrawl credits (looked
  like admin Off). Server still 402s on empty/unavailable pool.
- getWorkspaceSummary error path defaults Find leads On (read DB flag when
  possible); ForbiddenError remains the real pause gate.

### 2026-07-21 — Tour step 4 + sample leads
- Step 4 “missing”: tip used opacity-0 + pointer-events-none until anchor;
  Outreach target often wasn’t ready → blank overlay, can’t Next. Tip always
  visible (centered until spotlight locks).
- Tour auto-seeds offline demo leads (+ drafts) when the board is empty so
  Pipeline/Leads/Outreach show real UI instead of “Your board is clear”.
  Those ids are deleted on Skip/Done (see invite toast + tour cleanup entry).
- `demo: true` bypasses find-leads pause + quota and skips lead-credit burn
  (Load demo / tour seed must work with FC down or Search paused).

### 2026-07-21 — Tour Pipeline/Leads double-paint
- Steps 2–3 felt laggy: tour `push`ed `/app?view=…` without `board`, shell
  immediately `replace`d to add stored board → Studio setLoading → tip
  unmounted/remounted (`animate-float-up` twice). Fixed: tour navigates with
  board filter via `replace`; shell skips inject while tour open; soft-refresh
  after first load; tip fades instead of unmount; empty Leads/Outreach keep
  `data-tour` anchors; scroll measure debounced.

### 2026-07-21 — Insider credits snake_case + stale board lock
- `getFirecrawlRemainingCredits` looked for camelCase `remainingCredits`;
  Firecrawl `/v1/team/credit-usage` returns `data.remaining_credits` (same
  shape the usage badge route already parsed). Insider admin/Settings showed
  “Credits unavailable” despite a live key. Fixed to prefer snake_case.
- Soft lock heartbeat 404 during tutorial: `hermes_active_board` from another
  session was injected into `?board=` before validation. Clear unknown ids
  against `listBoards` before heartbeat; ignore not-found and reset filter.
- Admin Dashboard: removed “Live snapshot of tenants…” subtitle.

### 2026-07-21 — Pre-ship: Import stays, 403, no FC fallback, Stripe cancel
- Find leads off: Search form blocked; Import remains on Search view (no
  redirect / nav hide). `ForbiddenError` → 403 on `POST /api/runs`.
- Insider: null Firecrawl usage → “Credits unavailable” + 402 (never invent
  1000). Admin Users shows shared pool remaining.
- Account delete: best-effort Stripe `subscriptions.cancel`; cascade
  `verification_tokens` + `board_invites` by email; admin typed `DELETE`.
- Admin Settings: no Danger zone. (Summary error path later changed to prefer
  DB Find-leads flag / default On — see entry above.)

### 2026-07-21 — Account deletion, Find-leads toggle, Insider “Leads” meter
- Self-delete: Settings danger zone → `DELETE /api/account`. Admin Users:
  trash → `DELETE /api/admin/users`. Cascades workspace data + Auth.js owner
  (never admin / local workspace).
- `find_leads_enabled` (migration 0025): admin switch; blocks Search form +
  `createAndRunSearch` (ADR 0019). Import stays available.
- Insider usage bar: label **Leads**, show raw remaining
  (`34,258 available`) — UsageBar soft `0/250` was wrong for large FC balances.
- Admin chrome: no Board/Profile pickers; Settings is ops-only (no send/
  profiles). Dashboard: plan donut, 14-day signups, activity bars, top leads.

### 2026-07-21 — Locked-stack doc/code cleanup (no dual verify/search stories)
- Swept stale “Zeruh primary / Firecrawl+Exa dual search / Maileroo Verify as
  product verify” copy. Truth: Firecrawl-only search; MyEmailVerifier primary
  verify (ADR 0016); Zeruh = legacy env only; Exa code already gone (ADR 0017).
- Renamed usage API to `GET /api/providers/verify/usage` (+ thin
  `/zeruh/usage` re-export). Client: `api.verifyUsage` / `VerifyUsage`.
- Removed dead `Capabilities.exa` (always false, zero readers). Kept Zeruh
  verify path in `verify.ts` when `MAILEROO_VERIFY_API_KEY` / `ZERUH_API_KEY`
  set. Non-goals unchanged: Apollo, MillionVerifier, PlusVibe, AI Ark, Prospeo
  until explicitly approved.

### 2026-07-21 — Admin = platform ops; Firecrawl credit discipline
- Admin nav is Dashboard (platform stats) + Users only — no Search/Pipeline.
  Insider: plan dropdown already assigns; “Generate Insider signup link” →
  `/?insider=` token (HMAC, 30d) applied on register.
- Firecrawl: landing scrape (header/footer) → markdown contact links →
  `/contacto` then `/contact` (max 2). No JSON extract / map / about guesses
  (JSON = ~5 credits). Prospeo deferred as extra key overkill.
- Light mode: `.switch-track` + stronger New profile / Delete buttons.
- Settings: Resources moved below Plan & usage. Marketing body → `text-mist-200`.

### 2026-07-20 — Firecrawl deepen + MEV docs truth
- Firecrawl contact deepen + MEV as primary verify (ADR 0016).
- Prospeo spike documented then deferred (2026-07-21).

### 2026-07-19 ? Tutorial skip after signup + invites only on Boards
- Tour ?done? lived in a browser-global localStorage key, so guest Skip
  suppressed the tour after account create. Fix: `hermes_force_tutorial` on
  register + per-user done key; invite redirect after tour (or immediate if
  tour already done).
- Fit scores were always computed; Pipeline cards simply never rendered
  FitMeter ? search lands on Pipeline so scores looked ?missing?.

### 2026-07-19 ? Admin UX: account filter, unmetered, exclude from tenants
- Platform/Users: `select-ink` account filter + `input-ink` search; Studio
  header owns Platform/Users titles (was falling through to ?Search?).
- `listAdminUsers` skips `users.is_admin` workspaces; admin `getCtx` is
  unmetered; Studio hides usage bars when `session.isAdmin`.
- `BOOTSTRAP_ADMIN_PASSWORD` is first-boot only ? once any admin exists,
  `ensureBootstrapAdmin` no-ops; rotate via D1 hash / login, then delete the
  Wrangler secret if set.

### 2026-07-19 ? Audit report execution (steps 1?17)
- Validated Opus AUDIT_REPORT.md against current tree; executed Section 5
  steps 1?17. Key fixes: PII xlsx removed; bootstrap pw from env/random;
  rich-text entity XSS; atomic usage increments; unique workspace owner;
  AUTH_SECRET+D1 fail-closed; smoke bypass off on D1; webhook email fallback
  scoped + Maileroo timingSafeEqual; maxLeads 50; listOutreachByLeadIds;
  board count/lock batching; outreach email index; editOutreach sent guard;
  SSRF URL deny; auth rate limits; Modal+aria-live; Send-all 429 retry;
  workspace outreach_profiles_json; icon diet + matcher.
- History purge of `LEADS (2)*.xlsx` still needs a human `git filter-repo`.
- Prod admin password: rotate D1 `users.password_hash` (or change after login);
  do not rely on `BOOTSTRAP_ADMIN_PASSWORD` once an admin row exists.
- Apply migrations 0021?0024 on remote D1 before deploy.

### 2026-07-19 ? Auth.js middleware overwrites password-login JWT
- `setSessionCookie` on `/api/auth/password-login` worked, but the Auth.js
  `auth()` middleware wrapper re-emitted the *request* session (or cleared the
  new cookie) onto the response afterward ? account switch stayed on
  alexxvives@gmail.com. Fix: skip `auth()` for session-write paths; move login
  to `/api/password-login` (outside `/api/auth/*`). Compat shim kept at old path.

### 2026-07-19 ? /api/auth/password stolen by Auth.js catch-all
- `POST /api/auth/password` hit `[...nextauth]` ? literal `"Bad request."`
  (Auth.js action name). Use `/api/password-login` (outside catch-all). Cookie
  rewrite stays in `session-cookie.ts`.
- Admin pw reset in D1 to bootstrap `password` while debugging.

### 2026-07-19 ? Account switch via /api/auth/password
- Client `signOut` + `signIn` still left `__Secure-authjs.session-token`
  (chunked) as alexxvives on Workers. Fix: password-login clears cookies +
  encodes a fresh JWT.
- D1: `admin@tryhermesmail.com` ? `alexxvives@gmail.com` (magic-link, no pw).

### 2026-07-19 ? Account switch needs hard navigation
- JWT overwrite alone is not enough: after `signIn({ redirect: false })`,
  `router.push` + `router.refresh` leaves NextAuth `SessionProvider` on the
  previous account. Use `window.location.assign(callbackUrl)`.
- On credentials sign-in, clear `token.workspaceId` before re-provisioning and
  always set `token.email` / `token.name` (even when name is nullish).
- Standard search also ranks by fit after one query; Smart?s differentiator is
  multi-query recall (~3� provider credits), not fit ranking itself.

### 2026-07-19 ? Account switch JWT + platform invite mail
- Custom `jwt` callback must set `token.email` / `token.name` on every
  credentials sign-in; otherwise switching to `admin@?` kept the previous
  session email (e.g. alexxvives@gmail.com) in the UI.
- Board-invite mail is **platform** Resend ? optional `MAILEROO_API_KEY` ?
  SMTP ? never workspace BYO keys. Resend `onboarding@resend.dev` only
  delivers to the Resend account owner; production needs a verified from-domain.
- Marketing Sign in opens `AuthModal` overlay (`dismissible`); `/login` and
  unauth `/app` both land on `/?signin=1` (modal), not a separate login page.

### 2026-07-19 ? Invite modal + light pills + info card
- Board Collaborate modal portals to `document.body` (parent `animate-float-up`
  transform broke `fixed` centering) and uses opaque `bg-ink-900`, not `.glass`.
- Invite API returns `emailSent`; UI message reflects whether Resend/SMTP actually
  sent (invite always works in-app under Boards).
- Stage/status chips use `.pill-*` utilities with light-theme colors for paper bg.
- Fit reasons: display strips legacy ?Imported?? and ?In target location (?)?;
  two-column list. About field auto-grows from one line.

### 2026-07-19 ? Studio polish: gutters, editable leads, boards
- Side gutters again ~25% tighter: `px-3 sm:px-5` (Studio + Settings).
- Lead info fields (company, website, emails, phones, location, type, about)
  are editable via bordered inputs + pencil; PATCH `/api/leads/[id]` accepts them.
- Sent/delivery UI sits below To/Subject/Body in the draft drawer.
- No confirm when moving a contacted lead back to New (pipeline + info drawer).
- Board cards: no Default badge / aurora icon; rename pencil on all owned boards
  (incl. default); Invite vertically centered beside Contacted/Closed stats.
- Page subtitles on every studio view + Settings; title?subtitle gap `mt-0.5`.

### 2026-07-19 ? Invite modal, light contrast, content gutters
- Board invite uses a custom modal (not `prompt`) with members + pending list;
  `sendBoardInviteEmail` best-effort via platform Resend/SMTP after invite row.
- Light theme: `--on-accent` white; `.meter-track` outlined bars; divide/border
  white/opacity remapped; soft sky/amber/rose label colors darkened.
- Studio content gutters `px-5/sm:px-8` ? `px-4/sm:px-7` (~15% less).
- Company type in drawer is an `InfoRow` + `BuildingIcon` like other contact fields.
- Sequence Day+3/+7 notes are still not auto-created (only legacy rows remain).

### 2026-07-19 ? Studio-only theme, company type, board sharing
- Light theme applies only on `/app` (boot script + `ThemeProvider`); marketing
  stays dark. Toggle lives top-right in `StudioShell`, not SiteNav.
- Excel import maps headers via alias lists in `ImportLeadsPanel` (`normHeader` +
  first-match). New `companyType` aliases: type/category/industry/?. Firecrawl
  does not classify today; keyword `suggestCompanyType` fills gaps from blurb.
- Leads pipeline filter lives in Studio toolbar (Table/Cards/Map); Pipeline
  column header menu = sort + filter. Notes column always visible.
- Board sharing: invite/accept + soft lock (ADR 0015). Migrations 0019?0020.

### 2026-07-18 ? Light theme + pricing honesty + UI polish
- Theme: `data-theme` + CSS vars in `globals.css` (edit palettes there);
  `ThemeToggle` in SiteNav + studio. Use `text-on-accent` on solid CTAs.
- Pricing: toggle knob clipped (`overflow-hidden` + `translate-x-5`); ?Most
  popular? inline with Pro title; plan bullets match real quotas/features
  (no fake multi-seat / Places-only claims).
- Hero: drop ?HERMES mail? eyebrow; BrandMark `mail` uses `font-brand`;
  preview tick 2800?1400ms; signup no longer asks confirm password.

### 2026-07-18 ? Admin is a hashed user + `is_admin` (no env secrets)
- Migration `0018_user_is_admin.sql`. Admin signs in like anyone else; JWT
  `session.isAdmin` gates layout/APIs. `ensureBootstrapAdmin()` creates
  `admin@tryhermesmail.com` / `password` when no admin exists. Removed
  `ADMIN_EMAIL` / `ADMIN_PASSWORD` from config + Wrangler checklist.
- Marketing: shared `MarketingShell` + `SiteFooter`; landing/how-it-works/
  ethics/deliverability/pricing use one chrome; SiteNav gets a mobile menu.
- Windows deploy gotcha: `opennextjs-cloudflare deploy` can reuse a stale
  `.open-next` ? run `npm run cf:build` then deploy when code changed.

### 2026-07-18 ? Exa runtime fallback + admin Wrangler secrets
- `runSearch` now tries Firecrawl then Exa (not only ?Exa if no FC key?).
- Superseded for admin: was env secrets; now hashed `is_admin` user (above).

### 2026-07-18 ? Appeal pricing cut ($19 / $49 / $99)
- `plans.ts`: Free 50/20/5; Starter **$19**/150/150/15; Pro **$49**/600/600/30;
  Agency **$99**/2k/2k/50. Recreate Stripe Prices to match before checkout.
- Firecrawl dominates COGS; Hobby $19/5k credits ? $0.0038/credit (~$0.005/lead
  with search+scrape). Avoid JSON/Enhanced scrape; keep scrape-after-search.

### 2026-07-18 ? Per-user passwords (+ magic = forgot)
- `users.password_hash` (migration 0017) + `POST /api/auth/register`. Hash =
  PBKDF2-SHA-256 via Web Crypto (`src/lib/password.ts`). Local without D1:
  `data/auth-users.json`. Existing magic-link users with no hash can set a
  password via Create account (same email).
- Magic link kept as ?Forgot password? Email me a sign-in link? (SMTP/Resend).
- Stripe webhook: Dashboard URL = prod only; local needs `stripe listen` in a
  terminal (not an endpoint URL field). Prices in `plans.ts` are SaaS list
  prices with high gross margin at max COGS ? not cost-plus on free tiers.

### 2026-07-18 ? Landing hero + auth/Stripe clarifications
- Duplicate nav CTAs (?Open studio? + ?Sign in?) were confusing; one CTA already
  switches by env. Hero no longer repeats the wordmark ? BrandMark in nav carries
  brand (Article IV).
- Magic link = Auth.js email provider: **Maileroo/SMTP (nodemailer)** when
  `SMTP_*` set, else **Resend**. Password credentials only work for admin (+ any
  email locally). Removing magic link would lock out non-admin prod users.
- Stripe: app has a single `STRIPE_SECRET_KEY` (+ price IDs + webhook secret).
  Prefer test keys locally and live keys only in prod secrets ? swapping one
  secret without matching `price_?` / `whsec_?` breaks Checkout/webhooks. Dual
  env vars (`STRIPE_SECRET_KEY_TEST` / `_LIVE`) are optional later.

### 2026-07-18 ? Password-first login; one marketing CTA
- Prod AuthModal was magic-link-only (`credentialsMode = !authRequired`), so
  ?Sign in? in the nav never showed a password. Fix: password primary on
  LoginForm + AuthModal; magic link secondary.
- Dual nav CTAs (Sign in + Open studio) were confusing ? one CTA: Sign in ?
  `/login` when auth required, else Open studio ? `/app`.
- Production credentials still only accept admin email + `ADMIN_PASSWORD`;
  other users use the magic-link secondary until per-user passwords exist.

### 2026-07-18 ? Financial plan prices live + admin platform/users
- `plans.ts` = Free 75 leads / 30 sends / 5 verifies; Starter $39/400; Pro
  $89/2000; Agency $199/8000. Stripe Prices must be created to match
  (`docs/stripe-setup.md`).
- Admin-only nav: Platform overview + Users (plan, usage, leads/sends, send
  setup). APIs `/api/admin/overview` + `/api/admin/users`.
- Verify ?ok? ? no bounce later ? catch-all, full mailbox, policy changes.

### 2026-07-18 ? HERMES mail rebrand + Free verifies 5/day
- User-facing brand: Leadify/Lodestar ? **HERMES mail** (titles) / Hermes Mail
  (prose). Keep CF ids: D1 `lodestar-prod`, worker `leadgeneration`.
- localStorage primary `hermes_*`; still migrate/read `leadify_*` + `lodestar_*`.
- Send tags write `hermes_ws`/`hermes_outreach` **and** `leadify_*`; webhooks
  read hermes ? leadify ? lodestar.
- **Status vocabulary (unchanged):** lead `rejected` = verify-undeliverable
  cleanup (UI/export ?Undeliverable?), **not** a human reject. `failed` = send
  transport error. **Bounced** = `deliveryStatus` from post-send webhooks only.
- Free plan verifies: **5/day** in `plans.ts` + financial-plan table.

### 2026-07-18 ? Auto Resend delivery webhooks (no user setup)
- End users must not configure Resend webhooks. On BYO key save, call
  `POST /webhooks` with Hermes URL; store `resend_webhook_id` + signing secret
  on the workspace (migration 0016). Verify Svix with that secret (tags ? ws).
- Platform `RESEND_WEBHOOK_SECRET` is optional fallback for platform-key sends.
- Maileroo still optional/manual (no create-webhook API).

### 2026-07-18 ? Admin gate + audit hardening
- Admin: `admin@tryhermesmail.com` + `ADMIN_PASSWORD` (default `password`) via
  Credentials even when magic-link is default. Only that email may call
  set-plan / reset-usage when `AUTH_SECRET` is set (local demo stays open).
- Send: atomic `approved`?`sending` claim; transport errors ? `failed`;
  deliveryStatus monotonic. Email webhooks fail closed without secrets in prod.
- Tracker: `docs/AUDIT.md`.

### 2026-07-18 ? No UI reject; search batch = monthly remaining
- `rejected` is **not** a human ?reject draft? action (no Reject button). Only
  verify-undeliverable cleanup sets it. UI/export label ? ?Undeliverable?.
  Users edit drafts, then approve/send. Failed = send transport error; bounced =
  deliveryStatus.
- Removed Free `FREE_MAX_LEADS_PER_RUN` (10). Batch size options unlock up to
  `min(plan monthly leads, remaining credits)`. Default search size 25.
- New `docs/financial-plan.md` + refreshed `business-plan.md` with proposed
  $0/$39/$89/$199 ladder (not yet synced into `plans.ts` / Stripe).

### 2026-07-18 ? Email status ? bounce; Excel export columns
- Lead `status` **rejected** = verify undeliverable cleanup (not UI reject);
  **failed** = send transport error. **Bounced** is `deliveryStatus`
  (post-send webhook), not Email Status. UI label for failed ? ?Send failed?.
- Excel export: drop Subject + Source URL (usually same as Website); black
  table theme (`TableStyleMedium1`); auto-fit column widths to content.

### 2026-07-18 ? Plan-tiered daily verifies + undeliverable cleanup UX
- Verifies bar is **plan daily quota** (Free **5** / Starter 25 / Pro 50 /
  Agency 100), not the raw MyEmailVerifier remaining balance. Resets midnight
  UTC (`verifiesUsedToday` + migration 0015). Cache hits don?t bill plan or
  provider.
- Undeliverable at send: strip bad email, set lead `rejected` (label
  ?Undeliverable?), friendly toast; lead stays under Leads. This is **not** a
  bounce (`deliveryStatus`). Keep Zeruh as fallback behind MEV ? don?t delete.
- Leads table: status sort = Closed ? In convo ? Contacted ? New ? Not
  interested; status filter; delete via checkboxes + floating bar only (no
  per-row trash). Dev plan override uses `router.refresh()` (no manual reload).

### 2026-07-17 ? Webhook reply ? In Conversation + Pipeline highlight
- `setOutreachDeliveryStatus("replied")` advances CRM to `in_conversation`
  (unless closed / not interested), sets contactMethod email, journals
  ?Reply received?. Pipeline cards with `deliveryStatus === "replied"` get a
  sky highlight + badge; board refreshes every 15s on Pipeline view.
- Resend: `email.received`. Maileroo inbound routing posts `envelope_sender`
  (no `event_type`) ? treat as replied and match by sender email.

### 2026-07-17 ? Draft caret bug was `<label>`; pitch-fit AI scoring
- PitchEditor ?click body ? Bold activates? was `FieldMini` wrapping the editor
  in a `<label>` (browser focuses first button). Use a `<div>` wrapper.
- Contact Draft yellow arrow = approve ? Ready (creates draft first if needed).
- Fit: drop ?Imported from your file?; location reason is just ?In target
  location?. Optional AI `scoreLeadPitchFit` boosts using active profile pitch
  + lead blurb (Workers AI/Groq ? tiny tokens). Import enrich uses **plain
  fetch** of the website (`preferPlain`), not Firecrawl ? scrape credits are
  the real cost at volume, not LLM tokens.

### 2026-07-17 ? Verify UI polish; no auto follow-up stubs on send
- Verifies bar fills **up** with used credits (`used / softFull`), same direction
  as Leads/Sends ? not remaining-credits shrinking.
- Drop duplicate MEV credit badge + top-of-screen ?Verifying??; keep verify
  feedback on the outreach card / drawer only. Settings verify = toggle only.
- Mailbox age is a compact dropdown beside From email (no long warmup blurb).
- Send journals only ?Email sent? ? do **not** auto-create Day +3/+7 Sequence
  follow-up stubs (user adds follow-ups intentionally).

### 2026-07-17 ? MyEmailVerifier wired; X-API-Key send error
- Verify prefers `MYEMAILVERIFIER_API_KEY` (validate_single + getcredits); Zeruh
  is fallback. Credits show on the Verifies usage bar.
- Exact error ?invalid API key ? X-API-Key header? is **Maileroo/Zeruh auth** ?
  usually a verify key pasted into Settings ? Maileroo **Sending** key, or MEV
  key put in `MAILEROO_VERIFY_API_KEY`. Verify auth failures fail-open (never
  block send); Maileroo send errors now hint at the Sending Key mix-up.
- Free MEV credits need phone verification on their dashboard.

### 2026-07-16 ? MyEmailVerifier vs Zeruh free tier
- MyEmailVerifier advertises **100 free API credits/day** (no card) ? ~3k/mo ?
  far above Zeruh?s ~100/mo. Now preferred via `MYEMAILVERIFIER_API_KEY`.

### 2026-07-16 ? Draft buckets, profile picker, pitch breaks
- Contact Draft keeps unapproved drafts (`Create` ? `Review`); Ready = approved
  only. Closing the draft drawer without Approve must not advance the column.
- Sidebar `ProfilePicker` (next to Board) is the active outreach profile; removed
  the ?drafts use this profile?s current pitch? banner.
- `resolveDraftLang` / `primaryPitchLang` prefer the `en` (Settings) slot ? do
  not jump to a stale `es` pitch because content was detected as Spanish or the
  lead is in Catalonia.
- contenteditable: first line is often a bare text node + later `<div>`s ?
  sanitize must insert `<br>` before those blocks or preview concatenates lines.
- Mailgun Validate (and similar) are not free at volume; Zeruh is wired today;
  MyEmailVerifier is the next candidate (see entry above).

### 2026-07-16 ? Zeruh toggle, pitch `<br>`, profile freshness
- Zeruh verifies **emails** (deliverability), not domain DNS. Workspace
  `emailVerifyEnabled` (migration 0014) gates send-time verify; Settings ? Easy
  shows the toggle + remaining-credits bar beside Leads/Sends.
- Free Zeruh: ~250 signup + ~100/mo; paid ~$0.003?0.008/verify at peers
  (NeverBounce/ZeroBounce). Platform key today ? BYO per user is optional later.
- Preview CSS `br { display:block; content:'' }` collapsed line breaks ? removed.
- Search profile picker must call `setActiveOutreachProfile` so Create draft uses
  the current pitch, not a stale Settings activeId / run.offerNotes.

### 2026-07-16 ? Studio UX polish + relevance-first fit
- Discarded CRM stage removed ? delete covers bad leads; `normalizeCrmStage`
  maps legacy `discarded` ? `not_interested`.
- Outreach Contact Draft mirrors Ready controls (Create + amber arrow); card
  click ? draft drawer, info icon ? info. Pipeline no longer has Draft all.
- Fit score: niche/location spine; contactability scaled down when relevance
  is weak (no free points for ?search hit?).

### 2026-07-16 ? Fit score from zero + delete vs stuck import
- Fit score must not give a free ~40 for ?appeared in search?; start at 0 and
  score contactability + niche token hits + location (`scoreImportedLead` for CSV).
- Bulk delete must abort client import + mark running import runs failed, or a
  leftover CSV upload can recreate leads after ?board is clear?.
- “Skipped N unchanged” = same company name already in workspace with no new
  fields — not “file empty”. (Was email/website until 2026-07-22.)

### 2026-07-16 ? Rich pitch HTML + From ? sign-off
- Pitch editor HTML (`b`/`i`/`u`/lists) is preserved in `generateDraft`, Settings
  preview (`dangerouslySetInnerHTML` + sanitize), LeadDrawer composer
  (`PitchEditor`), and send (`html` + `text` via `richToPlain`).
- Inbox **From name** must not rewrite outreach-profile sign-off; drafts only use
  profile signature / `run.senderName` ? never `env.fromName()`.
- Saved API-key mask: eye must not clear the field (can?t reveal server secrets);
  show mask as `type=text` with a longer bullet string so length isn?t confusing.

### 2026-07-16 ? Contact Draft flow + template-only bodies
- Outreach: **Contact Draft** (undrafted) ? **Ready to Contact** (has draft) ?
  Contacted. Header **Create Draft** drafts undrafted; Send click promotes
  draft?approved then sends (still per-lead human gate).
- `generateDraft` template path no longer prepends locale greeting or falls
  back to `defaultPitch` / scraped opener ? empty profile pitch ? empty body
  (+ sign-off). Auto-draft only when `autoDraft === true`.
- Import speed: `updateLeads` batch + `countLeads`; client chunk 80 + empty
  finalize ping. Stuck `running` imports healed on `GET /api/runs` after 5m.
- Map stays mounted (hidden) on Leads so Leaflet/geocode warm before Map tab.

### 2026-07-16 ? Contacted queue, AI personalize, import progress
- Outreach third column is **Contacted** (not Sent): email sends + phone /
  contact-form logs. No-email rows get **Log contact ? Called / Form**.
- Settings: ?Email body template? + checkbox **AI personalize each email**
  (`aiPersonalize`). Unchecked = template as-is (placeholders only). Checked =
  Workers AI/Groq/Gemini rewrite per lead (falls back to template if no AI).
- Preview flag: missing language versions auto-translate via `/api/ai/translate`
  (subject + body). Subject is per-language (`subjects[lang]`).
- Import: chunked (40 rows) with progress modal ? redirect to **Leads**. No
  auto-draft (was leaving runs `running` on timeout). Stuck import runs healed
  after 15m. Maileroo shared/trial domain ? spam is expected; need own domain +
  SPF/DKIM/DMARC.

### 2026-07-16 ? Outreach UX batch (profiles, bulk delete, webhooks UI)
- Search toolbar: Standard/Smart � lead count � profile `Select` (`.select-ink`)
  in one row. Settings profile: single name field + chevron switcher (not two boxes).
- Sales pitch `<label>` wrapping the ?Generate from website? button caused label
  clicks to open the URL strip ? use a `<div>` + only show prompt on that button.
- `{lead_name}` resolves to `contactName` or **company** (many leads lack a person
  name). Prefer `{company}` in subjects. Pitch supports light HTML (bold/lists) ?
  plain at send; `staticBody` skips opener/stock CTA.
- Delivery webhooks already live (`/api/webhooks/maileroo|resend`); Settings Easy
  panel now shows copyable webhook URL. Maileroo also maps `bounced`.

### 2026-07-16 ? Zeruh verify at send only + credit badge
- Dropped enrich-time `filterVerifiableEmails` (search). Verify runs **once at
  send** so Excel imports share the same gate and we burn ~1 credit per send,
  not 1?3 per lead found. UI shows ?Verifying email?? while send is in flight.
- Zeruh credits badge mirrors Firecrawl: `GET /api/providers/zeruh/usage`
  (account permanent + recurring). Free tier (~100/mo) is fine for dogfood;
  buy credits for volume.

### 2026-07-15 ? Outreach profiles + pitch language versions
- Settings is now **Outreach profiles** (list): each profile has pitch *versions*
  per language (`pitches[lang]`). Preview flag switches which version you edit;
  never substitutes a sample dental pitch for another language.
- Windows shows emoji flags as `GB`/`ES` ? use flagcdn PNG icons instead.
- Search: pick a profile or ?No profile?; `autoDraft: false` skips draft creation
  so leads land in Review without outreach (Draft button on the card).
- Verify key: `MAILEROO_VERIFY_API_KEY` (alias `ZERUH_API_KEY`) is **list hygiene**
  (Zeruh API), independent of Resend/Gmail *send*. Get it from Maileroo ? Email
  Verification / Zeruh dashboard (https://zeruh.com or maileroo.com).

### 2026-07-15 ? Outreach preview languages + search polish
- Settings email preview defaults to English; flag menu switches ES/FR/IT/PT/PL/DE.
  *(Superseded for pitch: use per-language pitch versions, not sample swap.)*
- `{lead_name}` = contact first name; `{company}` = company ? use `{company}` in
  subject templates for ?Propuesta para Bright Dental? style subjects.
- Email verify (Zeruh) runs at send (`verifyEmail`); needs
  `MAILEROO_VERIFY_API_KEY` / `ZERUH_API_KEY`. *(Enrich-time verify removed
  2026-07-16 ? send-only.)*
- Animated icon libs (`lucide-animated` / `lucide-react-motion`) need `motion` and
  are fine for client components; keep custom `icons.tsx` for now and adopt
  selectively later (nav + Find CTA) rather than a blanket swap.

### 2026-07-15 ? Studio chrome + lead columns
- Unified studio/settings top padding (`pt-6`/`sm:pt-8`) so Pipeline no longer
  sits higher than Dashboard/Boards. Shared `<Select>` (`.select-ink`) for
  native dropdowns. Lead delete + `customFields` (migration `0013`); column
  defs/visibility stay in localStorage. Draft emails are template-based
  (`generateDraft`), not LLM ? Settings ?Sales pitch? maps to `offerNotes`.

### 2026-07-15 ? Duplicate Default boards = race without unique index
- Concurrent `ensureDefaultBoard` calls created two `is_default=1` rows; migration
  0011 only had a non-unique index. Fix: dedupe in service + `0012` partial
  unique index on `(workspace_id) WHERE is_default = 1`. Sidebar board filter
  must travel in nav URLs ? otherwise Leads/Pipeline silently show ?all?.

### 2026-07-15 ? Boards migration must land before UI
- Shipping ADR 0014 code without `npm run cf:migrate` makes every
  `/api/boards`, `/api/board`, `/api/dashboard`, and board-aware import return
  `D1_ERROR: no such table: boards` (browser shows opaque 500s). Always apply
  remote D1 migrations in the same release window as schema-dependent deploys.

### 2026-07-15 ? First-class Boards (ADR 0014)
- `Board` entity + `Lead.boardId` / `Run.boardId`; Default board auto-created
  per workspace; orphans back-filled via `ensureDefaultBoard`.
- Sidebar: Dashboard (top), Boards nav, board picker above account (All =
  default filter). Search/import open `BoardAssignModal` (no inline Current/
  New list). Migration `0011_boards.sql`.

### 2026-07-15 ? Settings save false-positive + send path bugs
- Root cause of ?Maileroo not saving?: `getCtx` could scope D1 to workspace
  `"local"` under auth ? UPDATE 0 rows while API returned `{ ok: true }`. Fixed
  with fail-closed `AuthError` + `NotFoundError` when `updateWorkspace` is null.
- Empty inactive key fields wiped the other provider on PATCH ? now dirty-only
  (+ explicit clear flags). Secrets never SSR?d; form uses `has*Key` flags.
- `preferredSendPath` (migration 0010): Google only when path is Pro. Metered
  demo sends no longer mark Contacted. Magic link requires successful `signIn`.

### 2026-07-15 ? Easy Maileroo send + safe test guidance
- ADR 0011: Easy path is Resend **or** Maileroo BYO key (`mailerooApiKey` +
  `easyEmailProvider`). Verify (Zeruh) stays separate from Maileroo send.
- Migration `0009_maileroo_send.sql` for D1; JSON store normalizes defaults.
- Safe E2E testing: leave sends in **demo/simulate** (no BYO key / no Google
  connect), or send only to addresses you own. Never blast fake lead emails
  from personal Gmail or a production domain.

### 2026-07-15 ? Google mailbox OAuth E2E (local)
- Env: `GMAIL_OAUTH_CLIENT_ID` / `SECRET` ? Connect Google enabled in Settings ? Pro.
- Flow: `/api/mailbox/google/start` ? consent ? callback stores AES-GCM refresh
  token on workspace (`connectedMailbox`); send prefers Gmail over Resend.
- Warmup self-report (age + volume) at connect ? soft daily recommend (UI).
- **Hostinger/GoDaddy:** registrar doesn't matter for Resend ? user pastes
  SPF/DKIM/DMARC at wherever DNS is hosted; Resend never needs the registrar
  account. Same for Cloudflare/Namecheap.
- **Pro ? Hostinger/Zoho mail:** Pro OAuth is Google Workspace / Microsoft 365
  only. Zoho/Hostinger/cPanel mailboxes ? Easy (Resend) + domain DNS. No
  Hostinger OAuth ? they aren't a Gmail-style send API.
- Prod still needs Wrangler secrets + D1 migration 0008.

### 2026-07-15 ? ADR 0010 accepted + studio UX fixes
- **ADR 0010 accepted:** Google mailbox OAuth first; multi-inbox deferred.
  Warmup: free = slow manual ramp; automated networks are paid ? no free
  durable warmup product to rely on; no in-house network.
- **Bug:** `newId` used Node `crypto.randomUUID` ? broke client notes in
  LeadDrawer (local + prod). Fixed via `globalThis.crypto.randomUUID`.
- **UX:** removed Outreach ?Before real inbox delivery? banner ? simulate
  confirm modal on send when no provider; pipeline columns shorter; parked
  stages collapsed by default; lead info drawer centered; Easy/Pro toggle
  right-aligned on Settings.

### 2026-07-15 ? Easy send path shipped (P0) + mailbox ADR proposed
- Deleted root `SKILL.md` (data-scraper-agent) ? wrong stack; noted in roadmap.
- Settings: Easy (Resend wizard) vs Pro (coming soon) via `SendSetupPanel`.
- Live DNS: `fetchResendDomainHealth` + `POST /api/providers/resend/domain-health`;
  Domain health is the Sending hero (copyable SPF/DKIM + DMARC hint + poll).
- Webhooks: Resend tags `lodestar_ws` / `lodestar_outreach`; fallback
  `findLatestSentByEmail` (cross-workspace). ADR **0010** proposed for OAuth ?
  do not implement until accepted.
- Sequence templates remain Day+3/+7 HITL stubs (P1 polish later).

### 2026-07-15 ? Dual send plan + agent scrape tooling
- **Push policy:** user wants commit+push every meaningful change.
- **Plan:** `docs/roadmap-send-paths.md` ? Easy=Resend+DNS guide; Pro=Google/
  Microsoft mailbox (ADR first). OSS backlog ranked P0?P2.
- **gstack `/scrape`:** Claude Code browser extract skill ? useful for agent QA,
  not Lodestar production search (we use Firecrawl/Exa).
- **Root `SKILL.md` data-scraper-agent:** wrong stack (Python/Actions); don?t
  adopt for product scraping ? **file removed**.
- **Leads UX:** centered Export/layout toggles; table viewport-capped scroll.

### 2026-07-15 ? Cold email infra reality + OSS notes
- **CI:** `.github/workflows/ci.yml` is live; push `e8b4512` ? Actions success.
- **Smartlead ? Resend:** competitors send through **warmed Google Workspace /
  Microsoft 365 inboxes** (OAuth/SMTP). User still configures DNS (SPF/DKIM/
  DMARC) on their domain; tools guide + check, they don?t silently own the
  registrar. Claimed ?automatic DNS? usually means: buy domains via partner,
  show copy-paste records, poll until verified, plus mailbox warmup.
- **OSS inspiration:** [Wu-Wei-Mail](https://github.com/LuiHedlund02/Wu-Wei-Mail)
  (multi-inbox SMTP + IMAP replies; warmup still hard); OutreachStud-io
  (planned DNS checks / rotation ? code early); PaulleDemon Email-automation
  (templates/follow-ups, BYO SMTP). Lodestar should stay HITL + BYO sender;
  mailbox-connect is a later product bet, not a Resend feature toggle.
- **UI:** Outreach + Pipeline columns use `100dvh` height; Pipeline cards are
  whole-card drag with circled-i info (no grip / advance arrow).

### 2026-07-15 ? Outreach UX + send 400/409 + P1 bets
- **Send 400 then 409:** Resend/provider failure returned 400 and used to set
  outreach `failed`; retry then 409 (not approved). Now keep `approved` + store
  error so retry works after fixing domain/key.
- **Setup:** verified From domain in Resend + API key (platform or workspace).
- **Outreach UI:** 3-column Needs/Review/Ready; section batch buttons; Edit =
  draft-only drawer; ? = lead info (no composer).
- **P1:** sequence Day+3/+7 notes on send; `/api/webhooks/resend`; cross-run
  dedupe; Settings domain-health checklist; `RESEND_WEBHOOK_SECRET` in
  `.env.example`.

### 2026-07-15 ? Studio IA + enrichment polish + competitor backlog
- **Nav:** Leads (`?view=leads`) and Outreach (`?view=outreach`) tabs; Pipeline
  is kanban-only. Search mode sits left of leads-to-find.
- **Drawer:** CRM stage pill (not ?In review?); dated Notes journal; full
  address shown; Source URL removed from fit reasons.
- **Enrichment:** privacy/consent blurbs filtered; prefer meta description;
  intl street regex; demo leads get street addresses; table shows short city.
- **Skills:** accessibility, adr-skill, dogfood, acquire-codebase-knowledge
  copied into `.cursor/skills/` (SkillRepo CLI needs a key for auto-sync).
- **Backlog:** `docs/decisions/competitor-features-2026-07.md` (Smartlead etc.).

### 2026-07-15 ? CI, verify path, Resend?Maileroo, pipeline parked flat
- **GitHub Actions** `.github/workflows/ci.yml` ? `tsc` + lint on push/PR.
- **ADR 0009:** Resend = send; Zeruh (Maileroo Verify) = verify
  (`MAILEROO_VERIFY_API_KEY`). Filter on enrich; block undeliverable on send.
- **Pipeline:** Not Interested + Discarded are peer columns (no nested Parked).
- **Selects:** `.select-ink` + `color-scheme: dark` for option menus.
- **Skills:** see `.cursor/skills/lodestar-agent-boosters` + SkillRepo links
  (accessibility, ADR, dogfood).

### 2026-07-15 ? Pipeline polish, Discarded, dev plan override
- **Pipeline cards:** vertical centering via `items-center` + content
  `justify-center`; column scroll needs outer `max-h` + body `min-h-0
  overflow-y-auto` (flex children otherwise grow and clip).
- **Card subtitle** was `tags[0]` = first niche word ? looked like a wrong
  category. Now email ? location ? website. Tags still niche phrase + city.
- **aboutBlurb** = first usable sentence from scraped page content / meta
  description (`extractBlurb`); often SEO junk ? filter cookie/nav openers.
- **Discarded** CRM stage sits beside Not Interested under Parked (bad-fit
  leads vs prospect declined). No DB migration ? `crm_stage` is free TEXT.
- **Dev mode** can force plan via `POST /api/workspace/set-plan` (no Stripe).

### 2026-07-15 ? Tour v2, local settings, deliverability research
- **Tour:** separate pipeline-board + leads-table steps; tip waits until
  anchored (no center flash); Resend step = BYO domain, tip prefers left;
  confetti bursts from sides.
- **Localhost:** `ensureLocalWorkspace` so Sending identity is editable on
  JSON store; usage bars shown (tracked, not hard-capped) ? explains why they
  were missing (`metered === false` hid them).
- **Do not** give clients a shared Lodestar send domain ? burns reputation;
  Resend BYO is correct for v1; cold scale later = warmed Google/MS inboxes
  or Instantly/Smartlead (see `docs/email-providers.md`).
- **AGENTS.md #8:** commit and push after every meaningful change (for now).

### 2026-07-15 ? Tour polish, LUMIA sign-off, click-select pipeline
- **Stale `.next` chunks** ? 404 on `app-pages-internals.js` after heavy HMR;
  fix is delete `.next` + restart `npm run dev` (hard refresh).
- **Tour:** smarter tip placement (above/below/side), scroll-into-view,
  progress dots, Resend step, confetti on finish.
- **Sign-off:** profile builds `Name / Role | Company / site`; drafts use that
  block; mailing address appended at send only when lead location looks US.
- **Pipeline:** drag to move stages; Approve all lives only on Outreach
  (one toast with count). Draft all stays on New column.

### 2026-07-14 ? Search lead-count, quieter compliance, Spanish drafts
- **`maxLeads` on CreateRunInput** ? UI offers 5/10/15/25; Free capped at
  `FREE_MAX_LEADS_PER_RUN` (10) + monthly credits; paid uses `MAX_LEADS_PER_RUN`
  (default now 25).
- **Drafts no longer embed the scammy ?Sent by? STOP?? block.** Editable body
  stays human; a quiet address + opt-out line is appended only at send time
  (`complianceFooter` in `sendApprovedOutreach`).
- **One name field:** Sending identity ?Your name? syncs to localStorage
  `displayName` for draft sign-off; Outreach profile no longer asks again.
- **Reply-to ? CC.** Reply-to routes replies; CC on cold outreach hurts
  deliverability ? keep sharing threads after they reply.
- **Physical address** remains for CAN-SPAM / ready-to-send checklist, even
  though the draft UI no longer shows the verbose footer.

### 2026-07-14 ? Phase C + D product code (roadmap complete)
- **Bulk send removed from Pipeline.** Roadmap ?per-lead send? means Approve
  can be bulk/selected; Send stays in the drawer only (Art. I.1).
- **`deliveryStatus` on Outreach** (`unknown|sent|bounced|replied`) is the
  stub for future Resend webhooks ? same field, no schema churn. Marking
  `replied` also advances CRM ? `in_conversation`.
- **Saved ICPs = localStorage** (`src/lib/saved-icps.ts`) for zero-key demo;
  server persistence can wait until metered multi-user needs sync.
- **Phase D deploy is ops, not missing architecture** ? D1/auth/Stripe already
  wired; live path needs `AUTH_SECRET`, Stripe secrets, `cf:migrate` through
  **0007**, webhook URL. Usage bars only appear when `workspace.metered`.

### 2026-07-14 ? Table Status = CRM stage; Excel export; Settings on account card
- **Two status models confuse users in the table.** `LeadStatus` (?In review?)
  is email-workflow; Pipeline columns use `crmStage`. Table Status must show
  `CrmStagePill` so it matches the funnel position the user just dragged to.
- **Excel over CSV for export:** `exceljs` (dynamic `import()` on click) gives
  aurora-styled headers, stage fill colors, frozen header, auto-filter ? better
  than plain CSV for agency handoff without a server route.
- **Settings belongs on the account card**, not Workspace nav ? Search /
  Pipeline / Runs are work surfaces; settings is account chrome. Keep Sign
  in/out as nested buttons with `stopPropagation` so the card can be a Link.
- **Pipeline email badge key was wrong:** `OutreachStatus` uses `"draft"`, not
  `"queued"` ? badge map must use `draft` or ?Draft ready? never shows.

### 2026-07-14 ? Pipeline UX polish + chrome-devtools MCP
- **chrome-devtools-mcp** wired in `~/.cursor/mcp.json` (`npx -y chrome-devtools-mcp@latest`).
  Use it for live DOM/layout/network/memory debugging; keep Playwright for
  scripted smoke. Reload MCP servers in Cursor after config changes.
- **Pipeline bulk actions are column-local:** Draft/Approve on New; Send on
  Contacted. Global bulk bar removed ? actions sit next to the work.
- **Not Interested collapses by default** so the main kanban is 4 equal columns
  (more card width). Droppable target still accepts drags when collapsed.
- **Map pins colored by `crmStage`** (mist/amber/aurora/aurora-light/rose) with
  a small legend ? same palette as Pipeline column dots.


### 2026-07-14 ? Auth edge split, lockfile, Studio modularize, docs hygiene
- **Email providers must not live in `auth.config.ts`.** Auth.js asserts an
  adapter whenever an email/magic-link provider is registered. Middleware uses
  the edge config with no adapter ? `MissingAdapter` spam whenever
  `RESEND_API_KEY` is set locally. Fix: Credentials-only on the edge; Resend +
  Nodemailer only in `auth.ts` **and only when a D1 adapter exists**.
- **`package.json` / `package-lock.json` must stay in sync for Cloudflare.**
  CF builds use `npm ci`. Adding `@dnd-kit/*` + `leaflet` to `package.json`
  without regenerating/committing the lockfile fails install with "Missing: ?".
- **Studio split:** keep orchestration in `Studio.tsx`; Pipeline kanban ?
  `PipelineView.tsx`, runs list ? `RunsView.tsx`, empty/layout chrome ?
  `StudioHelpers.tsx`. Dead `AccountMenu.tsx` removed (sign-out is in shell).
- **Docs inventory:** keep all ADRs (superseded 0003 is history, not clutter).
  Keep `business-plan.md` (strategy) vs `commercialization.md` (build) separate ?
  cross-link only. No merge of email-providers into how-it-works.
- **Chrome DevTools for agents** (Chrome 150+ / chrome-devtools-mcp): memory
  snapshots, extension mgmt, bundled skills, URL allow/block patterns. Useful
  for agent UI debugging when Playwright alone isn't enough ? see
  https://developer.chrome.com/blog/new-in-devtools-150/#devtools-for-agents

### 2026-07-14 ? CRM stage model + Pipeline dnd-kit + follow-ups + location autocomplete
- **CRM stage is a separate field from email-workflow status.** `LeadStatus`
  (queued/approved/sent/?) drives the email flow; `CrmStage` (new/contacted/
  in_conversation/closed/not_interested) drives the Pipeline kanban. The two
  concerns are fully independent ? both live on the Lead.
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
  it with `import type` ? keeps the type colocated with the API that produces it.
- **Unicode curly quotes inside TypeScript string literals break the parser.**
  `"` (U+201C) and `"` (U+201D) are treated as string terminators by the tsc
  parser, not as ordinary characters. Fix: use ASCII `"` or single-quote strings.
- **`followUps` stored as JSON TEXT in D1** (same pattern as `emails`, `phones`,
  etc.). The `parseFollowUps` helper in `d1-store.ts` deserialises safely.

### 2026-07-14 ? Codebase + docs audit

- **`docs/commercialization.md` was actively misleading.** It was written when
  Supabase was the planned stack (before ADR 0005 switched to D1/Auth.js). The
  copy-paste prompt inside it said "Auth + DB: Supabase" ? an agent following it
  would build the wrong thing. Rewritten to reflect the actual D1/Auth.js stack
  and current phase status (all four commercial phases built; only deployment
  remains).
- **`GET /api/outreach` does not exist** ? the route file only has `POST`. No
  dead route to clean up. `listOutreach()` exists on `LeadRepository` but is not
  exposed to the client, which is correct (board data comes through `/api/board`).
- **"New" pipeline column is intentionally always empty.** Auto-drafting during
  the run moves every lead from `new` ? `queued` immediately. This is a known
  UX quirk documented now in `how-it-works.md` �3. The fix (when desired) is a
  separate `crmStage` field on Lead that the user advances manually ? keeping the
  email-workflow status (`queued/approved/sent`) separate from the CRM stage
  (`New/Contacted/In Conversation/Closed/Not Interested`).
- **Improvement backlog recorded.** Top items: location geo-picker (multi-select
  country/city), CRM stage model (prerequisite for drag-and-drop + follow-ups),
  bulk draft/approve, lead notes, saved ICPs, Outreach tab consolidation into
  Pipeline, keyboard shortcuts in the drawer.

### 2026-07-14 ? Phase A finish + Phase B lead quality
- **Sender name is API-safe via the Run, not localStorage.** Added `Run.senderName`
  (types ? both stores ? migration `0004`). The client puts the sender-profile
  `displayName` into the create-run payload; `generateDraft` reads `run.senderName`.
  The compliance footer keeps the **env** from-identity (`OUTREACH_FROM_*`) ? only the
  sign-off is personalized. Keeps constitution Art. III.5 (no secrets/localStorage on
  server) intact and makes re-drafts consistent.
- **"Open run on board" = pin an `activeRunId` and overlay it in `refresh()`.** The
  board API still returns the latest run + capabilities/workspace; when a run is pinned
  we fetch `/api/runs/{id}` and overlay `{run, leads}`. A new search / demo / clear
  resets the pin. Avoids a second board endpoint.
- **Better company names:** many scraped titles are page names ("Contact Us", "Home").
  Split the title on separators, skip a generic-segment set, take the first brand
  segment, else prettify the domain base. Existing saved leads keep old names ? only
  new runs benefit (naming happens at enrich time).
- **Email hygiene** lives in `extractEmails`: plausibility (single @, dotted 2?24 TLD,
  no edge/double dots), disposable-domain + no-reply/junk filtering, and personal-
  before-generic (`info@`, `hello@`) ranking so the most contactable address is primary.
- **`City, ST` needs a real region code.** Validating the 2-letter code against a
  US/CA set removes prose false-positives ("Learn, MO?") that were polluting map pins.
- **`npm run smoke` aborts natively on Windows** (`Assertion failed:
  !(handle->flags & UV_HANDLE_CLOSING)`, libuv async.c) on the **2nd** `fetch` ?
  localhost *and* 127.0.0.1, with/without `--experimental-strip-types`. It's a Node/
  undici keep-alive teardown bug, not app code (create-run + all executed asserts pass;
  the browser hits `/api/board` fine). Verified the flow via Playwright + in-page
  `fetch` instead. TODO: give the harness a no-keep-alive dispatcher.

### 2026-07-14 ? Funnel UX + map Playwright proof + credit copy
- Map blank was Leaflet remount + tile CDN fragility; Playwright confirmed fix
  (tiles + 11 markers). OSM tiles used instead of Carto-only.
- Firecrawl remaining can exceed monthly plan allotment (rollovers) ? never render
  as `remaining / plan left`; show `N credits left � plan/mo`.
- Marketing Sign in ? Open studio. Sidebar gained Pipeline / Runs / Export / Help.
- Strategy recorded in `docs/roadmap-next.md`: features/funnel before more UI MCPs.

### 2026-07-14 ? UX pass: nav consistency, sidebar, map, Maileroo-first, Firecrawl formats
- Shared `SiteNav` on landing/pricing/login; studio uses `StudioShell` sidebar with
  hover-animated icons. Auth modal gates "Open the studio" (guest continue in demo).
- Leads default to **table**; added **Map** view (Leaflet + Nominatim geocode of
  search location, jittered pins ? leads only store a location string today).
- Firecrawl search no longer sends `scrapeOptions.formats` on `/v1/search` (that
  path was returning format validation errors); search first, then `/v1/scrape`
  markdown for top hits.
- Email preference aligned with `docs/email-providers.md`: **SMTP/Maileroo first**,
  Resend optional. Magic-link Nodemailer provider registered in `auth.ts` (server);
  sender.ts tries SMTP before Resend.

### 2026-07-14 ? Commercial build (Phases 1?4): auth, workspaces, plans, Stripe, deploy
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
- **`nodemailer` had to bump 6?7** to satisfy `@auth/core`'s peer range.
- **Metering is gated on the D1 binding** (`metered = !!binding`), NOT on auth ?
  guarantees the JSON-store/demo path is always free + unmetered (Art. I.2).
- **Stripe webhook uses `constructEventAsync`** (Web Crypto) over the raw
  `req.text()` body; App Router needs no body-parser opt-out (that's Pages Router).
- Service functions now take a `Ctx { db, workspaceId, metered }`; `getCtx()`
  (src/lib/request-context.ts) is the single place that resolves the binding +
  session ? scoped repo. See ADRs 0006/0007/0008.

### 2026-07-14 ? Switched from Supabase to Cloudflare D1 + Auth.js (ADR 0005)
Supabase was chosen in ADR 0003 for "auth + DB in one". Revisited immediately
when it became clear the lead dev already uses Cloudflare D1 + Auth.js on
another project, eliminating the learning-curve advantage of Supabase. Key
findings: (1) RLS is defense-in-depth, not the primary isolation mechanism ?
service-layer workspace scoping is. (2) D1 reads are faster at the edge than
single-region Postgres. (3) Staying 100% Cloudflare reduces vendor count.
SQLite array limitation: `emails[]` etc. serialised as JSON TEXT ? handled
transparently in `d1-store.ts` with `JSON.parse/stringify`. `getDb(binding?)`
is the injection point; no binding ? JsonStore (local/demo unchanged).

### 2026-07-14 ? Phase 0 Supabase swap: selection is env-driven, JSON is default
`getDb()` now returns `SupabaseStore` only when `SUPABASE_URL` + a Supabase key
are set (`config.ts::databaseProvider()`), else `JsonStore`. This keeps zero-key
demo/offline mode intact. Repository behaviors are mirrored exactly (listRuns =
newest first via `order created_at desc`; listLeads = `order fit_score desc`).
Timestamps are `timestamptz` normalized back to ISO in the mapper. Phase 0 has
**no `workspace_id` and no RLS** ? the server uses the service-role key (bypasses
RLS); RLS + workspaces are Phase 1. `outreach.lead_id` is `unique` so
`getOutreachByLead` stays a safe single-row lookup. Note: OpenNext/Workers can't
use the `fs`-based JSON store ? production must be Supabase (ADR 0004).

### 2026-07-14 ? `npm run smoke` targets :3000; a stale server hijacks it
If port 3000 is already in use, `next dev` silently moves to 3002, but the smoke
script defaults to `http://localhost:3000` and will hang against whatever stale
process holds 3000. Point it explicitly: `$env:SMOKE_BASE_URL="http://localhost:3002"`
(PowerShell) before `npm run smoke`, or free port 3000 first.

### 2026-07-13 ? v0 MCP replaces 21st.dev Magic for component generation
21st.dev Magic MCP hit its 100-credit free-tier monthly cap (credits, not a
config issue). Switched to **v0 by Vercel** (`v0-mcp-server` npm package) as
the primary UI generation tool ? better fit for Next.js/App Router/shadcn/
Tailwind stack, returns full file paths + code, and has a comparable free tier.
21st.dev key kept in mcp.json since logo search (`logo_search`) is unlimited.
To activate: go to v0.dev/account ? API Keys, paste key into mcp.json
`V0_API_KEY`. Created `.cursor/skills/lodestar-ui/SKILL.md` as a project-level
brand design system reference so any agent builds on-brand UI automatically.

### 2026-07-13 ? Search "mode" toggle (standard/smart/local) added
`CreateRunInput.searchStrategy` drives `search/query.ts::buildQueries`, which
returns 1..N queries. `runSearch` runs each, dedupes pages by URL, enriches,
dedupes by domain, and (for multi-query modes) ranks by fit score before
capping to `MAX_LEADS_PER_RUN`. Smart/local use ~3� provider credits ? gate any
future auto-runs on this. Invariant preserved: still falls back to demo data.

### 2026-07-13 ? Node 24 runs TS scripts without a bundler
`npm run seed` / `scripts/*.ts` run under Node 24's type-stripping. Path aliases
(`@/?`) do **not** resolve there, so keep standalone scripts self-contained with
relative imports (see `scripts/seed.ts`).

### 2026-07-13 ? @21st-dev/magic MCP returns spec-non-compliant content
The Magic MCP (`21st_magic_component_builder` / `_inspiration`) returns tool
results whose content block is missing the required `text` string, so Cursor's
MCP client rejects them (`invalid_union ? expected string, received undefined`);
the builder degrades to `[object Object]`. It's already pinned to `@latest` with
a valid API key, so this is a **server-side format bug**, not config. Workaround:
build components by hand (better brand cohesion anyway) or clear the npx cache
and retry a newer build. Revisit periodically.

### 2026-07-13 ? Firecrawl MCP search returned HTTP 401
`firecrawl_search` failed with 401 during setup, suggesting the configured
Firecrawl key may be expired/limited. The app's live search uses the same key
(`.env.local`); if the app stays in demo mode, verify the key at firecrawl.dev.
Do not transmit the key value from the agent to external services to "test" it.

### 2026-07-13 ? stock-images MCP writes relative to the server's home dir
`download_image`'s `folder` is relative to the MCP server's cwd (the user's home
`C:\Users\alexx`), not the project. Always pass an **absolute project path**
(e.g. `.../LeadGenerator/public/images`) to save into the repo.

### 2026-07-13 ? next 15.5.4 had a security advisory
Bumped to the patched `15.5.20` (the `backport` dist-tag of the 15.5 line) during
setup. Watch for further advisories on the 15.x line.

### 2026-07-14 ? Go-live wizard; demo fallback kept
Do not delete zero-key fallbacks (constitution Art. I.2). Instead: (1) soften
?demo? copy when `canSearchLive` / `canSendEmail` are true, (2) treat placeholder
`OUTREACH_*` values as incomplete via `src/lib/identity.ts`, (3) first-visit
Getting Started wizard + Settings reopen (`/app?setup=1`). Settings Email delivery
now lists Resend and SMTP separately ? Resend was missing from Integrations and
the old SMTP-only footer falsely said ?demo? when Resend was already configured.

### 2026-07-14 ? Onboarding tour + location pick + search UX
- Wizard jumped to step 3 because it auto-selected the first ?incomplete?
  checklist item (search/email already green on prod). Always open on step 1.
- Replaced checklist modal with a coach-mark tour (Search → Pipeline →
  Settings). Tour replay is `/app?setup=1` only (no Settings button).
- EmptyState image+`from-ink-950` gradient removed from Search ? looked like a
  stray overlay under the form.
- Location must be picked from Photon suggestions (or cleared); free-typed
  ?barcelona? let FC return Barcelona SC (NY). Also stop stamping search city
  onto every lead; filter scraped geo mismatches.
- Search progress is staged UI only ? run is still one blocking request (true
  streaming needs async runs + poll).

Worker logs: `Page changed from static to dynamic at runtime /app, reason:
headers` after magic-link. `auth()`/`getCtx` called `headers()` on a route Next
had prerendered as static ? OpenNext 500 (user saw ?505?). Fix:
`export const dynamic = "force-dynamic"` on `/app` layout + page; remove
`getCtx` from layout entirely (wizard uses env identity defaults). Prior jwt
try/catch was necessary but not sufficient. Deploy on Windows: `npm run cf:build`
then `$env:OPEN_NEXT_DEPLOY='true'; npx wrangler deploy` (`cf:deploy` hits
miniflare spawn UNKNOWN).

### 2026-07-14 ? Magic-link From fix + /app harden + landing
Auth mail From placeholder caused silent Resend rejects (fixed earlier). Post-
login `/app` 505: harden jwt provision (try/catch), recover workspace in
`getCtx` if token lacks `workspaceId`, and never let layout getCtx throw.
Branded magic-link HTML via `src/lib/auth-email.ts`. Landing redesigned with
live product preview (map + pipeline) ? dropped missing hero image dependency.

### 2026-07-15 ? Leadify rename + Easy send must not fall through to platform Resend
- **Brand:** user-facing ?Lodestar? ? ?Leadify?. Keep internal `lodestar_*`
  storage keys / Resend tags for compatibility.
- **Easy send bug:** when a workspace Maileroo (or Resend) key was set, failure
  or missing preferred key still fell through to **platform** `RESEND_API_KEY`,
  producing Resend?s ?domain is not verified? while the UI showed Maileroo.
  Fix: return the BYO Easy result (ok or error); only use platform Resend/SMTP
  when no workspace Easy key exists.
- **API key UX:** never SSR the real secret; show a masked value in the input
  when `has*Key` so the field looks filled.
- **Sender profile:** position/company fields were redundant with the editable
  sign-off textarea ? removed from Settings UI (localStorage fields kept).

### 2026-07-15 ? Spammy footers were old drafts + placeholder identity
- Emails that still showed `Sent by Your Name <you@yourdomain.com>` + placeholder
  address + `unsubscribe: mailto:?maileroo.org` were **legacy draft bodies** from
  the initial-commit template (footer used to be baked into the draft). Current
  send also appended a second STOP line ? double footer.
- Fix: `stripLegacyCompliance()` at send; never emit Sent-by / mailto / placeholder
  address; Maileroo send now tags for `/api/webhooks/maileroo` (peer to Resend).
- Draft regenerate now sends Settings `signature` + `defaultOffer` so sign-off
  matches the profile; templates toned down; nav-junk blurbs skipped.

### 2026-07-15 ? Locale drafts + Workers AI for blurbs/pitch
- **Draft language** follows lead `location` (ES/EN/FR/IT/DE/PT) via
  `src/lib/outreach/locale.ts` + multi-copy templates in `draft.ts`. Default EN.
- **Chose Workers AI** over Groq/Gemini: same Cloudflare deploy as D1, no extra
  vendor key in prod (`ai.binding` in wrangler). Local optional
  `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` REST. Demo stays template/heuristic.
- Lead blurbs polished after live search (concurrency 3). Default pitch:
  Settings ? website + ?Generate from website? ? `/api/ai/pitch`.

### 2026-07-15 ? Leadify identifiers + natural emails + pitch AI
- Runtime keys/tags renamed `lodestar_*` ? `leadify_*` with one-time localStorage
  migration; webhook receivers still accept legacy tags. D1 CF database name
  remains `lodestar-prod` (id-bound).
- STOP / mailing-address footers removed from send path (ADR 0012). User found
  them scammy; constitution Art. I.3 amended.
- Pitch: no heuristic page-sentence fallback (ADR 0013). Cascade Workers AI ?
  Groq ? Gemini; otherwise clear error. Local needs CF REST or `GROQ_API_KEY` /
  `GEMINI_API_KEY`.
- Contacted-without-method highlighted in pipeline; setting method journals a
  follow-up via `updateLeadCrm`.

### 2026-07-15 ? Leads layout + pitch prompt + AI billing notes
- Leads: Export Excel sits next to the title; table/cards/map toggle shares the
  count row. Map fills remaining viewport height; discarded pins hidden; New pin
  color back to mist gray (`#7f92b3`). Outreach Sent is a 4th vertical column.
- Pitch generate for akademo-edu.com regurgitated bilingual homepage slogans
  because the system prompt defaulted to English and didn?t forbid tagline
  paste. Tightened prompt + `outreachLangFromText()` so language follows the
  page and output must be a cold-email offer rewrite.
- Billing: Workers AI = 10k Neurons/day free then ~$0.011/1k on Paid Workers;
  Groq/Gemini only if keys are set (their free tiers apply). Local `.env` has
  neither Groq nor Gemini ? prod uses the `AI` binding.

### 2026-07-15 ? Excel import + CF secrets checklist
- `LEADS_example.xlsx` used **Opportunity** (not Name) plus Excel hyperlink
  objects and `=+34?` formula phones. Old parser mapped Name?empty company so
  only email rows imported, and websites rendered as `[object Object]`. Prefer
  Opportunity > Company > Name; unwrap hyperlink/formula cells; route import ? Leads.
- Re-import skipped the two email rows as workspace duplicates from the first
  broken import; locations were over-shortened. Keep full Address; import mode
  **Current board** merges matches (email/domain) onto the open run and fills
  gaps; **New list** still skips workspace dupes. `displayWebsite` hides junk
  `[object Object]` URLs in UI.
- `wrangler secret list` on Worker `leadgeneration` was missing Gmail/Groq/
  Gemini ? deploy does not clear secrets; document checklist in
  `docs/cloudflare-secrets.md`.
- Outreach ?Needs draft? removed: search + import already auto-create drafts.
- Pipeline card list: drop `scrollbar-gutter:stable` (it reserved only the
  right edge and looked like uneven padding).


### 2026-07-20 ? Firecrawl juice vs Prospeo; MEV vs MillionVerifier; credit burn
- **Prospeo:** still design-only. Firecrawl already deepens top 6 hits into
  `/contact|/about|/team` (max 2 pages) + optional JSON extract (+4 credits).
  Adding a people-DB finder is overkill until we measure email-found % after
  deepen. Prefer squeezing Firecrawl (`map` to find contact URL once, skip
  JSON when regex hits, prefer `standard` search mode) over a second paid key.
- **MEV vs MillionVerifier:** MEV is cheaper at small/solo volume and ships
  **100 free credits/day** (what we already use at send). MV is competitive at
  huge bulk packs + risky-email refunds; not worth a second verify vendor for
  two operators.
- **Consumables for dogfooding:** Firecrawl credits (search 2/10 results +
  scrape 1 + JSON +4) dominate; then MEV verifies-at-send; Workers AI neurons
  for blurbs/pitch; optional Exa if Firecrawl fails; Resend/Maileroo/Gmail for
  actual sends. App plan quotas (leads/sends/verifies) are product meters, not
  vendor free-tier pools.

### 2026-07-20 — Firecrawl map deepen + Insider shared pool
- Replaced English path guessing as the primary deepen with `/v1/map`
  `search=contact` (1 credit) so locale paths like `/contacto` are found.
- Enrichment now covers every search hit up to the run limit (old hard top-6
  left later leads as snippet-only shells).
- Hidden `insider` plan (ADR 0017): shared FC + MEV pools. Still disable
  Firecrawl Smart Upgrade on the API key — app quotas cannot stop vendor
  overages alone.

### 2026-07-21 — Scrape order, raw FC credits, LLM import columns
- Firecrawl pricing: scrape and map are both **1 credit**; map alone does not
  return page text — you still scrape the contact URL. So path guesses /
  homepage `links` before `/map` saves the map credit when `/contact` works.
  JSON extract is the expensive last resort.
- Deepen order is now: reuse search markdown if it has email → homepage
  scrape (`markdown`+`links`) → contact links → path guesses → `/map` → one
  contact scrape → JSON extract. Hits enriched in parallel (concurrency 3).
- Dropped standard/smart UI — only query diversity differed; scrape was
  identical. Single `niche in city` query.
- Insider shows **raw** Firecrawl remaining credits (ADR 0018); no ÷5.
  Imports skip FC quota (plain fetch, no Firecrawl).
- Excel/CSV import maps headers via one LLM call first (any language); alias
  list is demo/zero-key fallback only. Uploads are rare vs draft AI, so the
  LLM cost is fine.
- “Enrichment” = turn a URL/snippet into structured lead fields (company,
  emails, phones, location, about blurb) + fit score. Worth it: search alone
  is not enough for outreach.

### 2026-07-21 — Contact-first scrape; Standard vs Complete; drop /map
- Path *strings* are free; each Firecrawl scrape is still 1 credit (404s too).
  Order: **landing first** (often has email/phone already) → `/contacto` →
  `/contact` only if still no email. No `/map`.
- Never discard a lead for missing email; keep phone, address, category.
- **Standard** = up to N companies. **Complete** = overfetch (~3×N, cap 60)
  and stop once N leads have email (total can exceed N).
- Expensive part of “enrichment” is Firecrawl scrapes, not Workers AI blurbs.
  Still run scrape enrichment on every kept hit — that’s the product.

### 2026-07-21 — Tour copy trim; drop Developer mode from Settings
- Shorter coach-mark copy; no “replay from Settings” CTA. Tour force remains
  `/app?setup=1`.
- Removed `DeveloperModePanel` from admin Settings (plan override for other
  tenants stays on Admin → Users).
- Sending identity **Your name** = inbox From display name
  (`Alex <you@domain.com>`), not email sign-off (that’s Outreach profile).

### 2026-07-21 — One sign-in UI; magic-link needs verified From domain
- Removed duplicate `/login` form — route redirects to `/?signin=1`. Middleware
  does the same for unauth studio hits.
- Forgot-password mail uses platform Resend + `authFromEmail()`. Without a
  verified domain, From is `onboarding@resend.dev`, which **only delivers to
  the Resend account owner** — not “because the site is on workers.dev”, but
  because there is no verified sending domain yet. Fix: verify a domain in
  Resend and set `OUTREACH_FROM_EMAIL` to an address on that domain.

### 2026-07-21 — Insider credits parse harden; drop FC badge; migrate 0025
- `getFirecrawlRemainingCredits` now coerces numeric strings + shares
  `parseFirecrawlCredits` with the usage route (admin “Credits unavailable”
  while the badge showed a number was a parse / shape mismatch).
- Removed studio `FirecrawlUsageBadge` pill (Insider still sees pool on
  Settings / Admin Users).
- Remote D1 applied `0025_find_leads_enabled` — Search toggle was failing with
  `no such column: find_leads_enabled`.

### 2026-07-21 — Find leads on/off + sign-in autocomplete
- Insider “Find leads” disabled while toggle On was `leadsRemaining == null`
  (credits API blip), not the admin pause. Null no longer hard-blocks the
  button; Off keeps the form and disables submit.
- `PasswordField` forced `autoComplete="new-password"` after props spread, so
  sign-in never got `current-password` / email autocomplete.
