# HERMES mail — hygiene & efficiency audit (2026-08-08)

**Type:** Read-only. No deletes/refactors until approved.  
**Verified:** `npx tsc --noEmit` clean; `npm run lint` exit 0 (4 warnings).  
**Supersedes for prioritization:** root `AUDIT_REPORT.md` (2026-07-19) — many P0s there are **already fixed**; do not re-open them without re-checking evidence below.

Living fix board remains [`AUDIT.md`](AUDIT.md). This file is the findings dump.

---

### A. Executive summary

The architecture (thin routes → `service.ts` → repo/providers, demo mode, approve→claim→send) is still sound. July’s fatal security items (hardcoded admin password, HTML sanitizer XSS, AUTH fail-open on D1, auth rate limits, atomic send claim) are **fixed**. Remaining pain is **Workers-scale**: sync search in one request, full-table `listLeads()` for dedupe, Pipeline polling every 15s, and quota gates that still race after atomic increments. Product drift: **Easy-only send is live** (Resend / Maileroo / **Hostinger SMTP**) while Pro/Gmail code + several docs still describe mailbox send as current. Root clutter (LUMIA import dumps, `.firecrawl/`, tracked `scripts/.wrangler/tmp`, stale `AUDIT_REPORT.md`) and a few orphaned modules (`ProfilePicker`, `identity.ts`) are safe cleanup once approved. No P0 exploit found in this pass; highest ROI is PERF-01/02 + deciding Pro mailbox fate + deleting confirmed dead files.

---

### B. Findings table

