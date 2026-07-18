# HERMES mail System Constitution

These are the **non-negotiable principles** for this codebase. They exist so the
project stays consistent, safe, and easy to change no matter who (human or agent)
is working on it. If a change would violate a principle here, either don't make
it, or amend this constitution first (with reasoning recorded in
`docs/decisions/`).

---

## Article I — Product invariants (never break these)

1. **Human in the loop, always.** No email is ever sent without an explicit,
   per-lead human approval. There is no "auto-blast", no "approve all + send"
   that skips the approval state. Sending requires `outreach.status === "approved"`.
2. **Works with zero API keys.** The entire app must remain fully usable in
   **demo mode** with no external services. Every integration degrades
   gracefully to a local fallback (sample leads, simulated sends). Never make a
   feature hard-depend on a key.
3. **Send hygiene is on by default.** Rate limiting and clear from-identity ship
   on every outbound email. Do **not** auto-append STOP / unsubscribe mailto /
   placeholder mailing-address footers — bodies must read like a natural email
   (ADR 0012). Guards are opt-out, never opt-in.
4. **Contact-form automation stays a demo-only stub** behind an off-by-default
   flag, with legal/ToS review comments intact. Do not make it submit to real
   sites.
5. **Public web only.** Enrichment must never authenticate into or scrape
   content behind a login.

## Article II — Architecture & layering

1. **Strict dependency direction:**
   `UI (components) → API routes → service layer (src/lib/service.ts) → repository + providers`.
   - UI never imports the DB, providers, or `service` internals directly — it
     goes through `src/lib/client-api.ts` → API routes.
   - API route handlers stay **thin**: validate input, call a service function,
     return JSON. No business logic in routes.
   - Business/coordination logic lives in `src/lib/service.ts`.
2. **Persistence is behind an interface.** All storage goes through
   `LeadRepository` (`src/lib/db/index.ts`). Never read/write `data/db.json`
   directly outside the store implementation. Swapping to Supabase must be a
   single-file change to `getDb()`.
3. **Providers are pluggable and uniform.** Search providers implement
   `SearchProvider`; email transports live behind `sendEmail()`. Adding a
   provider must not touch the UI or services beyond selection logic.
4. **Types are the source of truth.** Domain shapes live in `src/lib/types.ts`.
   Change types first; let errors guide the rest.
5. **`config.ts` owns all env access.** Read `process.env` only in `config.ts`
   (and Next config). Everything else asks `config`/`getCapabilities()`.

## Article III — Code style & quality

1. TypeScript **strict** mode. No `any` unless justified with a comment. Prefer
   precise types and discriminated unions over booleans-soup.
2. **Comments explain _why_, not _what_.** No narrating comments. Do document
   non-obvious intent, trade-offs, and legal/compliance rationale.
3. Keep functions small and single-purpose. Server-only code must never leak to
   the client (use `import type` for cross-boundary types).
4. **Definition of done:** `npx tsc --noEmit` clean, `npm run lint` clean, and
   `npm run smoke` green when the flow is affected.
5. No secrets in the repo. Secrets come from `.env.local` (git-ignored) via
   `config.ts`. Never render secret values in the UI or store them in the DB.

## Article IV — UX & brand

1. **Brand direction is fixed:** ink night-sky base, aurora teal/green + amber
   accents, Fraunces (display) + Space Grotesk (UI). **No purple-on-white, no
   cream+terracotta.** New UI must fit this system (use the CSS variables/
   utilities in `globals.css`).
2. Prefer visual, scannable interfaces (board/cards, table option) over dense
   dashboard chrome. Motion is intentional and minimal (2–3 cues).
3. Every state has a designed empty/loading/error view. Mobile must remain usable.

## Article V — Documentation & memory

1. `AGENTS.md` is the index; `docs/` holds the detail. Keep them accurate.
2. **Record learnings.** Non-trivial discoveries → dated entry in
   `docs/decisions/LEARNINGS.md`. Real decisions with alternatives → a numbered
   ADR in `docs/decisions/`.
3. When code and docs disagree, fix one of them in the same change. Stale docs
   are a bug.

## Article VI — Data & privacy

1. Users own their data; it lives locally by default. Don't add telemetry or
   third-party data sharing without an explicit decision recorded in an ADR.
2. Treat scraped contact data as sensitive PII. Support deletion (reset by
   deleting `data/db.json` today) and don't log full PII unnecessarily.
