# Decisions & Learnings

This folder is the project's **memory**. Two kinds of entries:

- **ADRs (Architecture Decision Records)** — numbered files (`NNNN-title.md`) for
  significant decisions with alternatives and consequences. Add one whenever you
  make a choice a future contributor might otherwise re-litigate.
- **[`LEARNINGS.md`](LEARNINGS.md)** — a running, dated log of smaller discoveries
  ("this API returns X", "this tool has quirk Y"). Append; don't rewrite history.

## When to add what

| Situation | Where |
| --- | --- |
| Chose a library/pattern/provider over alternatives | New ADR |
| Reversed or amended a past decision | New ADR that supersedes the old one |
| Discovered a gotcha, quirk, or non-obvious fact | `LEARNINGS.md` entry |
| Changed a product invariant | Amend `../constitution.md` + ADR |

## ADR template

```md
# NNNN. <Title>
- Status: proposed | accepted | superseded by NNNN
- Date: YYYY-MM-DD

## Context
What forces are at play?

## Decision
What we chose.

## Alternatives considered
Options + why not.

## Consequences
Trade-offs, follow-ups, what this makes easy/hard.
```

## Index

- [0001 — Local JSON file DB behind a repository interface](0001-json-file-db.md)
- [0002 — Provider-agnostic search & email with demo fallback](0002-provider-agnostic-integrations.md)
- [0003 — Supabase for auth + database](0003-supabase-auth-and-db.md) _(superseded by 0005)_
- [0004 — Cloudflare Workers via @opennextjs/cloudflare as the deploy target](0004-cloudflare-opennext-deploy.md)
- [0005 — Switch database to Cloudflare D1 and auth to Auth.js](0005-switch-to-d1-auth-js.md)
- [0006 — Workspace schema & service-layer isolation](0006-workspace-schema-and-isolation.md)
- [0007 — Auth.js session strategy: JWT + split edge/server config](0007-authjs-jwt-sessions.md)
- [0008 — Stripe billing + service-layer quota model](0008-stripe-quota-model.md)
- [0009 — Resend for send, Maileroo/Zeruh for verify](0009-resend-send-maileroo-verify.md) _(amended by 0011 for Easy send; **verify → [0016](0016-myemailverifier-primary-verify.md)**)_
- [0010 — Google / Microsoft mailbox OAuth behind sendEmail()](0010-mailbox-oauth-send.md) _(accepted — Google first; multi-inbox deferred)_
- [0011 — Easy send: Resend or Maileroo (BYO)](0011-easy-resend-or-maileroo.md)
- [0012 — Natural email bodies — no STOP footer](0012-natural-email-bodies-no-stop-footer.md) _(amends constitution Art. I.3)_
- [0013 — Pitch AI: no heuristic fallback](0013-pitch-ai-no-heuristic-fallback.md)
- [0014 — First-class Boards for lead collections](0014-boards.md)
- [0015 — Board sharing with soft presence lock](0015-board-sharing-soft-lock.md)
- [0016 — MyEmailVerifier is the primary email verify provider](0016-myemailverifier-primary-verify.md) _(amends 0009 verify path)_
- [0017 — Hidden Insider plan with shared free-credit pool](0017-insider-shared-free-pool.md) _(credit display amended by [0018](0018-insider-raw-firecrawl-credits.md))_
- [0018 — Insider shows raw Firecrawl remaining credits](0018-insider-raw-firecrawl-credits.md)
- [0019 — Admin Find-leads toggle + account deletion](0019-find-leads-toggle-account-deletion.md)
- [0020 — Cursor API is not a Firecrawl alternative](0020-no-cursor-api-for-search.md) _(deferred: Insider Grok/LLM extract on FC markdown)_
### Research notes (not ADRs)
- [Competitor features backlog (Smartlead / Instantly / Lemlist) — 2026-07](competitor-features-2026-07.md)