| ID | Severity | Category | Finding | Evidence | Suggested fix | Safe to delete? |
|----|----------|----------|---------|----------|---------------|-----------------|
| PERF-01 | P1 | workers-scale | Search+enrich+optional AI drafts still run inside one `POST /api/runs` Worker request; `healStuckSearchRuns` exists because runs die mid-flight | `service.ts` `createAndRunSearch`; `api/runs/route.ts`; `healStuckSearchRuns` ~2982 | Background queue/DO; client polls `GET /api/runs/:id`. Keep cap until then | No |
| PERF-02 | P1 | perf | Cross-run search + import dedupe loads **all** workspace leads via `listLeads()` | `service.ts:727`, `service.ts:2679` | Repo `existsByDomain` / `WHERE domain IN (…)`; board-scoped import maps without full scan | No |
| PERF-03 | P2 | perf | `getLatestBoard` calls `listRuns()` then `.find` in JS every board read | `service.ts:955–962`; `d1-store` `listRuns` | `getLatestCompletedRun(boardId?)` `ORDER BY … LIMIT 1` | No |
| PERF-04 | P2 | perf | Orphan board backfill once per isolate still `listLeads()` + `listRuns()` | `service.ts:182–190` | SQL `UPDATE … WHERE board_id IS NULL` or workspace flag | No |
| PERF-05 | P2 | perf | Pipeline soft-refreshes full board path every 15s (paged/slim helps, still heavy) | `Studio.tsx:821–828` | Delta/`updatedAt` endpoint; refetch bodies on change only | No |
| PERF-06 | P3 | perf | Shared-board summaries still N+1 `resolveBoardAccess` + counts | `service.ts:266–287` | Batch shared-board metadata | No |
| PERF-07 | P3 | deps | `exceljs` / `leaflet` in client trees — mitigated by dynamic `import()` | `ImportLeadsPanel`, `LeadMap`, `LandingProductPreview` | Keep dynamic; avoid loading map when view ≠ map | No |
| SEND-01 | P2 | dead-code | `resolveSendPath()` hardcodes `"easy"`; `tryGoogle` / `path === "pro"` unreachable; mailbox APIs remain | `sender.ts:102–105,134–254`; `api/mailbox/**`; `mailbox.ts` | Product decision: restore Pro **or** gate/remove Gmail path + docs | Gmail branch only after decision |
| SEND-02 | P2 | security | Usage **increments** atomic; send/lead **gates** still read-then-act (TOCTOU) | `d1-store.ts:430–448` `incrementWorkspaceUsage`; `service.ts:1410–1425` | Conditional `UPDATE … WHERE sends_used < ?` + check `meta.changes` | No |
| SEC-01 | P2 | security | BYO Resend/Maileroo/SMTP secrets stored plaintext in D1; only Gmail tokens use `encryptSecret` | `d1-store` `resend_api_key` columns; `token-crypto.ts`; `mailbox.ts` encrypt | Encrypt at rest with same helper; migrate existing rows | No |
| LAY-01 | P2 | layering | Studio UI imports `@/lib/email/*` (warmup, domain-health types) | `Studio.tsx`, `OutreachView`, `MailboxAgePicker`, `DomainHealthChecklist` | Client-safe types/utils module; fetch stays on API | No |
| LAY-02 | P2 | layering | Fat routes: Firecrawl usage, Resend domain-health, mailbox OAuth, webhooks do provider/DB work | `api/providers/firecrawl/usage`, `resend/domain-health`, `mailbox/google/*`, webhooks | Move into service helpers; keep routes thin | No |
| LAY-03 | P3 | layering | `process.env.NODE_ENV` outside `config.ts` | `cf.ts:20`; `middleware.ts:55` | `env.isProduction()` in `config.ts` | No |
| LAY-04 | P3 | layering | Client imports outreach sanitize/draft-preview (pure helpers; OK-ish if no Node leaks) | `LeadDrawer`, `SenderProfileForm`, `PitchEditor` | Keep `*-client` / `draft-preview` split; audit bundle | No |
| DOC-01 | P2 | docs-drift | `how-it-works.md` live send row still says “connected Gmail, Resend, or SMTP” — Gmail not product-live | `docs/how-it-works.md:138` vs `sender.ts` Easy-only | Rewrite table: Easy Resend/Maileroo/SMTP (+ demo); Pro/Gmail deferred | N/A |
| DOC-02 | P2 | docs-drift | `email-providers.md`, `gmail-oauth-setup.md`, roadmaps still brand “Lodestar” and imply Pro mailbox current | `docs/email-providers.md`, `roadmap-send-paths.md`, `gmail-oauth-setup.md` | Rebrand + mark Pro as deferred/API-only | N/A |
| DOC-03 | P3 | docs-drift | `docs/AUDIT.md` L1 claims `StatusPill` unused — it is used | `AUDIT.md` L1 vs `LeadTable.tsx` | Mark done note stale / update board | N/A |
| DOC-04 | P3 | docs-drift | ADR 0022 notes ProfilePicker “may remain unused” — confirmed orphan | `0022-board-outreach-profile.md:50`; zero importers | Delete component when approved | Yes (component) |
| DEAD-01 | P3 | dead-code | `ProfilePicker.tsx` zero importers | `src/components/studio/ProfilePicker.tsx` | Delete | **safe** |
| DEAD-02 | P3 | dead-code | `identity.ts` zero importers | `src/lib/identity.ts` | Delete; wizard no longer uses it | **safe** |
| DEAD-03 | P3 | dead-code | Root forensic clutter + tracked wrangler tmp | See §C | Delete + gitignore `scripts/.wrangler/` | **safe** |
| DEAD-04 | P3 | dead-code | `EmailSettingsForm` `variant="pro"` path unused (no caller) | `EmailSettingsForm.tsx:61,127` | Trim pro variant after Pro decision | needs product decision |
| DEAD-05 | P3 | dead-code | `/api/settings` has no in-repo callers | `api/settings/route.ts` | Confirm ops use; else remove or document | needs product decision |
| DEAD-06 | P3 | dead-code | `/api/auth/password-login` shim; client uses `/api/password-login` | shim + `middleware.ts` allowlist | Keep until traffic gone; then remove | needs product decision |
| DEAD-07 | P3 | dead-code | Zeruh usage alias kept for bookmarks | `api/providers/zeruh/usage` → verify; ADR 0024 | Keep alias or 410 after notice | needs product decision |
| DEAD-08 | P3 | deps | Direct `@dnd-kit/utilities` unused in `src` (still transitive via sortable); `@types/exceljs` redundant (exceljs ships types) | `package.json` | Drop direct unused deps | **safe** (lockfile may still pull utilities) |
| UX-01 | P3 | ux-consistency | Lint: unused `isAdmin` in `Studio.tsx`; hook dep warnings | lint output `Studio.tsx:185` etc. | Quick cleanup | No |
| POS-01 | — | security | Approve + `claimOutreachForSend` healthy; demo rejected when metered | `d1-store` claim; `sendApprovedOutreach` | Keep | No |
| POS-02 | — | layering | `client-api.ts` is the correct studio data path; no UI→`service`/`db` | `client-api.ts` | Keep | No |
| POS-03 | — | security | Settings exposes `hasResendKey` / `hasMailerooKey` / `hasSmtpPass` only | `profile-send-settings.ts`; `EmailSettingsForm` | Keep | No |

**Old AUDIT_REPORT P0s — current status (do not re-fix as open):**

| Old | Topic | Status |
|-----|--------|--------|
| C2.1 | Bootstrap `admin`/`password` | Fixed — `BOOTSTRAP_ADMIN_PASSWORD` or one-time UUID (`auth-users.ts`) |
| C2.2 | rich-text XSS entity re-inject | Fixed — `escapeHtml(textContent)` |
| C2.3 | Non-atomic usage increments | Fixed increments; gate race remains as **SEND-02** |
| C2.4 | Sync search | Still open as **PERF-01** (cap improved vs 500) |
| C2.6 | AUTH fail-open | Fixed on D1 (503); demo without secret intentional |
| Auth RL | Login/register | Fixed — `auth-rate-limit.ts` + migration 0023 |
| Favicon 546KB / middleware | | **Stale** — `icon.png` ~12KB now |

---

### C. Delete candidates

