# 0029. Draft is Ready to Contact — no Approve step
- Status: accepted
- Date: 2026-08-24
- Amends: constitution Article I.1

## Context

Outreach split **Contact Draft** vs **Ready to Contact** on
`outreach.status === "approved"`. A saved `draft` stayed in Contact Draft
until a separate Approve click. That extra gate hid drafted copy from
Ready, and **Re-draft all** only rewrote Contact Draft rows.

The product intent is: Contact Draft = no draft yet; Ready = has draft
(or phone-only). Send is still per-lead. Approve was a second click that
did not add a real review surface beyond opening the draft.

## Decision

1. **Contact Draft** = CRM New email leads with no outreach (or
   `rejected` after verify cleanup).
2. **Ready to Contact** = CRM New with a saved draft (`draft` /
   `approved` / `sending` / `failed`) or phone-only.
3. No Approve button. **Send** on that lead is the human gate. The send
   claim accepts `draft | approved | failed` (stuck `sending` still
   reclaimable).
4. **Draft all** writes missing drafts (they land in Ready). **Re-draft
   all** on Ready rewrites existing drafts including previously sent-ready
   rows (not `sent` / `sending`).

## Alternatives considered

| Option | Why not |
| --- | --- |
| Keep Approve, auto-move on Draft all | Still a second gate; 2026-08-07 reverted auto-approve into Ready for that reason, but the column split was the real confusion |
| Auto-flip `draft` → `approved` on save | Extra write; lanes can treat `draft` as Ready |
| Send-all from Ready | Breaks per-lead Send (Art. I.1) |

## Consequences

- `leadHydrateLane` / Outreach buckets share the same Ready statuses.
- Smoke sends from `draft` (no PATCH decision). Double-send still 409.
- Internal `approved` remains after a claimed/failed send.
- Marketing + tour copy: Send, not Approve.
