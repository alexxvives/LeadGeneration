# 0027. Daily send suggest is per board mailbox
- Status: accepted
- Date: 2026-08-19
- Amends: [0021](0021-per-profile-sending-identity.md), [0022](0022-board-outreach-profile.md)

## Context

Easy From is already per outreach profile, and each board links to one
profile (a domain / inbox). Contacted **N sent today · ~Y/day suggest**
still counted every send in the workspace and used one browser-wide mailbox
age. Switching from LUMIA (`info@itslumia.com`) to Akademo still showed
LUMIA’s 25 sends and the same ~25/day cap.

The cap exists to protect **that inbox**, not the Hermes account.

## Decision

1. **Sent today** counts `outreach` rows whose lead sits on a board that
   shares the active board’s `outreachProfileId` (same mailbox). No profile
   → that board only. No board selected → workspace total.
2. **Mailbox age** (Settings next to From) is stored per outreach profile
   (`hermes_warmup_v2`). A new board/domain starts at “brand new” (~20/day)
   until the user sets it. Still a soft suggest — never a send block.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Keep workspace total | Mixes unrelated inboxes; the number the user saw on Akademo |
| Strict board id only | Two boards sharing one From would get two independent caps |
| Persist age on the server JSON | Right long-term; local per-profile map is enough for the suggest |

## Consequences

- `countSentSince(sinceIso, { boardId })` in D1 + JSON stores.
- Re-select mailbox age once per board after this change (legacy v1 blob
  is not copied onto every domain).
