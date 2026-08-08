# 0026. Remove Pro Gmail mailbox send path
- Status: accepted
- Date: 2026-08-08
- Supersedes: [0010](0010-mailbox-oauth-send.md) (mailbox OAuth send)
- Related: [0011](0011-easy-resend-or-maileroo.md), [0021](0021-per-profile-sending-identity.md)

## Context

Pro mailbox UI was already removed; `resolveSendPath()` hard-coded `"easy"`,
leaving Gmail OAuth routes and `sendViaGmail` as dead code. Product send is
Easy-only: Resend, Maileroo, or BYO SMTP (e.g. Hostinger). Maintaining unused
OAuth increased attack surface and docs drift.

## Decision

Delete Pro/Gmail send: `/api/mailbox*`, `mailbox.ts`, Google branch in
`sendEmail()`, `GMAIL_OAUTH_*` env/docs. Keep Easy SMTP. Legacy
`connected_mailbox_json` / `preferred_send_path` columns remain for D1
compatibility; `"pro"` coerces to `"easy"`. Warmup age picker stays (From /
SMTP reputation self-report).

## Alternatives considered

| Option | Why not |
| --- | --- |
| Restore Pro UI | Not product priority; Hostinger SMTP covers mailbox-style send |
| Leave dead Gmail code | Hygiene audit SEND-01; security + confusion cost |

## Consequences

- Outreach send = Easy Resend / Maileroo / SMTP → platform fallback → demo.
- ADR 0010 historical; reintroduce OAuth only with a new ADR.
- Optional ops: delete unused `GMAIL_OAUTH_*` Wrangler secrets.