| Path | Why | Risk |
|------|-----|------|
| `src/components/studio/ProfilePicker.tsx` | Unused; ADR 0022 removed from chrome | **safe** |
| `src/lib/identity.ts` | Unused exports; wizard no longer checks it | **safe** |
| `AUDIT_REPORT.md` | Superseded by this doc + `docs/AUDIT.md` | **safe** (archive optional) |
| `import-skip-analysis.json`, `import-skipped-rows.csv`, `skipped-from-LEADS-vs-LUMIA.{csv,json}` | One-off LUMIA import forensics (~200KB+ in git) | **safe** |
| `scripts/export-skipped.mjs` | Only regenerates the CSV above | **safe** |
| `.firecrawl/mev-api.md`, `.firecrawl/mev-github.md` | Scraped notes; not app source | **safe** |
| `scripts/.wrangler/tmp/**` (tracked) | Wrangler temp; root `.wrangler/` already ignored | **safe** — add `scripts/.wrangler/` to `.gitignore` |
| `package.json` → `@types/exceljs` | exceljs bundles types | **safe** |
| `package.json` → `@dnd-kit/utilities` as **direct** dep | No `src` import; still transitive | **safe** as direct-dep removal |
| `src/app/api/mailbox/**`, `src/lib/email/mailbox.ts`, Pro branches in `sender.ts` | UI removed; `resolveSendPath` always easy | **needs product decision** (handoff: “Optional later: Pro mailbox”) |
| `src/app/api/providers/zeruh/usage/route.ts` | Deprecated alias | **needs product decision** (ADR 0024) |
| `src/app/api/auth/password-login/route.ts` | Compat shim | **needs product decision** |
| `src/app/api/settings/route.ts` | No in-repo caller | **needs product decision** |
| `src/app/api/contact-form/route.ts` | Stub; smoke-only; constitution Art. I.4 | **needs product decision** — keep for demo invariant unless smoke updated |
| Local only (gitignored): `LEADS.xlsx`, `dev.log`, `tsconfig.tsbuildinfo` | Not source | **safe** locally |

**UI removed but API kept (not true dead code without a product call):**

1. Pro / Gmail mailbox — Settings Easy-only; APIs + DB columns remain.  
2. Zeruh verify URL alias.  
3. `/api/auth/password-login` shim.  
4. Contact-form automation stub (constitution).  
5. `/login` redirect-only page (Auth.js `pages.signIn`).

---

### D. Quick wins (≤1 day) vs larger bets

**Quick wins**

1. Delete §C **safe** files; gitignore `scripts/.wrangler/`; drop unused deps.  
2. Fix **DOC-01** / brand “Lodestar” → HERMES mail in active how-to docs.  
3. **LAY-03** — `NODE_ENV` via `config.ts`.  
4. **UX-01** lint cleanups (`isAdmin`, eslint-disable).  
5. Trim dead `EmailSettingsForm` `variant="pro"` **if** Pro stays deferred.  
6. **PERF-03** — `LIMIT 1` latest run query (small, high leverage on every board load).

**Larger bets**

1. **PERF-01** — async search (Queues / DO) + progress polling.  
2. **PERF-02** — indexed dedupe (domains/emails) without full-table load.  
3. **SEND-01** — ship Pro mailbox or delete the stack (ADR amend 0010).  
4. **SEND-02** + **SEC-01** — conditional quota claim + encrypt BYO keys.  
5. **PERF-05** — Pipeline delta polling.  
6. **LAY-01/02** — peel provider I/O out of routes and email imports out of UI.

---

### E. Explicit non-goals / wontfix

| Item | Why intentional |
|------|-----------------|
| Contact-form automation stays stub | Constitution Art. I.4; smoke covers it |
| Demo mode / no `AUTH_SECRET` opens local app | Constitution Art. I.2; production D1 requires secret |
| Human approve / no auto-blast | Constitution Art. I.1; `claimOutreachForSend` |
| Layering + `config.ts` owns secrets | Constitution Art. II |
| Zeruh alias kept temporarily | ADR 0024 |
| Pro mailbox deferred not deleted | Session handoff + ADR 0010; roadmap-send-paths |
| Stop/unsubscribe auto-footers | ADR 0012 |
| Pitch AI without heuristic fallback | ADR 0013 |
| No auto-default board | ADR 0023 |
| Shared Lodestar/Hermes From-domain | Explicitly rejected in email-providers research |
| D1 DB name `lodestar-prod`, `lodestar_*` / `leadify_*` localStorage + webhook tags | Live infra / backward compat — rename is a migration project, not hygiene delete |
| Historical ADRs (e.g. superseded Supabase) | Keep as decision history |
| Big framework migrations / pricing redesign | Out of scope per audit brief |

---

### Suggested approval order

1. Approve §C **safe** deletes + docs brand/send-path fixes.  
2. Decide **Pro mailbox**: restore vs strip.  
3. Schedule PERF-01/02 (scale) and SEND-02/SEC-01 (billing/security hardening).
