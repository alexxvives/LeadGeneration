# Search & Enrichment

This is the heart of the product, so it deserves an honest assessment: **what
the MVP does today, where it is and isn't "smart", and the roadmap to make it
genuinely good.**

---

## What happens today (Phase B)

Code: `src/lib/search/` (`index.ts`, `query.ts`, `firecrawl.ts`, `exa.ts`,
`enrich.ts`, `demo.ts`) and `src/lib/fit-score.ts`.

1. **Query building** (`query.ts` → `buildQueries`): the search hero exposes a
   **Search mode** toggle backed by `CreateRunInput.searchStrategy`:
   - `standard` — one focused query (`niche + location + "contact email"`).
     Fastest, one provider call. Default.
   - `smart` — expands the ICP into several phrasings (contact page, official
     site, "top … in …") that are run and merged. Higher recall, ~3× credits.
   - `local` — phrasings tuned for brick-and-mortar / near-me businesses
     (directory-style, reviews, phone/address). Best when Location is filled in.
   For expanded modes, results are deduped by URL, enriched, deduped again by
   domain, then **ranked by fit score** and capped to the per-run limit.
   Single-query keeps the provider's native ranking.
2. **Provider search**: calls **Firecrawl** `/v1/search` (preferred), which
   searches the web and scrapes each result page's main content. Falls back to
   **Exa** if only that key exists. Both degrade to demo data with no key.
3. **Enrichment** (`enrich.ts`) — Phase B improvements shipped 2026-07-14:
   - **Company name**: splits the page title on common separators (` | `, ` - `,
     ` — `, `:`), skips generic segments ("Contact Us", "Home", "About", "Welcome
     to"), and takes the first non-generic brand segment. If no title segment
     survives, falls back to a prettified domain base ("bright-dental" →
     "Bright Dental").
   - **Email extraction**: regex pull of email addresses, then a hygiene pipeline:
     plausibility check (single `@`, valid TLD length, no edge/double dots),
     disposable-domain block list, junk-pattern filter (`noreply`, `donotreply`,
     `admin`, etc.), and **personal-before-generic ranking** so the most
     contactable address (e.g. `sarah@co.com`) outranks role addresses
     (`info@`, `hello@`).
   - **Phone extraction**: E.164-style regex, international + NANP formats.
   - **Location**: `City, ST` format is only accepted for valid US/CA region
     codes (2-letter, against a known set) — prevents prose false-positives
     ("Learn, MO…") from polluting map pins. Street addresses are preferred over
     city+state when present.
   - **About blurb**: first substantial sentence from the scraped markdown,
     used for personalization in drafts.
4. **Dedup**: collapses results by domain, then by company name (case-insensitive).
5. **Fit score** (`fit-score.ts`): a **transparent heuristic starting at 0**
   (no free “search match” baseline). Contactability (email / phone / website /
   named contact / blurb) + niche keyword hits + location match; penalties for
   location mismatch. Imports use the same rubric via `scoreImportedLead`.
   Every point is explained in `fitReasons` in the Lead detail drawer.
6. **Fallback**: no key, zero results, or any provider error → deterministic
   **demo leads** from `demo.ts` so the UI always works (constitution Art. I.2).

## Is it "smart"? — Honest answer

**Not yet. It's a solid, transparent baseline, not intelligent.** Be clear-eyed
about the limitations:

- **Keyword search, not ICP reasoning.** We pass a naive query and trust the
  search engine's ranking. There's no query expansion, no synonyms, no
  understanding of what makes a business a *good* fit beyond surface signals.
- **Regex extraction is brittle.** It finds mailto-style emails and obvious phone
  formats but misses obfuscated emails ("name [at] company dot com"), contact
  pages one click away, and JS-rendered content. It can also grab role addresses
  or junk.
- **No verification.** Emails aren't validated (deliverability/MX), so some are
  dead. This is the single biggest quality lever for outreach.
- **Shallow personalization signal.** The "about" blurb is the first long
  sentence — fine, but not a real summary of what the business does or a hook.
- **The fit score blends contactability + light ICP signals** (niche tokens in
  company/blurb, location). It is still heuristic — not LLM ICP reasoning.
- **Single page per result.** We don't crawl the site (about/team/contact pages)
  to build a fuller profile.

None of this is a bug — it's an intentional MVP scope with graceful fallback.
The roadmap below is how it becomes a real moat.

## Roadmap to a genuinely smart pipeline

Ordered by impact-to-effort. Each step is isolated to `src/lib/search/` so it
won't disturb the approval/send flow.

### Tier 1 — high impact, low effort
1. **Structured extraction instead of regex.** ✅ _Partial_ — Workers AI (optional)
   rewrites lead `aboutBlurb` from scraped text after live search. Still to do:
   Firecrawl `/extract` for typed `{ company, emails[], phones[], contactName, services[] }`.
   Heuristic extract remains the zero-key fallback.
2. **Email verification.** ✅ _Shipped (send-time)_ — Zeruh via
   `MAILEROO_VERIFY_API_KEY` / `ZERUH_API_KEY` in `sendApprovedOutreach`. Blocks
   hard undeliverables. Not run on enrich (credit cost + Excel import parity).
   Still to do: persist a `deliverable` flag on the lead for UI ranking.
3. **Smarter query building.** ✅ _Shipped_ — `query.ts` expands the niche into
   multiple queries for the `smart`/`local` strategies and merges them. Still to
   do: LLM-driven synonym/ICP expansion and site-type hints (e.g. exclude
   aggregators/directories when you want the business's own site).

### Tier 2 — the local-business unlock
4. **Places/Maps data for local ICPs.** For "dentists in Austin"-type queries, a
   Google Places / OpenStreetMap-style source gives authoritative name, address,
   phone, website, rating, and review count — then scrape the site for email.
   This is the right primary source for local lead-gen and should sit alongside
   web search as a provider.
5. **Shallow site crawl.** For each business site, fetch a couple of likely pages
   (`/contact`, `/about`, `/team`) to raise email-hit rate and profile depth.

### Tier 3 — real intelligence
6. **ICP fit via the model, not just heuristics.** Given the user's ICP + offer,
   score each enriched profile with an LLM/embedding similarity and produce a
   short "why this fits" that's about *fit*, not just contactability. Keep the
   transparent-reasons UX.
7. **Dedup + entity resolution** across sources (same business, different URLs).
8. **Caching + incremental runs** so re-searching a niche is cheap and doesn't
   re-scrape.
9. **Compliance-aware source filtering** (respect robots/ToS, never login-gated —
   already a constitution rule; enforce in code).

## Design constraints (keep these)

- Every provider must degrade to demo data (Article I of the constitution).
- Keep fit-score reasoning **transparent** — no black-box number.
- Public web only; no login-gated scraping.
- Isolate all of this in `src/lib/search/`; the rest of the app shouldn't care
  how a `Lead` was produced.

## Provider notes

- **Firecrawl** — search + scrape + `/extract`; best single dependency for
  Tier 1. (During setup the MCP search returned HTTP 401 — verify the key is
  active if the app stays in demo mode.)
- **Exa** — strong semantic/neural search; good for discovery and as a fallback.
- Consider a **Places** source for local business ICPs (Tier 2).
