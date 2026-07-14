# 0002. Provider-agnostic search & email with demo fallback

- Status: accepted
- Date: 2026-07-13

## Context
Search/enrichment and email sending are the external dependencies. We want real
capability when keys exist, a fully working app when they don't, and freedom to
change vendors without touching the UI.

## Decision
- **Search:** a `SearchProvider` interface with Firecrawl (preferred) and Exa
  implementations; `runSearch()` selects one and **falls back to demo data** on
  missing key or any error.
- **Email:** `sendEmail()` tries Resend → SMTP (Nodemailer) → demo (simulated),
  chosen by which env vars are present.
- **Capabilities** are detected centrally in `config.ts` and surfaced in the UI.

## Alternatives considered
- Hard-wire one vendor: simpler, but breaks zero-key demo mode and creates
  lock-in.
- Require keys to use the app: rejected — violates constitution Article I.

## Consequences
- ✅ App always works; live features light up when configured.
- ✅ New providers (e.g. Amazon SES, a Places source) drop in behind the same
  interfaces — see `docs/email-providers.md` and `docs/search-and-enrichment.md`.
- ⚠️ Selection logic must stay in one place (search/index + sender); don't
  scatter provider `if`s across the app.
