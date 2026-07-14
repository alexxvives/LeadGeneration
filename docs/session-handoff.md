# Session Handoff — current state & next steps

**Purpose:** the running "where we are" note so a new chat/session can pick up
without re-deriving context. `AGENTS.md` points every agent here. **Read this
first, and update the top block at the end of any session that changes state.**

> Keep it short. This is a pointer to truth (code + `docs/`), not a second copy
> of it. Durable decisions still go in `docs/decisions/` (ADRs + LEARNINGS).

---

## ⏱️ Status — updated 2026-07-14 (Pipeline UX polish + DevTools MCP + lockfile regen)

**Stage:** CRM Pipeline polished (column actions, collapsible lost, table/map).
`chrome-devtools-mcp` wired in Cursor. Lockfile regenerated for CF `npm ci`.

**Works today (local, zero keys):** Search → Enrich → Draft → Approve → Send.
Sidebar: **Search, Pipeline, Runs, Settings.**
Auth/metering OFF until `AUTH_SECRET` is set.

**Live keys** (`.env.local`): Firecrawl, Resend. SMTP/Stripe/Turnstile/D1 not yet.

### Recently done (this session)
- **chrome-devtools-mcp** added to `~/.cursor/mcp.json` — reload MCP in Cursor.
- **Pipeline UX:** Draft/Approve all in New header; Send all in Contacted;
  Not Interested collapsed by default (4-column main grid); droppable when closed.
- **Lead table:** phone under email; StatusPill nowrap (“In review”); Subject
  column removed.
- **Map pins** colored by `crmStage` + legend.
- **`package-lock.json` regenerated** (dnd-kit + leaflet present) — retrigger CF
  build on this commit if prior log was from before `0bbcef9`.

### In flight / next
- **Deploy:** clear CF dependency cache if `npm ci` still fails after this push;
  then `cf:migrate` + `cf:deploy`.
- Phase C / more UX via standing audit prompt in `docs/roadmap-next.md`.

### Known issues / gotchas
- **`npm run smoke` crashes on Windows** — prefer Playwright / chrome-devtools.
- PowerShell: use `;` not `&&`.
- After MCP config change: Cursor → Settings → MCP → refresh/reload servers.

### Next likely steps
1. Confirm Cloudflare build on this commit succeeds.
2. Deploy + live-verify, or paste the UX audit prompt for another polish round.

---

## How to update this file
Rewrite the **Status** block at end of any session that changes state.
