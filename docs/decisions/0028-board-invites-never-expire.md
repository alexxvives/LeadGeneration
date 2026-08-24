# 0028. Board invites never expire
- Status: accepted
- Date: 2026-08-24
- Amends: [0015](0015-board-sharing-soft-lock.md)

## Context

Board invites were stored with a 14-day `expires_at`. After that, the
invitee’s Boards view hid the card and accept revoked the row. Ona
Paradell’s pending invite to **LUMIA** (`onaparadell@gmail.com`, created
2026-07-21) went invisible while still pending, so she could not join.

A collaborator invite is an explicit owner action. Timing out that
intent is more harmful than leaving a pending card until they accept
or the owner invites someone else.

## Decision

Invites do not expire. Status is only `pending` → `accepted` (or
`revoked` if we add an owner revoke later). Existing pending rows stay
accept-able regardless of `created_at`.

`board_invites.expires_at` stays NOT NULL for schema compatibility;
new rows write a far-future sentinel and the app ignores the column.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Keep 14-day TTL | Hides real pending collaborators (this incident) |
| Owner-only revoke UI + keep TTL | Extra product surface; still surprises invitees |
| Drop `expires_at` now | Breaks the live Worker until it is redeployed |

## Consequences

- `BoardInvite` has no `expiresAt`. List/accept never filter or revoke
  on time.
- Live D1: pending `expires_at` set to `9999-12-31T23:59:59.000Z` so
  the current Worker shows the LUMIA invite before this code deploys.
