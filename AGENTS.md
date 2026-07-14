# AGENTS.md — Working in the Lodestar repo

This file is the **entry point / index** for any AI agent (or human) working in
this repository. Read it first. It is intentionally short: the details live in
`docs/`, and this file just tells you where to look and how to behave.

> **Golden rule:** before writing code, read `docs/constitution.md`. It defines
> the non-negotiable principles that keep this codebase consistent. Every change
> must comply with it.
>
> **Start-of-session:** read [`docs/session-handoff.md`](docs/session-handoff.md)
> for where we left off, and **update it at the end of any session that changes
> state.** (You do not need to be told to read it — it's part of this index.)

---

## What this project is

**Lodestar** — a human-in-the-loop lead-generation studio. Search a niche →
enrich prospects → auto-draft outreach → human approves per lead → send.
Next.js (App Router) + TypeScript + Tailwind, local JSON file DB behind a
repository interface, provider-agnostic search (Firecrawl/Exa) and email
(Resend/SMTP), all with a zero-key demo mode.

## Documentation index (`docs/`)

| Doc | Read it when you need to… |
| --- | --- |
| [`docs/session-handoff.md`](docs/session-handoff.md) | **At session start.** Current state, what's in flight, next steps. |
| [`docs/constitution.md`](docs/constitution.md) | **Always first (before coding).** Principles + rules all code must follow. |
| [`docs/how-it-works.md`](docs/how-it-works.md) | Understand the product, the user flow, and the architecture. |
| [`docs/search-and-enrichment.md`](docs/search-and-enrichment.md) | Touch search, scraping, enrichment, or fit scoring. |
| [`docs/email-providers.md`](docs/email-providers.md) | Change email sending or pick/justify a provider. |
| [`docs/commercialization.md`](docs/commercialization.md) | Work on pricing, plans, auth, or the go-to-market build. |
| [`docs/business-plan.md`](docs/business-plan.md) | Understand the business model / market / strategy. |
| [`docs/decisions/`](docs/decisions/) | Record or review a significant decision (ADR) or a learning. |

Also see [`README.md`](README.md) for setup/run instructions.

## How to work here (quick rules)

1. **Read `docs/constitution.md` before coding.** Then read the doc(s) above
   relevant to your task.
2. **Keep the layering intact.** UI → API routes → `src/lib/service.ts` →
   repository/providers. Never let UI or routes talk to the DB or providers
   directly. See the constitution for the dependency rule.
3. **Never break the two hard invariants:** (a) email only sends from an
   explicitly **approved** outreach, and (b) the app must fully work with **no
   API keys** (demo mode). Add tests/guards, don't remove them.
4. **Types first.** Update `src/lib/types.ts` and let types flow outward.
5. **Verify before you finish:** `npx tsc --noEmit`, `npm run lint`, and — if a
   dev server is up — `npm run smoke`.
6. **Record what you learn.** After any non-trivial change or discovery, add a
   dated entry to `docs/decisions/LEARNINGS.md`, and if it was a real decision
   with alternatives, add an ADR in `docs/decisions/`. Keep docs in sync with
   code — stale docs are worse than none.
7. **Keep all docs current in the same change.** If code changes, update the
   docs in the same session — never leave them stale. Specifically:
   - Any change to the architecture, layering, or data flow → update
     `docs/how-it-works.md` and the project map in this file.
   - Any new env var, external service, or config option → update `.env.example`
     and the relevant doc.
   - Any new phase or decision → add an ADR in `docs/decisions/` and update its
     `README.md` index.
   - At the end of every session that changes state → rewrite the status block
     in `docs/session-handoff.md` (date, recently done, in flight, next steps).
   - If `docs/constitution.md` principles are amended → record an ADR explaining
     why. Constitution changes need explicit justification.
   Stale documentation is treated as a bug, not a nice-to-have (constitution
   Article V.3).

## Commands

```bash
npm run dev          # dev server (http://localhost:3000)
npm run seed         # pre-fill demo leads
npm run build        # production build (run this to catch issues dev hides)
npm run lint         # eslint
npm run smoke        # end-to-end flow test (needs dev server running)
npx tsc --noEmit     # typecheck
```

## Project map

```
src/app/            Routes. Pages + thin API handlers (api/*/route.ts).
src/components/      UI. studio/* is the app; brand/icons/ui are primitives.
src/lib/
  types.ts           Domain models — the source of truth for shapes.
  service.ts         Coordination layer. Business logic lives here.
  config.ts          Env + capability detection (demo vs live).
  db/                Repository interface (LeadRepository) + JSON store (dev) & D1Store (prod).
  search/            Providers (firecrawl/exa), enrichment, demo fallback.
  outreach/          Draft generation + compliance footer.
  email/             Rate-limited sender (resend/smtp/demo).
docs/                All long-form docs (see index above).
scripts/             seed + smoke.
migrations/          SQL migrations for Cloudflare D1 (Wrangler format).
data/                Local JSON DB (git-ignored).
```
