# 0012. Natural email bodies — no STOP / auto mailing-address footer
- Status: accepted
- Date: 2026-07-15
- Amends: constitution Article I.3

## Context
Auto-appending “reply STOP” and a physical mailing address made outbound
messages look like spam/scam templates. Users want drafts and sends to read like
a normal personal email. CAN-SPAM still matters for US cold email, but stuffing
placeholders or a generic STOP line into every body hurts deliverability and
trust more than it helps.

## Decision
1. **Do not** append STOP, unsubscribe mailto, “Sent by…”, or auto
   mailing-address blocks to outreach bodies (draft or send).
2. Keep **rate limiting** and **clear from-identity** (from name / from email).
3. Settings may still store a physical address for the user’s own records; it is
   **not** injected into outbound copy.
4. Continue stripping legacy footers from old drafts at send so historical spam
   chrome does not reappear.

## Alternatives considered
| Option | Why not |
| --- | --- |
| Keep quiet STOP + real address only | User rejected — still feels scammy |
| Opt-in footer toggle | Adds UI; default natural body is enough for HITL |

## Consequences
- Operators running US cold email are responsible for their own compliance copy
  if they need a postal address in the message.
- Constitution Art. I.3 updated to match.
- `complianceFooter()` removed from the send path; `stripLegacyCompliance()`
  remains.
