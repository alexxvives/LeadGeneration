# HERMES Mail (alexxvives/LeadGeneration) — Systems & UX Audit

**Audit type:** Read-only, full-repository review (no code was modified)
**Commit audited:** `main` @ shallow clone, 2026-07-19
**Stack:** Next.js 15 (App Router) + React 19 + Tailwind 4 → Cloudflare Workers via `@opennextjs/cloudflare`, D1 (SQLite), Workers AI. Auth.js v5, Stripe, Resend/Maileroo/SMTP/Gmail send paths.
**Verification method:** Every finding below was confirmed by reading the cited file at the cited lines in the cloned repo. Line numbers refer to the current `main`. Findings that could not be confirmed against the source were dropped.

---

# 1. Executive Summary & User Flow Mapping

## 1.1 Overall assessment

This is a well-architected codebase for its size. The layering is disciplined: thin API routes → `getCtx()` (`src/lib/request-context.ts`) → service layer (`src/lib/service.ts`) → `LeadRepository` abstraction (`src/lib/db/index.ts`) with swappable JSON/D1 stores. Quota enforcement lives only in the service layer, `claimOutreachForSend` (`src/lib/db/d1-store.ts:1169-1187`) is a genuinely atomic send claim, and the zero-key demo mode is thoughtfully preserved throughout. Documentation (README, `docs/`, ADRs) is unusually good.

The problems cluster in four areas:

1. **Security debt that is production-fatal**: a hardcoded bootstrap admin password (`"password"`), an HTML sanitizer that can be bypassed via entity re-injection, unrate-limited auth endpoints, and a fail-open auth switch (missing `AUTH_SECRET` silently opens the whole app).
2. **D1 usage patterns that will not scale**: pervasive full-table loads (`listLeads()`, `listOutreach()`, `listRuns()`) on every board read, non-atomic read-modify-write usage counters, and N+1 query loops.
3. **A synchronous search pipeline inside a single Worker request**: up to 500 leads scraped + AI-processed inside one HTTP request, which will hit Workers CPU/duration limits and already needs "heal stuck runs" bandaids.
4. **Client-side state that should be server-side**: sender profiles, pitch templates, and warmup counters live only in `localStorage`, so the core drafting configuration silently diverges across devices.

## 1.2 Primary user journey (as implemented)

```
Landing (/)
  └─ Sign in / Sign up (AuthModal or /login; guest mode when auth off)
       └─ Studio (/app) — StudioShell sidebar: Dashboard · Search · Leads · Pipeline · Outreach · Boards · Runs · Settings
            ├─ SEARCH: SearchPanel → BoardAssignModal (pick board) → POST /api/runs
            │     └─ createAndRunSearch: search (Firecrawl/Exa) → enrich → fit-score → optional AI drafts
            │           → redirected to Pipeline view on completion
            ├─ IMPORT: ImportLeadsPanel (xlsx/csv, client-parsed) → chunked POST /api/leads/import
            ├─ REVIEW: Leads (table/cards/map) → LeadDrawer (info | draft composer)
            ├─ ENGAGE: Outreach queue → draft → approve → POST /api/send
            │     └─ verify email (quota) → rate limit → provider (Gmail/Resend/Maileroo/SMTP/demo)
            │           └─ webhooks (/api/webhooks/resend, /maileroo) → delivery status → Pipeline stage
            ├─ TRACK: Pipeline kanban (drag stages) · Dashboard stats · Runs history
            └─ CONFIGURE: /app/settings — sending identity, BYO keys, Gmail OAuth, plan/billing (Stripe)
```

## 1.3 Friction points on that journey (details in §4)

| # | Point of friction | Where |
|---|---|---|
| F1 | Search blocks the browser for the entire run (up to minutes); no progress from the server, only a cosmetic client animation | [Studio.tsx:288-323](src/components/studio/Studio.tsx), [SearchProgress in StudioHelpers.tsx](src/components/studio/StudioHelpers.tsx) |
| F2 | Board is fetched twice on every studio mount | [Studio.tsx:190-200](src/components/studio/Studio.tsx) |
| F3 | Pipeline polls the full board payload (all leads + all outreach bodies) every 15 s | [Studio.tsx:203-209](src/components/studio/Studio.tsx) |
| F4 | "Send all" collides with the 5/min rate limit and reports rate-limited sends as failures | [Studio.tsx:743-810](src/components/studio/Studio.tsx) |
| F5 | Sender profile & pitch live in `localStorage` — a second device drafts with an empty profile | [sender-profile.ts:12-15](src/lib/sender-profile.ts) |
| F6 | The favicon is a 546 KB PNG, and in production the middleware redirects it to /login for logged-out visitors | [src/app/icon.png], [middleware.ts:56-61](src/middleware.ts) |

---

# 2. Critical Flaws (Fix Immediately)

Ordered by severity. **C1–C4 are exploitable or data-destroying today.**

