# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still go in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-07-14 (auth fix, Studio split, docs sync, lockfile)

**Stage:** CRM Pipeline working. Studio UI modularized. Docs synced to Search /
Pipeline product shape. Commercial code complete; deploy remains.

**Works today (local, zero keys):** Search → Enrich → Draft → Approve → Send.
Sidebar: **Search, Pipeline, Runs, Settings.**
Auth/metering OFF until `AUTH_SECRET` is set.

**Live keys** (`.env.local`): Firecrawl, Resend. SMTP/Stripe/Turnstile/D1 not yet.

### Recently done (this session)
- **Auth MissingAdapter fix.** Email/magic-link providers (Resend, Nodemailer)
  live only in `src/auth.ts` when a D1 adapter exists. Edge `auth.config.ts`
  keeps Credentials (dev) only — middleware no longer logs MissingAdapter when
  `RESEND_API_KEY` is set locally.
- **`package-lock.json` synced** for `@dnd-kit/*` + `leaflet` (unblocks Cloudflare
  `npm ci`).
- **Studio split:** `PipelineView.tsx`, `RunsView.tsx`, `StudioHelpers.tsx`;
  `Studio.tsx` ~420 lines orchestrator. Deleted dead `AccountMenu.tsx`.
- **Docs synced:** `how-it-works` screens/flow, AGENTS/README maps (migrations
  0001–0006), commercialization, ADR 0007, roadmap Phase A, handoff.
- Docs review: kept all ADRs (incl. superseded 0003); kept business-plan vs
  commercialization as separate strategy vs build docs — no merges needed.

### In flight / next
- **Deploy path** (D1/SMTP/Stripe): `npm run cf:migrate` (through 0006) then
  `npm run cf:deploy`.
- **Phase C** — bulk polish already partly in Pipeline; saved ICPs, reply stubs.

### Known issues / gotchas
- **`npm run smoke` crashes on Windows** (native libuv abort on 2nd `fetch`).
  Prefer Playwright/browser; Chrome DevTools MCP / agent skills are useful for
  UI debugging (see LEARNINGS).
- Dev server recompiles can briefly return HTML to API calls mid-edit; retry.
- PowerShell: use `;` not `&&`.

### Next likely steps
1. Deploy + live-verify commercial path.
2. Or continue Phase C from `docs/roadmap-next.md`.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
