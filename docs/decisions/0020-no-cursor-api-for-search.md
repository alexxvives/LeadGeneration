# 0020. Cursor API is not a Firecrawl alternative

- Status: accepted
- Date: 2026-07-21
- Relates to: [0002](0002-provider-agnostic-integrations.md), [0017](0017-insider-shared-free-pool.md), [0018](0018-insider-raw-firecrawl-credits.md)

## Context

Insiders share a Firecrawl credit pool. Cursor Pro (~$60/mo) and cheap Grok
models raise the idea of using a Cursor API key (or Cursor agents) as an
Insider-only scrape/search backend to cut Firecrawl spend.

**IDE chat ≠ API.** Building a lead spreadsheet in Cursor’s UI (chat + MCP
tools like Firecrawl/browser, human-driven) is offline research. That does
**not** mean `CURSOR_API_KEY` / `@cursor/sdk` can power the app’s multi-tenant
Find-leads pipeline. The SDK runs coding agents against a repo/VM; it is not a
web search/scrape API you call per niche from a Worker.

HERMES live search needs: web search → fetch/JS-render → markdown → enrich →
fit score ([`SearchProvider`](../../src/lib/search/providers.ts),
[`docs/search-and-enrichment.md`](../search-and-enrichment.md)).

## Decision

1. **Do not** wire `CURSOR_API_KEY`, `@cursor/sdk`, or Cursor cloud/local agents
   into search, scrape, or enrichment. Cursor’s SDK runs coding agents against a
   repo/VM — it is not a web search/scrape API and is unsuitable as a
   multi-tenant Worker lead pipeline.
2. **Do not** treat a Cursor IDE subscription as Worker-side scrape capacity.
3. **Keep Firecrawl** as the sole live `SearchProvider` (ADR 0002 / locked stack).
4. **Deferred follow-up (chosen path A):** if we spend cheap LLM budget on
   Insider search quality/COGS, add an **optional extract/polish step after
   Firecrawl markdown** (xAI Grok or an existing stack model: Workers AI / Groq /
   Gemini) — email/phone/about — gated to Insider or when configured. Still
   Firecrawl for find+fetch.
5. **Path B deferred further:** a second `SearchProvider` (web search API +
   HTTP fetch + regex/LLM extract), Insider-only, only if measured Firecrawl
   cost remains the bottleneck after A.

## Alternatives considered

- **Cursor agents as scrape farm** — rejected: wrong product surface, slow,
  stateful, ToS/risk for tenant workloads, still needs a web tool underneath.
- **LLM-only “search” (Grok without fetch)** — rejected: cannot discover or
  fetch business URLs; at best improves extraction of markdown we already have.
- **Replace Firecrawl now with Serper/Brave + fetch** — deferred (path B): real
  cost cut possible later, but larger quality/ops risk than A; keep one live
  provider until measured pain.

## Consequences

- No `@cursor/sdk` dependency; no `CURSOR_*` env for lead gen.
- Agents must not re-propose Cursor as a Firecrawl substitute without
  superseding this ADR.
- Path A (when built): stays behind `SearchProvider` + enrich layer; update
  `.env.example`, `config.ts`, and `docs/search-and-enrichment.md` in the same
  change. Demo/zero-key path unchanged (constitution Art. I.2).
- Path B (when built): new provider module + Insider gate in search selection;
  Firecrawl remains default/fallback.
