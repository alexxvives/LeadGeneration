# 0021. Per-profile Easy Sending identity
- Status: accepted
- Date: 2026-08-05
- Amends: [0011](0011-easy-resend-or-maileroo.md) (Easy From + keys scope)
- Related: [0010](0010-mailbox-oauth-send.md) (Pro mailbox stays workspace-scoped)

## Context

Outreach profiles already hold pitch/signature per brand. Sending identity
(From name/email + Easy provider keys) was one workspace-wide set, so switching
profiles still sent from the same mailbox/keys. Different brands usually need
different From addresses and often different provider accounts.

## Decision

1. **Easy Sending identity is per outreach profile:** From name/email, Easy
   provider, Resend/Maileroo/SMTP credentials, and preferred Easy/Pro path live
   in `workspace.profileSendSettingsJson` keyed by profile id.
2. **Secrets stay server-only** — never in `outreachProfilesJson` / localStorage.
3. **Send and test-send** resolve the active profile (`outreachProfilesJson.activeId`)
   and use that entry; legacy workspace From/key columns remain as fallback and
   are mirrored when the active profile is saved.
4. **Pro Google mailbox** remains one-per-workspace (ADR 0010). Profiles that
   choose Pro share that mailbox; Easy From + keys stay per profile.
5. **One-time migrate:** when the map is empty, copy legacy workspace settings
   into the active profile only; other known profiles get empty shells so
   switching does not show an identical From/name until edited.

## Alternatives considered

| Option | Why not |
| --- | --- |
| From only, shared keys | Breaks when brands use different Resend/SMTP accounts |
| Full Pro mailbox per profile | Multi-inbox deferred (ADR 0010) |
| Keys inside outreachProfilesJson | Would leak secrets into client localStorage |

## Consequences

- Migration `0027_profile_send_settings.sql`.
- Settings → Sending binds to the active outreach profile; create/delete
  profiles seed/drop send-settings entries.
- Same Resend key may be pasted on multiple profiles when domains share one
  account — allowed and expected.
