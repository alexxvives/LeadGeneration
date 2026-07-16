# 0009. Resend for send, Maileroo/Zeruh for verify
- Status: accepted _(amended by [0011](0011-easy-resend-or-maileroo.md) — Easy BYO Maileroo send is also allowed)_
- Date: 2026-07-15

## Context

Lodestar needs both **outbound send** and **list hygiene (verify before send)**.
Resend and Maileroo overlap on sending; only Maileroo’s Zeruh product gives us
a clean verification API. Users asked us to pick one stack and stop hedging.

## Decision

1. **Send path (primary):** Resend — platform key for product/auth mail +
   **BYO Resend key + customer domain** for outreach (Settings). Best DX;
   already wired in `sendEmail()`.
2. **Verify path:** Zeruh API (`https://api.zeruh.com/v1/verify`) via
   `MAILEROO_VERIFY_API_KEY` (alias `ZERUH_API_KEY`). Maileroo’s verification
   product; used **at send** (hard block undeliverable). Not on enrich — one
   credit per send, covers search + Excel import equally.
3. **SMTP:** Optional fallback only (Maileroo SMTP, SES, Google SMTP, etc.)
   when no Resend key — not the recommended cold path for v1 UX.
4. **Not for v1:** Shared Lodestar From-domain, Instantly/Smartlead sequences.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Maileroo for both send + verify | Sending DX weaker than Resend; we’d rewrite working Resend path |
| Resend only | No verification product → bounce risk stays unsolved |
| ZeroBounce / NeverBounce | Fine later; Zeruh is free tier + same Maileroo account story |
| Instantly/Smartlead as send layer | Cold-infra platforms; overkill; compete with our HITL product |

## Consequences

- Two keys possible in prod: `RESEND_API_KEY` (send) + `MAILEROO_VERIFY_API_KEY`
  (verify). Zero-key demo still works (heuristic verify, demo send).
- Docs (`email-providers.md`, `.env.example`) state this split explicitly.
- Future Google/Microsoft OAuth mailbox send stays behind `sendEmail()` without
  changing this split.