### C2.1 — Hardcoded bootstrap admin credentials (`admin` / `"password"`)
- **Where:** [src/lib/auth-users.ts:22-23](src/lib/auth-users.ts) — `BOOTSTRAP_ADMIN_EMAIL = "admin@tryhermesmail.com"`, `BOOTSTRAP_ADMIN_PASSWORD = "password"`; created on first request by `ensureBootstrapAdmin()` ([auth-users.ts:176-232](src/lib/auth-users.ts)), invoked from [src/auth.ts:38](src/auth.ts) and [src/app/api/auth/password/route.ts:46](src/app/api/auth/password/route.ts).
- **Why critical:** Both email and password are public in the GitHub repo. The account is created with `is_admin = 1`, which unlocks `/api/admin/users` (all workspaces, owner emails, Stripe customer IDs — [src/app/api/admin/users/route.ts:10-23](src/app/api/admin/users/route.ts)), `/api/workspace/set-plan` (free plan upgrades — [set-plan/route.ts:17-33](src/app/api/workspace/set-plan/route.ts)), and admin nav. There is **no rate limiting** on the login endpoint ([api/auth/password/route.ts:27-105](src/app/api/auth/password/route.ts)) to slow even a guessed variant.
- **Fix:** Generate a random bootstrap password and store it as a Wrangler secret (or print once to deploy logs); force rotation on first login; add IP-based rate limiting / lockout to `/api/auth/password` and `/api/auth/register`.

### C2.2 — HTML sanitizer re-injects entity-encoded markup → stored XSS + HTML injection into sent email
- **Where:** [src/lib/outreach/rich-text.ts:97-100](src/lib/outreach/rich-text.ts) — `walk()` returns `node.textContent ?? ""` for text nodes **without re-escaping**, and the result is used as an HTML string. Rendered with `dangerouslySetInnerHTML` at [LeadDrawer.tsx:678-680](src/components/studio/LeadDrawer.tsx) and [SenderProfileForm.tsx:743](src/components/studio/SenderProfileForm.tsx), and shipped as the email `html` part via `toEmailHtmlDocument` ([rich-text.ts:204-208](src/lib/outreach/rich-text.ts)).
- **Failure mode:** Input containing *escaped* markup, e.g. `&lt;img src=x onerror=alert(document.cookie)&gt;`, is parsed by `DOMParser` into a text node; `textContent` **decodes the entities**, and the decoded string (`<img onerror=…>`) is concatenated into the sanitizer output — live markup. Outreach bodies incorporate scraped web content (company names, AI-personalized rewrites of page text — [service.ts:640-674](src/lib/service.ts)), so a hostile lead website can plant the payload; it then executes in the operator's browser when the sent draft is previewed.
- **Fix:** In `walk()`, return `escapeHtml(node.textContent ?? "")` for text nodes (escapeHtml already exists at [rich-text.ts:25-31](src/lib/outreach/rich-text.ts)). Apply the same fix to the regex fallback path ([rich-text.ts:135-143](src/lib/outreach/rich-text.ts)), which also fails to neutralize entity-encoded input.

### C2.3 — Usage counters are non-atomic read-modify-write → quota bypass and lost billing data under concurrency
- **Where:**
  - Leads: `recordLeadUsage` [service.ts:516-526](src/lib/service.ts) (`GET workspace` → write `leadsUsedThisMonth: ws.leadsUsedThisMonth + count`)
  - Sends: [service.ts:1185-1191](src/lib/service.ts)
  - Verifies: [service.ts:1046-1051](src/lib/service.ts)
  - The store writes absolute values ([d1-store.ts:394-397](src/lib/db/d1-store.ts) via `updateWorkspace`), never `SET x = x + ?`.
- **Failure mode:** Two Worker isolates (two tabs, "Send all", concurrent imports) both read `sendsUsedThisMonth = 10`, both write `11` — one send is never counted. Quota checks ([service.ts:1074-1089](src/lib/service.ts), [service.ts:482-499](src/lib/service.ts)) are check-then-act on the same stale reads, so a user at the limit can exceed it by racing requests. The lazy window resets in [workspace.ts:98-145](src/lib/workspace.ts) have the same race (two isolates both reset, both roll `resetsAt`).
- **Fix:** Add `incrementWorkspaceUsage(kind, delta)` to `LeadRepository` that issues `UPDATE workspaces SET sends_used_this_month = sends_used_this_month + ? WHERE id = ?`, and enforce quota with a conditional update (`… WHERE id = ? AND sends_used_this_month < ?`, check `meta.changes`).

### C2.4 — Entire search+enrich+AI pipeline runs synchronously inside one HTTP request
- **Where:** `createAndRunSearch` [service.ts:546-705](src/lib/service.ts), invoked directly by `POST /api/runs` ([runs/route.ts:53-56](src/app/api/runs/route.ts)). Per run: N provider queries ([search/index.ts:115-133](src/lib/search/index.ts)), per-lead AI blurb + pitch-fit at concurrency 3 ([search/index.ts:211-256](src/lib/search/index.ts)), optional per-lead AI draft personalization ([service.ts:640-674](src/lib/service.ts)). The UI offers up to **500 leads per run** ([plans.ts:40](src/lib/plans.ts), hard cap default 500 at [config.ts:132-135](src/lib/config.ts)).
- **Failure mode:** Cloudflare Workers requests are CPU/duration-limited; large runs will be killed mid-write, leaving `running` runs and partial boards. The codebase already ships the symptom-patches: `healStuckSearchRuns` ([service.ts:1880-1893](src/lib/service.ts)) and `healStuckImportRuns` ([service.ts:1854-1877](src/lib/service.ts)). The client meanwhile `await`s one fetch for the whole run ([Studio.tsx:296-308](src/components/studio/Studio.tsx)) with no server-driven progress.
- **Fix (ordered by effort):** (a) short-term: cap `maxLeads` at ~50 per request and loop from the client with progress; (b) proper: move the run to a background execution primitive — Cloudflare Queues consumer or a Durable Object — write leads incrementally, and let the client poll `GET /api/runs/:id` (route already exists: [runs/[id]/route.ts](src/app/api/runs/[id]/route.ts)).

