# 0011. Easy send: Resend or Maileroo (BYO)
- Status: accepted
- Date: 2026-07-15
- Amends: [0009](0009-resend-send-maileroo-verify.md) (Easy send peers; verify path → [0016](0016-myemailverifier-primary-verify.md))

## Context

Users want a second Easy transactional sender (Maileroo) without dropping
Resend. Maileroo already appears for platform SMTP / optional Easy send; BYO
HTTP send is a small seam behind `sendEmail()`. (List hygiene verify is a
separate concern — ADR 0016.)

## Decision

1. **Easy path offers two peers:** Resend **or** Maileroo — user picks one,
   pastes that provider’s API/sending key + From identity, verifies domain DNS
   at that provider.
2. **Workspace fields:** `easyEmailProvider` (`resend` | `maileroo`),
   `resendApiKey`, `mailerooApiKey`. Send uses the preferred key when present.
3. **Verify path:** independent of Easy send — **MyEmailVerifier** primary
   (ADR 0016); Zeruh / `MAILEROO_VERIFY_API_KEY` legacy env only.
4. **Pro path unchanged:** Google mailbox still wins over Easy keys.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Maileroo only via platform SMTP | Worse UX (host/port/user/pass); not BYO-simple |
| Auto-try both keys without preference | Ambiguous which From domain is intended |
| Shared Lodestar Maileroo domain | Same reputation risk as shared Resend |

## Consequences

- Migration `0009_maileroo_send.sql`.
- Domain health checklist stays Resend-specific; Maileroo users get a short
  “verify DNS in Maileroo dashboard” note.
- Platform `RESEND_API_KEY` / `SMTP_*` remain demo/fallback only.
