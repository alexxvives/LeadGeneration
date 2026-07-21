# Search & Enrichment

This is the heart of the product, so it deserves an honest assessment: **what
the MVP does today, where it is and isn't "smart", and the roadmap to make it
genuinely good.**

---

## What happens today (Phase B)

Code: `src/lib/search/` (`index.ts`, `query.ts`, `firecrawl.ts`,
`enrich.ts`, `demo.ts`) and `src/lib/fit-score.ts`.

**Provider:** Firecrawl only. Demo is never a silent fallback for live searches
— use “Load demo data” for that.

1. **Query building** (`query.ts` → `buildQuery`): one query
   `"{niche} in {location}"` (or niche alone) that finds **businesses**, not
   contact-form pages. Fill modes:
   - **Standard** — stop at N companies (email optional).
   - **Complete** — keep companies without email, continue until N have an
     email (total may exceed N; overfetches ~3×N, hard-capped for Workers).
   Every company is **kept** with phone/address/category even without email.
2. **Firecrawl search + scrape:** `/v1/search`, then per hit: scrape the
   **landing** page (`onlyMainContent: false` — header/footer) first. If still
   no email → `/contacto` then `/contact`. **No `/map`**. Skip scrape when the
   search snippet already has an email. Regex: emails, phones, address;
   `suggestCompanyType` for category. AI blurb polish is optional/cheap.
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
5. **Fit score** (`fit-score.ts`): **niche + location first** (up to ~75), then
   contactability (up to ~25) scaled down when relevance is weak — so a random
   email with no niche signal stays low. No free points for “appeared in
   search”. Location mismatch can erase the score. Imports use the same rubric
   via `scoreImportedLead` (contactability-led when there is no niche). Every
   point is explained in `fitReasons` in the Lead detail drawer.
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
- **The fit score is relevance-first** (niche tokens + location), with
  contactability as a secondary boost. It is still heuristic — not LLM ICP
  reasoning.
- **Contact pages were shallow.** Mitigated 2026-07-20 (Firecrawl deepen +
  optional JSON extract). Still no full-site crawl or people-DB email finder.

None of this is a bug — it's an intentional MVP scope with graceful fallback.
The roadmap below is how it becomes a real moat.

## Roadmap to a genuinely smart pipeline

Ordered by impact-to-effort. Each step is isolated to `src/lib/search/` so it
won't disturb the approval/send flow.

### Tier 1 — high impact, low effort
1. **Structured extraction instead of regex.** ✅ _Partial_ — Workers AI (optional)
   rewrites lead `aboutBlurb`; Firecrawl JSON extract runs when contact crawl
   still finds no email. Heuristic regex remains the zero-key path.
2. **Email verification.** ✅ _Shipped (send-time, ADR 0016)_ — **MyEmailVerifier**
   (`MYEMAILVERIFIER_API_KEY`) primary; Zeruh legacy only. Blocks hard
   undeliverables at send. Plan-tiered daily caps. Still to do: persist a
   `deliverable` flag on the lead.
3. **Smarter query building.** ✅ _Baseline_ — single `niche in city` query +
   Standard/Complete fill modes. Still to do: LLM synonym/ICP expansion.
4. **Shallow site crawl.** ✅ _Shipped_ — landing header/footer first, then
   `/contacto` → `/contact` only if needed; `/map` unused.

### Addon spike (deferred — prefer Firecrawl juice first)
5. **People-DB email finder (e.g. Prospeo)** — **deferred / likely overkill.**
   Another paid key for a gap Firecrawl contact-path deepen should close for
   most SMB sites. Revisit only if measured email-found % stays low after
   deepen. **Non-goals:** Apollo, MillionVerifier, PlusVibe send, AI Ark.

### Tier 2 — the local-business unlock
6. **Places/Maps data for local ICPs.** For "dentists in Austin"-type queries, a
   Google Places / OpenStreetMap-style source gives authoritative name, address,
   phone, website, rating, and review count — then scrape the site for email.
   This is the right primary source for local lead-gen and should sit alongside
   web search as a provider.

### Tier 3 — real intelligence
7. **ICP fit via the model, not just heuristics.** Given the user's ICP + offer,
   score each enriched profile with an LLM/embedding similarity and produce a
   short "why this fits" that's about *fit*, not just contactability. Keep the
   transparent-reasons UX.
8. **Dedup + entity resolution** across sources (same business, different URLs).
9. **Caching + incremental runs** so re-searching a niche is cheap and doesn't
   re-scrape.
10. **Compliance-aware source filtering** (respect robots/ToS, never login-gated —
   already a constitution rule; enforce in code).

## Prospeo spike (design only — do not ship yet)

**Gap Firecrawl cannot close:** many sites never publish a mailto; the inbox
lives in a people database (name + company domain → work email).

**Trigger (strict):** after Firecrawl search + deepen + JSON extract, lead has
`emails.length === 0` AND a resolvable domain AND (optional) `contactName`.

**Call shape (sketch):**

```ts
// src/lib/search/prospeo.ts — not implemented
findEmail({ fullName?, company, domain }) → { email, verified } | null
```

**Wiring:** one optional step at the end of `runSearch` / lead enrich, behind
`PROSPEO_API_KEY`. No key → skip (demo-safe). Never a second search provider.
Never call on leads that already have an email. Count against a plan quota if
shipped.

**Ship criteria:** run 50 live leads; if Prospeo recovers ≥20% of “no email”
cases at acceptable $/email, add provider. Else drop.

**Non-goals:** Apollo, AI Ark, MillionVerifier, PlusVibe send — until this spike
is accepted or rejected.

## Design constraints (keep these)

- Every provider must degrade to demo data (Article I of the constitution).
- Keep fit-score reasoning **transparent** — no black-box number.
- Public web only; no login-gated scraping.
- Isolate all of this in `src/lib/search/`; the rest of the app shouldn't care
  how a `Lead` was produced.
- Prefer **one** scrape path (Firecrawl) and **one** verify path (MyEmailVerifier).

## Provider notes

- **Firecrawl** — sole live search path (search + full-page scrape + map deepen).
- **MyEmailVerifier** — sole marketed verify (ADR 0016).
- Consider a **Places** source for local business ICPs (Tier 2).
