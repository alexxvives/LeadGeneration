# Learnings Log

Append dated entries. Newest at top. Keep each entry short and factual.

---

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
