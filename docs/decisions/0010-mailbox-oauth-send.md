# 0010. Google / Microsoft mailbox OAuth behind sendEmail()
- Status: accepted
- Date: 2026-07-15
- Amended: 2026-07-15 (warmup free DIY; multi-inbox deferred)

## Context

Easy path (BYO Resend + domain DNS) is the default for solo founders. Higher
cold volume often wants **Connect Google Workspace / Microsoft 365** — real
mailboxes, per-inbox caps — not a shared Lodestar From-domain. ADR 0009 keeps
Resend as the v1 API send path; mailbox OAuth plugs into the same `sendEmail()`
seam without breaking HITL or zero-key demo mode.

## Decision

1. **Transports:** Add `google` and `microsoft` providers behind `sendEmail()`,
   selected per workspace when a mailbox is connected. Resend/SMTP/demo remain.
2. **Auth:** OAuth (Google Gmail API send scope; Microsoft Graph Mail.Send).
   Store refresh tokens encrypted at rest; never expose in UI.
3. **Caps:** Per-inbox daily send cap (configurable, conservative default) in
   addition to existing plan quotas and per-minute rate limits.
4. **Ship order:** Google first end-to-end, then Microsoft. Feature-flag until
   smoke-green. Demo/free never require mailbox connect.
5. **Warmup (amended):**
   - **Free soft recommend:** assume cold until told otherwise; soft daily cap
     (e.g. ~15 early → ramp up). Over-cap shows a **warning popup** the user can
     dismiss (“Send anyway”) — never a hard block. Plan quotas + per-minute
     limits stay hard.
   - **We cannot detect “warm” from Google/Resend.** When connecting a mailbox,
     ask two self-report questions (inbox age band + typical send volume) to
     set a higher soft recommend. Until then, treat as new.
   - **Paid optional later:** partner warmup-only if the user wants automated
     network warmup. **Do not** build an in-house warmup network.
6. **Multi-inbox (amended):** deferred / low priority — one connected mailbox
   is enough for v1 Pro. Rotation across many inboxes is agency-scale P2 only
   if demand appears.
7. **Non-goals:** Shared `lodestar.app` outreach domain; Lodestar writing DNS at
   a registrar we don’t own; auto-blast / skip approve.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Stay Resend-only forever | Fine for low HITL volume; loses mailbox placement for cold |
| SMTP app-password only | Fragile (Google blocks); OAuth is the durable path |
| Vendor Instantly/Smartlead as send layer | Competes with our product; overkill for HITL core |
| Build warmup network | Ops-heavy; free DIY ramp + optional paid partner |
| Multi-inbox in v1 Pro | Complexity without clear demand yet |

## Consequences

- New env vars (Google/Microsoft OAuth client IDs/secrets) via `config.ts` only.
- Likely new D1 tables: connected mailboxes, token ciphertext, daily counters.
- Settings Pro tab becomes real connect/reconnect UI.
- Webhooks/IMAP for bounce/reply on mailbox path is a follow-up.

## Implementation plan

1. Types: `ConnectedMailbox`, provider enum on send result.
2. `sendEmail()` branch for Google then Microsoft (one provider E2E first).
3. API: connect/callback/disconnect + daily cap enforcement in `service.ts`.
4. UI: Settings Pro path; feature flag off until smoke-green.
5. Verify: demo still simulates; Easy path unchanged; Pro optional.

## Verify

- [x] Zero-key demo unchanged
- [x] Approve-before-send still required
- [x] Easy Resend path never requires Pro
- [x] One OAuth provider E2E with daily soft recommend (Google; hard daily cap = plan quotas)
- [ ] Microsoft Graph (follow-up)
- [ ] Soft-cap warning popup on send (follow-up)
- [ ] Prod: Wrangler secrets + migration 0008
