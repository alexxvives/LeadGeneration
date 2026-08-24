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
- [0010 — Google / Microsoft mailbox OAuth behind sendEmail()](0010-mailbox-oauth-send.md) _(superseded by [0026](0026-remove-pro-gmail-mailbox.md))_
- [0011 — Easy send: Resend or Maileroo (BYO)](0011-easy-resend-or-maileroo.md) _(amended by [0021](0021-per-profile-sending-identity.md) for per-profile From/keys)_
- [0012 — Natural email bodies — no STOP footer](0012-natural-email-bodies-no-stop-footer.md) _(amends constitution Art. I.3)_
- [0013 — Pitch AI: no heuristic fallback](0013-pitch-ai-no-heuristic-fallback.md)
- [0014 — First-class Boards for lead collections](0014-boards.md) _(amended by [0023](0023-no-auto-default-board.md) — no auto Default)_
- [0015 — Board sharing with soft presence lock](0015-board-sharing-soft-lock.md) _(invite TTL removed by [0028](0028-board-invites-never-expire.md))_
- [0016 — MyEmailVerifier is the primary email verify provider](0016-myemailverifier-primary-verify.md) _(amends 0009 verify path; **Zeruh removed by [0024](0024-remove-zeruh-verify.md)**)_
- [0017 — Hidden Insider plan with shared free-credit pool](0017-insider-shared-free-pool.md) _(credit display amended by [0018](0018-insider-raw-firecrawl-credits.md))_
- [0018 — Insider shows raw Firecrawl remaining credits](0018-insider-raw-firecrawl-credits.md)
- [0019 — Admin Find-leads toggle + account deletion](0019-find-leads-toggle-account-deletion.md)
- [0020 — Cursor API is not a Firecrawl alternative](0020-no-cursor-api-for-search.md) _(deferred: Insider Grok/LLM extract on FC markdown)_
- [0021 — Per-profile Easy Sending identity](0021-per-profile-sending-identity.md) _(amends 0011; Pro mailbox removed by [0026](0026-remove-pro-gmail-mailbox.md))_
- [0022 — Board ↔ outreach profile alignment](0022-board-outreach-profile.md) _(amends 0014 + 0021)_
- [0023 — No auto-created Default board](0023-no-auto-default-board.md) _(amends 0014)_
- [0024 — Remove Zeruh / Maileroo Verify — MyEmailVerifier only](0024-remove-zeruh-verify.md) _(amends 0016; zeruh route alias removed 2026-08-08)_
- [0025 — Per-board email verify toggle](0025-per-board-email-verify.md) _(amends 0016)_
- [0026 — Remove Pro Gmail mailbox send path](0026-remove-pro-gmail-mailbox.md) _(supersedes 0010; Easy Resend/Maileroo/SMTP only)_
- [0027 — Daily send suggest is per board mailbox](0027-per-board-mailbox-warmup.md) _(amends 0021 + 0022)_
- [0028 — Board invites never expire](0028-board-invites-never-expire.md) _(amends 0015)_
- [0029 — Draft is Ready to Contact — no Approve step](0029-draft-is-ready-no-approve.md) _(amends constitution Art. I.1)_
### Research notes (not ADRs)
- [Competitor features backlog (Smartlead / Instantly / Lemlist) — 2026-07](competitor-features-2026-07.md)