### C2.5 — Real lead spreadsheets committed to the public repository
- **Where:** repo root — `LEADS (2).xlsx` (54 KB), `LEADS (2).backup.xlsx` (91 KB), alongside the intentional `LEADS_example.xlsx`.
- **Why critical:** These look like actual prospect lists (names/emails/phones = PII) published on public GitHub. This is a GDPR/CCPA exposure independent of any code bug.
- **Fix:** Delete both files, add `LEADS*.xlsx` (except the example) to `.gitignore`, and rewrite git history (`git filter-repo`) since removal alone leaves them in history.

### C2.6 — Missing `AUTH_SECRET` fails **open**: production silently becomes a public, unmetered app
- **Where:** `authRequired()` = "is AUTH_SECRET set" ([config.ts:68-70](src/lib/config.ts)); with it unset: middleware allows everything ([middleware.ts:35](src/middleware.ts)), any email logs in with any password ([auth.config.ts:29-35](src/auth.config.ts), [api/auth/password/route.ts:57-64](src/app/api/auth/password/route.ts)), admin gate is open (`isAdminSession` returns `true` — [admin.ts:12](src/lib/admin.ts)), and a fallback JWT secret is used ([config.ts:141-143](src/lib/config.ts)).
- **Failure mode:** One missing secret on a redeploy (or a typo'd secret name) exposes every workspace's D1 data as the shared "local" workspace with admin chrome. There is no runtime assertion that "we're on Workers + D1, therefore AUTH_SECRET must exist."
- **Fix:** In `getCtx()`/middleware, if a D1 binding is present (production runtime) and `AUTH_SECRET` is empty, **fail closed** with a 503 and a log line, instead of falling back to demo mode.

### C2.7 — `SMOKE_API_KEY` header bypass has no environment guard
- **Where:** [middleware.ts:40-43](src/middleware.ts) + [request-context.ts:67-81](src/lib/request-context.ts) + [config.ts:192-196](src/lib/config.ts). Any request carrying `x-smoke-key: <value>` skips auth entirely and operates on the `local` workspace **against production D1**.
- **Why critical:** The only protection is a README comment ("Never set SMOKE_API_KEY in production"). A leaked CI secret or copied env file becomes a permanent unauthenticated API credential.
- **Fix:** Refuse the bypass when a D1 binding exists, or scope it to `NODE_ENV !== "production"`; log every use.

### C2.8 — First-login race creates duplicate workspaces (data split / "lost" data)
- **Where:** `getOrCreateWorkspaceForUser` ([workspace.ts:66-75](src/lib/workspace.ts)) is get-then-create; `workspaces_owner_idx` is **not unique** ([migrations/0002_workspaces_and_auth.sql:33-34](migrations/0002_workspaces_and_auth.sql)); `createWorkspace` only guards `ON CONFLICT(id)` ([d1-store.ts:357-383](src/lib/db/d1-store.ts)).
- **Failure mode:** Two parallel first requests (JWT callback [auth.ts:181-187](src/auth.ts) + `getCtx()` [request-context.ts:49-62](src/lib/request-context.ts) fire on the same first page load) each create a workspace. `getWorkspaceByOwner … LIMIT 1` ([d1-store.ts:341-347](src/lib/db/d1-store.ts)) then returns whichever sorts first — the user's leads/settings appear and disappear depending on which workspace a session resolves.
- **Fix:** Migration: `CREATE UNIQUE INDEX workspaces_owner_unique ON workspaces(owner_user_id) WHERE owner_user_id IS NOT NULL;` change `createWorkspace` to `ON CONFLICT(owner_user_id) DO NOTHING` + re-read by owner.

### C2.9 — Cross-tenant delivery-status tampering via webhook email fallback
- **Where:** [webhooks/resend/route.ts:106-137](src/app/api/webhooks/resend/route.ts). Signature verification resolves the Svix secret from the **attacker-chosen** `hermes_ws` tag ([lines 61-67](src/app/api/webhooks/resend/route.ts)). A tenant who saved their own BYO Resend key knows their own signing secret (visible in their Resend dashboard), can sign a synthetic `email.received` event tagged with their own workspace, and the email fallback then matches `findLatestSentByEmail` **across all workspaces** ([d1-store.ts:1213-1227](src/lib/db/d1-store.ts) — deliberately unscoped) and mutates another tenant's outreach + lead CRM stage ([service.ts:1241-1290](src/lib/service.ts)).
- **Fix:** When the verifying secret came from workspace X, restrict the email-fallback search to workspace X (`findLatestSentByEmail` needs a scoped variant). Keep the unscoped path only for the platform-level secret.

---

# 3. Architectural & Logic Improvements

## 3.1 D1 query efficiency (the biggest scalability theme)

| ID | Issue | Location | Recommended change |
|----|-------|----------|--------------------|
| A1 | `attachOutreach` loads **every** outreach row in the workspace to decorate a lead list | [service.ts:825-832](src/lib/service.ts) | Add `listOutreachByLeadIds(ids)` (chunked `WHERE lead_id IN (…)`) or a JOIN-shaped repo method |
| A2 | `ensureDefaultBoard` runs on **every** board/dashboard read and re-scans all leads + all runs for orphans each time | [service.ts:85-140](src/lib/service.ts); called from [service.ts:194](src/lib/service.ts), [736](src/lib/service.ts), [774](src/lib/service.ts) | Run orphan backfill once (migration or flag on the workspace row); default-board ensure can be a single `INSERT … ON CONFLICT DO NOTHING` |
| A3 | `listBoardSummaries`: sequential `getBoardLock` per board (N+1), plus per-shared-board `resolveBoardAccess` + `listLeads` loop | [service.ts:200-235](src/lib/service.ts) | Batch: `SELECT * FROM board_locks WHERE board_id IN (…)`; compute lead counts with one `GROUP BY board_id` COUNT query instead of loading full leads |
| A4 | Cross-run dedupe loads the entire lead table into memory — on every search run and **on every 80-row import chunk** | [service.ts:579-593](src/lib/service.ts), [service.ts:1634-1641](src/lib/service.ts) | Store normalized `domain` and a `emails_norm` column (or a separate `lead_emails` table), index them, and dedupe with `WHERE domain IN (…)` lookups |
| A5 | `findLatestSentByEmail` is an unindexed full scan of `outreach` across all workspaces, run on every inbound webhook | [d1-store.ts:1213-1227](src/lib/db/d1-store.ts); no index in [migrations/](migrations) | `CREATE INDEX outreach_sent_to_email_idx ON outreach (to_email COLLATE NOCASE, sent_at DESC) WHERE status = 'sent';` |
| A6 | `listPendingInvitesForEmail` / `getBoardInvite`: N+1 `getBoardAnywhere` per invite | [d1-store.ts:678-713](src/lib/db/d1-store.ts) | JOIN `board_invites` to `boards` in one statement |
| A7 | `GET /api/board` returns every lead **with full outreach bodies**, unpaginated; this is also the payload polled every 15 s | [service.ts:726-768](src/lib/service.ts), [board/route.ts:9-30](src/app/api/board/route.ts) | Paginate (`LIMIT/OFFSET` or cursor on `fit_score,id`), and strip `outreach.body` from list payloads (drawer can fetch it on open) |
| A8 | `updateLeadCrm` shared-lead lookup iterates every membership board sequentially | [service.ts:1454-1469](src/lib/service.ts) | Single query: find lead by id where `board_id IN (member boards)` |
| A9 | `clearWorkspaceData` issues 4 sequential round-trips | [d1-store.ts:1260-1277](src/lib/db/d1-store.ts) | Use one `db.batch([...])` |

## 3.2 Edge-runtime correctness

- **A10 — In-memory caches assume a long-lived process.** The verify cache ([verify.ts:35](src/lib/email/verify.ts)) is consulted for *quota* decisions ([service.ts:1030-1043](src/lib/service.ts)) — on Workers each isolate has its own Map, so re-sends bill again and the "cached → don't count quota" logic is unreliable. The geocode caches ([geocode/route.ts:27-28](src/app/api/geocode/route.ts)) grow unboundedly per isolate. Persist verify results in D1 (email → status, verified_at) and use the Workers Cache API (or `cf` fetch caching) for geocoding.
- **A11 — `getD1Binding` keys off `NODE_ENV` only** ([cf.ts:20](src/lib/cf.ts)). Combined with C2.6, "am I production?" is inferred from two different signals (`NODE_ENV` vs `AUTH_SECRET`), which can disagree. Introduce one explicit `isWorkersRuntime()` (binding present) and derive both metering and auth enforcement from it.
- **A12 — 25 s / 20 s verify timeouts inside the send request** ([verify.ts:102](src/lib/email/verify.ts), [verify.ts:161](src/lib/email/verify.ts)) — a slow verifier holds the outreach in `sending` and the user's click hangs. Cut to ≤8 s and treat timeout as `unknown/okToSend`.
- **A13 — Sequential `await` chains in `sendApprovedOutreach`** ([service.ts:990-1210](src/lib/service.ts)): the happy path performs ~10 serial D1 round-trips (claim, workspace ×3 reads, verify window, rate count, update outreach, get lead, update lead, workspace usage). Batch the post-send writes and reuse the workspace row from one read.

## 3.3 Security hardening (below critical)

- **A14 — No rate limiting on auth endpoints**: [api/auth/password/route.ts](src/app/api/auth/password/route.ts) and [api/auth/register/route.ts](src/app/api/auth/register/route.ts) (Turnstile only runs when configured — [register/route.ts:21-32](src/app/api/auth/register/route.ts)). Add per-IP counters (D1 or KV) or Cloudflare WAF rate rules.
- **A15 — Non-constant-time webhook secret compare**: `header !== secret` at [webhooks/maileroo/route.ts:33](src/app/api/webhooks/maileroo/route.ts). Use `crypto.timingSafeEqual` (pattern already exists at [password.ts:63-68](src/lib/password.ts)).
- **A16 — SSRF surface in `plainFetchPageText`**: [fetch-page.ts:21-45](src/lib/ai/fetch-page.ts) fetches user-supplied URLs (`POST /api/ai/pitch` — [ai/pitch/route.ts:18-27](src/app/api/ai/pitch/route.ts); import enrich — [service.ts:1727-1739](src/lib/service.ts)) with no scheme/host validation beyond `new URL`. Cloudflare blocks most internal targets, but local/Node deployments are exposed. Reject non-http(s), literal IPs in private ranges, and `localhost`.
- **A17 — Verify API key sent in URL query string**: [verify.ts:95-97](src/lib/email/verify.ts) (`apikey` as query param) — ends up in intermediary logs. MyEmailVerifier's API is GET-based, so at minimum never log the URL; prefer the header-auth provider (Zeruh already uses `X-Api-Key`, [verify.ts:160](src/lib/email/verify.ts)).
- **A18 — BYO provider keys stored in plaintext columns** (`resend_api_key`, `maileroo_api_key` — [d1-store.ts:79-81](src/lib/db/d1-store.ts)) while Gmail tokens are encrypted ([token-crypto.ts](src/lib/email/token-crypto.ts)). Encrypt these with the same `encryptSecret` before persisting.
- **A19 — `editOutreach` has no status guard**: subject/body/toEmail of a **sent** outreach can be rewritten after the fact ([service.ts:905-932](src/lib/service.ts)), corrupting the audit trail the approval flow depends on. Reject edits when `status === "sent" || "sending"`.

## 3.4 Consistency / maintainability

- **A20 — Duplicated session minting**: [session-cookie.ts:69-126](src/lib/session-cookie.ts) hand-serializes Auth.js JWE cookies (chunking, `__Secure-` names) in parallel with Auth.js itself. This will break silently on a next-auth upgrade. Isolate behind a version-pinned test, or replace the flow with Auth.js `signIn` redirect handling.
- **A21 — Doc drift**: README says `MAX_LEADS_PER_RUN` defaults to 12 ([README.md:58](README.md)); code defaults to 500 ([config.ts:132-135](src/lib/config.ts)). At Workers limits (C2.4) that 40× difference matters — align on the lower number.
- **A22 — Rate-limit retry hint is a constant** `15_000` ([rate-limit.ts:28-36](src/lib/email/rate-limit.ts)) regardless of the actual window; compute from the oldest counted send so clients can schedule retries precisely.
- **A23 — `package.json name: "hermes-mail"`, wrangler name `leadgeneration`, D1 name `lodestar-prod`, tags `hermes_/leadify_/lodestar_`** — three brand generations coexist ([wrangler.jsonc:6-22](wrangler.jsonc), [service.ts:1109-1114](src/lib/service.ts)). Harmless individually, but the triple-alias tag matching in both webhooks is permanent code tax; schedule a cleanup once in-flight sends age out.

---

# 4. UX/UI & Interaction Enhancements

## 4.1 State feedback & flow

- **U1 — Double initial fetch:** two mount effects both call `refresh()` ([Studio.tsx:190-194 and 196-200](src/components/studio/Studio.tsx)) — the board payload (§A7: potentially MBs) is fetched twice on every studio load. Merge into one effect keyed on `filterBoardId`.
- **U2 — Pipeline polling:** full-board refetch every 15 s ([Studio.tsx:203-209](src/components/studio/Studio.tsx)). Combined with A7 this is the single heaviest recurring load in the app. Poll a lightweight `updatedAt`/counts endpoint and refetch the body only on change.
- **U3 — "Send all" vs. rate limit:** sends run sequentially and a 429 is counted as `failed` with no retry ([Studio.tsx:780-797](src/components/studio/Studio.tsx)); with `SEND_RATE_PER_MINUTE=5` ([config.ts:103-106](src/lib/config.ts)), sending 20 approved emails reports ~15 "failures". Detect `rateLimited`/`retryAfterMs` from the API response ([send/route.ts:29-42](src/app/api/send/route.ts)) and pause/resume with a visible progress indicator.
- **U4 — Search progress is fiction:** the server gives no progress; `SearchProgress` animates on a timer ([StudioHelpers.tsx:99](src/components/studio/StudioHelpers.tsx) area) while the fetch blocks for the full run (F1). Fix arrives with C2.4's async runs + poll.
- **U5 — Board-load failure leaves a dead screen:** errors surface only as a transient toast ([Studio.tsx:196-200](src/components/studio/Studio.tsx)); the board stays `null` and the user sees an empty studio with no retry. Add an inline error state with a Retry button.
- **U6 — Native `confirm()` dialogs** for bulk send ([Studio.tsx:764-773](src/components/studio/Studio.tsx)) clash with the app's styled modal system used everywhere else (e.g. [BoardAssignModal.tsx](src/components/studio/BoardAssignModal.tsx)).

## 4.2 Accessibility

- **U7 — Inline modals without dialog semantics:** the simulate-send and warmup dialogs ([Studio.tsx:1282-1319](src/components/studio/Studio.tsx), [1321-1356](src/components/studio/Studio.tsx)) and the import/delete overlays ([1240-1280](src/components/studio/Studio.tsx)) lack `role="dialog"`, `aria-modal`, focus trap, and Escape handling — unlike the proper modals ([AuthModal.tsx:215-216](src/components/AuthModal.tsx), [BoardAssignModal.tsx:116-117](src/components/studio/BoardAssignModal.tsx)). Extract one `<Modal>` primitive and reuse it.
- **U8 — Toasts are silent to screen readers:** the toast container ([Studio.tsx:1393-1407](src/components/studio/Studio.tsx)) has no `aria-live="polite"` region; send results, errors, and quota messages are invisible to AT.
- **U9 — Icon-only controls rely on `title`:** e.g. sign-out button ([StudioShell.tsx:372-384](src/components/studio/StudioShell.tsx)) — add `aria-label`s (the ThemeToggle/Select already do this correctly).

## 4.3 Performance / payload

- **U10 — 546 KB favicon + login redirect:** `src/app/icon.png` is 546 KB and is requested on every page; the middleware matcher ([middleware.ts:56-61](src/middleware.ts)) excludes only `favicon.ico`/`_next/*`/`images/`, so in production a logged-out visitor's `/icon.png` request 302s to `/login?callbackUrl=/icon.png`. Ship a ≤10 KB icon and add `icon.png` (or a general asset-extension check) to the matcher exclusions. `public/hermesmail_logo.png` (547 KB) deserves the same diet.
- **U11 — `LeadTable` re-renders all rows on any patch:** 27.5 KB component with only two memo hooks total ([LeadTable.tsx](src/components/studio/LeadTable.tsx)); every optimistic `patchLeadLocal` ([Studio.tsx:472-476](src/components/studio/Studio.tsx)) re-renders the full table. Wrap the row in `React.memo` keyed on the lead object.
- **U12 — Map stays mounted (intentionally) behind table/cards** ([Studio.tsx:1145-1159](src/components/studio/Studio.tsx)) — fine, but it also geocodes while hidden; gate `LeadMap`'s geocode queue on visibility.

## 4.4 Data-location & consistency

- **U13 — Sender profiles/pitches in `localStorage` only** ([sender-profile.ts:12-15](src/lib/sender-profile.ts)): the drafting voice, subjects, and pitch templates — the product's core configuration — do not follow the account. Draft-all from a second browser silently produces empty-bodied drafts ([Studio.tsx:489-496](src/components/studio/Studio.tsx) passes `offerNotes: pitch || ""`). Move profiles to the workspace row (D1) with localStorage as an offline cache.
- **U14 — Warmup counters in `localStorage`** ([warmup.ts:14-27](src/lib/email/warmup.ts)): daily send counts driving the warmup warnings reset with the browser profile and don't aggregate across devices; server-side sends-per-day is already derivable from `outreach.sent_at`.
- **U15 — Hydration hazard:** `filterBoardId` reads `localStorage` during render ([Studio.tsx:97-103](src/components/studio/Studio.tsx)); server render (null) vs. first client render (stored id) may disagree. Move the storage read into a `useEffect`/`useSyncExternalStore`.
- **U16 — Default profile placeholder leaks a real identity:** `SIGNATURE_PLACEHOLDER` hardcodes "Alexandre Vives / AKADEMO" ([sender-profile.ts:59-65](src/lib/sender-profile.ts)) — any user who skips Settings sends email signed by the author. Replace with a neutral placeholder that blocks send until filled.

---

# 5. Agent Execution Plan

> **You are an AI coding agent.** Execute the steps below **in order** — they are sequenced so security fixes land first and each step is independently verifiable. Work on a branch (`audit-fixes`). After each step: run `npm run lint` and `npx tsc --noEmit`; both must pass before proceeding. Do not refactor beyond the stated scope of a step. Steps marked **[MIGRATION]** add a new file under `migrations/` with the next sequential number — never edit an existing migration.

### Step 1 — Remove committed lead data
- **Files:** repo root.
- **Do:** Delete `LEADS (2).xlsx` and `LEADS (2).backup.xlsx`. Append to `.gitignore`: `LEADS*.xlsx` then an exception line `!LEADS_example.xlsx`.
- **Accept when:** `git ls-files | grep -i "LEADS ("` returns nothing; `LEADS_example.xlsx` still tracked. Note in the PR that history purge (`git filter-repo --path 'LEADS (2).xlsx' --path 'LEADS (2).backup.xlsx' --invert-paths`) must be run by a human with force-push rights.

### Step 2 — Kill the hardcoded bootstrap admin password
- **Files:** `src/lib/auth-users.ts` (lines 22-23, 176-232).
- **Do:** Replace `BOOTSTRAP_ADMIN_PASSWORD = "password"` with: read `process.env.BOOTSTRAP_ADMIN_PASSWORD`; if unset, generate `crypto.randomUUID()` and `console.warn` the generated value exactly once at creation time. Never store or compare the literal `"password"`.
- **Accept when:** `grep -rn '"password"' src/lib/auth-users.ts` returns nothing; `ensureBootstrapAdmin()` still creates an admin when none exists (exercise via `npm run dev` + `data/auth-users.json` inspection).

### Step 3 — Fix the sanitizer entity re-injection (XSS)
- **Files:** `src/lib/outreach/rich-text.ts` (lines 97-100, 135-143).
- **Do:** In `walk()`, change the text-node branch to `return escapeHtml(node.textContent ?? "");`. In the non-DOMParser fallback inside `normalizePitchHtml`, escape `&(?!(amp|lt|gt|quot|#\d+);)` sequences before the tag-strip regexes, or run the whole fallback on entity-decoded text and re-escape.
- **Accept when:** a unit check (add `scripts/` test or inline assertion) shows `normalizePitchHtml("&lt;img src=x onerror=alert(1)&gt;")` output contains `&lt;img` and **not** `<img`. Legit input `"<b>hi</b><br>line"` still round-trips with `<b>` intact.

### Step 4 — Atomic usage counters **[MIGRATION]**
- **Files:** `src/lib/db/index.ts`, `src/lib/db/d1-store.ts`, `src/lib/db/json-store.ts`, `src/lib/service.ts` (516-526, 1046-1051, 1185-1191).
- **Do:** Add to `LeadRepository`: `incrementWorkspaceUsage(id: string, patch: { leads?: number; sends?: number; verifies?: number }): Promise<void>`. D1 impl: single `UPDATE workspaces SET leads_used_this_month = leads_used_this_month + ?, … , updated_at = ? WHERE id = ?`. JSON impl: read-modify-write inside the existing module-level write chain. Replace the three read-then-write blocks in `service.ts` with calls to it.
- **Accept when:** no remaining `leadsUsedThisMonth: ws.leadsUsedThisMonth +` / `sendsUsedThisMonth: ws.sendsUsedThisMonth +` / `verifiesUsedToday: verifyWs.verifiesUsedToday +` patterns in `src/lib/service.ts` (grep); demo-mode send still increments the usage bar.

### Step 5 — Unique workspace per owner **[MIGRATION]**
- **Files:** new `migrations/0021_workspaces_owner_unique.sql`, `src/lib/db/d1-store.ts` (357-383), `src/lib/workspace.ts` (66-75).
- **Do:** Migration: dedupe existing rows (keep oldest per `owner_user_id`, reassign children's `workspace_id` — mirror the pattern used in `migrations/0012_boards_unique_default.sql`), then `CREATE UNIQUE INDEX IF NOT EXISTS workspaces_owner_unique ON workspaces(owner_user_id) WHERE owner_user_id IS NOT NULL;`. In `createWorkspace`, add `ON CONFLICT DO NOTHING` semantics for the unique violation; in `getOrCreateWorkspaceForUser`, on create failure re-read `getWorkspaceByOwner` and return it.
- **Accept when:** applying migrations to a fresh local D1 (`npm run cf:migrate:local`) succeeds; calling `getOrCreateWorkspaceForUser` twice concurrently (script with `Promise.all`) yields one workspace row.

### Step 6 — Fail closed on missing AUTH_SECRET; guard smoke bypass
- **Files:** `src/lib/request-context.ts` (28-96), `src/middleware.ts` (40-43), `src/lib/config.ts`.
- **Do:** In `getCtx()`: if `binding` exists and `!authRequired()`, throw `AuthError("Server misconfigured: AUTH_SECRET missing")` (→ 401/503, never demo mode on D1). Gate the smoke bypass in both middleware and `getCtx()` behind `!binding` (i.e., never on production D1); keep local behavior unchanged.
- **Accept when:** with a fake binding stub in a unit exercise, `getCtx()` throws when AUTH_SECRET is empty; `npm run dev` (no binding, no secret) still resolves the `local` workspace.

### Step 7 — Scope the webhook email fallback + constant-time compare
- **Files:** `src/app/api/webhooks/resend/route.ts` (106-137), `src/app/api/webhooks/maileroo/route.ts` (29-35, 99-127), `src/lib/db/index.ts`, `src/lib/db/d1-store.ts` (1213-1227), `src/lib/db/json-store.ts`.
- **Do:** Add optional `workspaceId` parameter to `findLatestSentByEmail`; when the verified secret was a per-workspace secret (Resend) pass that workspace id; the unscoped search remains only for the platform-level `RESEND_WEBHOOK_SECRET` / `MAILEROO_WEBHOOK_SECRET`. In the Maileroo route, replace `header !== secret` with a constant-time comparison of UTF-8 bytes.
- **Accept when:** a tag-signed event whose tags name workspace A can no longer mutate outreach whose `workspace_id` ≠ A via the email fallback (trace the code path); `timingSafeEqual`-style compare is used.

### Step 8 — Bound the synchronous search run
- **Files:** `src/lib/config.ts` (132-135), `src/lib/plans.ts` (40), `src/app/api/runs/route.ts` (24), `src/components/studio/SearchPanel.tsx`, README.md (58).
- **Do (short-term mitigation, matching current architecture):** Set the per-request hard cap to 50 (`maxLeadsPerRun` default 50; zod `.max(50)`; `LEAD_COUNT_OPTIONS = [10, 25, 50]`). Update README's stated default to match. Leave a `TODO(queue)` comment referencing Cloudflare Queues/Durable Objects for >50 runs.
- **Accept when:** requesting `maxLeads: 500` returns 400; UI no longer offers 100/500; README table row matches code.

### Step 9 — Trim the board payload & fix the double fetch
- **Files:** `src/lib/service.ts` (`attachOutreach` 825-832, `getLatestBoard` 726-768), `src/lib/db/index.ts` + both stores, `src/components/studio/Studio.tsx` (190-200).
- **Do:** (a) Add `listOutreachByLeadIds(leadIds)` to the repository (D1: chunked `IN` lists of ≤50; JSON: filter) and use it in `attachOutreach`. (b) In `Studio.tsx`, delete the second mount effect (196-200) and move `setLoading(false)` into the first effect's `.finally`.
- **Accept when:** network tab on studio load shows exactly one `/api/board` request; `attachOutreach` no longer calls `listOutreach()`.

### Step 10 — Stop re-scanning tables on every read
- **Files:** `src/lib/service.ts` (85-140, 200-235).
- **Do:** (a) In `ensureDefaultBoard`, short-circuit: if `listBoards()` already contains exactly one default, skip the orphan backfill unless a module-level per-workspace "checked" marker (or workspace row flag) is unset. (b) In `listBoardSummaries`, replace the per-board `getBoardLock` loop with one repo call `listBoardLocks(boardIds)`; replace per-board lead filtering with a `countLeadsByBoard()` GROUP BY repo method returning `{boardId, total, contacted, sent, closed}` (SQL `SUM(CASE WHEN …)`).
- **Accept when:** loading `/api/board` for a workspace with 5 boards issues no more than 1 query to `board_locks` and no full `leads` scan for counting (verify by reading the code paths; optional: wrangler `d1 execute --command` timing).

### Step 11 — Index the webhook lookup **[MIGRATION]**
- **Files:** new `migrations/0022_outreach_to_email_idx.sql`.
- **Do:** `CREATE INDEX IF NOT EXISTS outreach_sent_to_email_idx ON outreach (to_email, sent_at DESC);` (D1/SQLite: also change the query in `findLatestSentByEmail` to compare `to_email = ?` after lowercasing at write time, or use `COLLATE NOCASE` on the index to keep the `lower()` semantics — pick one and keep query + index consistent).
- **Accept when:** `EXPLAIN QUERY PLAN` for the webhook query (run via `wrangler d1 execute --local`) shows index usage, not `SCAN outreach`.

### Step 12 — Guard `editOutreach` and SSRF
- **Files:** `src/lib/service.ts` (905-932), `src/lib/ai/fetch-page.ts` (21-45).
- **Do:** (a) In `editOutreach`, return the row unchanged (or throw a 409-mapped error) when `existing.status === "sent" || existing.status === "sending"`. (b) In `plainFetchPageText`, before fetching: require protocol `http:`/`https:`, reject hostnames that are `localhost`, `*.local`, or literal IPs in `10./172.16-31./192.168./127./169.254./0.0.0.0` ranges (and `[::1]`).
- **Accept when:** editing a sent outreach's body via `PATCH /api/outreach/:id` does not change the stored body; `fetchPublicPageText("http://169.254.169.254/")` throws before any fetch.

### Step 13 — Auth endpoint rate limiting
- **Files:** `src/app/api/auth/password/route.ts`, `src/app/api/auth/register/route.ts`; new `src/lib/auth-rate-limit.ts`.
- **Do:** Implement a D1-backed fixed-window counter (table via **[MIGRATION]** `0023_auth_rate_limits.sql`: `key TEXT PRIMARY KEY, count INTEGER, window_start TEXT`) keyed on `ip|email`; limit: 10 attempts / 15 min for password, 5 / hour for register. On exceed return 429 with `Retry-After`. Use `cf-connecting-ip` header (already the pattern at [register/route.ts:23-24](src/app/api/auth/register/route.ts)).
- **Accept when:** 11 rapid POSTs to `/api/auth/password` with the same email return 429 on the 11th (exercise with the local D1 preview).

### Step 14 — Accessibility: shared modal + live toasts
- **Files:** new `src/components/ui/Modal.tsx`; `src/components/studio/Studio.tsx` (1240-1356, 1393-1407).
- **Do:** Create a `Modal` component with `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, Escape-to-close, focus trap (focus first focusable on open, restore on close), and backdrop click handling — mirror the markup pattern already used in [BoardAssignModal.tsx:116-140](src/components/studio/BoardAssignModal.tsx). Convert the four inline overlays in Studio.tsx (deleting, import progress, simulate-send, warmup) to use it. Add `role="status" aria-live="polite"` to the toast container div at line 1393.
- **Accept when:** Escape closes the simulate-send dialog; toast container carries `aria-live`; keyboard Tab cannot escape an open dialog.

### Step 15 — "Send all" respects the rate limit
- **Files:** `src/components/studio/Studio.tsx` (743-810), `src/lib/client-api.ts` (52-80, 242-250).
- **Do:** Surface `rateLimited`/`retryAfterMs` from the 429 body in `jsonFetch`'s thrown error (the send route already returns them — [send/route.ts:28-42](src/app/api/send/route.ts)). In `onSendAllOutreach`, on a rate-limited error: wait `retryAfterMs` (show "Pausing for rate limit… X of Y sent" in the existing progress toast or a small inline status), then retry the same outreach; only count non-429 errors as failures.
- **Accept when:** with `SEND_RATE_PER_MINUTE=2` locally, "Send all" of 5 approved drafts completes all 5 (with pauses) and reports 0 failures.

### Step 16 — Move sender profiles server-side **[MIGRATION]**
- **Files:** new `migrations/0024_workspace_profiles.sql` (TEXT JSON column `outreach_profiles_json` on `workspaces`); `src/lib/db/d1-store.ts`, `src/lib/db/json-store.ts`, `src/lib/types.ts` (Workspace), `src/app/api/workspace/settings/route.ts`, `src/lib/sender-profile.ts`, `src/components/studio/ProfilePicker.tsx`, `src/components/studio/SenderProfileForm.tsx`.
- **Do:** Persist the `ProfileStore` shape (profiles + activeId — [sender-profile.ts:53-56](src/lib/sender-profile.ts)) on the workspace row; extend the settings PATCH schema; on studio load, hydrate from the server and fall back to (and one-time-migrate) localStorage. Keep localStorage as a write-through cache so demo mode is unchanged. Also replace `SIGNATURE_PLACEHOLDER`'s real name/company ([sender-profile.ts:59-65](src/lib/sender-profile.ts)) with `"Your Name\nYour role | Your company"`.
- **Accept when:** creating a profile in one browser and loading the studio in a second browser (same account, local D1 preview) shows the same profile; `grep -rn "AKADEMO" src/` only matches historical docs, not `src/lib/sender-profile.ts`.

### Step 17 — Asset diet + middleware matcher
- **Files:** `src/app/icon.png`, `public/hermesmail_logo.png`, `src/middleware.ts` (56-61).
- **Do:** Re-encode the icon to ≤32 KB (256×256 PNG or ICO) and the logo to ≤80 KB (or convert to SVG/WebP if the source allows). Change the matcher to `"/((?!_next/static|_next/image|favicon.ico|icon.png|images/|.*\\.(?:png|jpg|jpeg|webp|svg|ico)$).*)"`.
- **Accept when:** `icon.png` < 32 KB; with auth enforced, an unauthenticated GET of `/icon.png` returns the image, not a 302 to `/login`.

### Step 18 — Final verification sweep
- **Do:** `npm run lint`, `npx tsc --noEmit`, `npm run build`, then `npm run dev` + `npm run smoke`. Then `npm run cf:build` to confirm the Workers bundle still compiles. Manually walk: sign-in → search (demo) → pipeline drag → draft → approve → simulated send → export.
- **Accept when:** all commands exit 0 and the demo flow completes without console errors. Summarize per-step outcomes (done / skipped+why) in the PR description.

---

*End of audit. Sections 2–4 contain 9 critical, 23 architectural, and 16 UX findings, all grounded to file+line; Section 5 sequences the 18 fixes an execution agent should apply.*
