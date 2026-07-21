# 0019. Admin Find-leads toggle + account deletion
- Status: accepted
- Date: 2026-07-21

## Context
Insiders share a Firecrawl credit pool. Operators need to pause Search for a
specific account without changing plan, and both users and admins need a way
to permanently remove an account.

## Decision
- `workspaces.find_leads_enabled` (default on). Admin Users table exposes a
  per-row toggle; Search form is blocked + `createAndRunSearch` returns 403.
  **Import stays available** on the Search view when Find leads is off.
- Self-serve `DELETE /api/account` and admin `DELETE /api/admin/users` wipe
  workspace data, board sharing rows, verification tokens / invites by email,
  and the Auth.js owner (never platform admins / local demo workspace).
  Stripe subscription is canceled best-effort before the wipe.
- Admin Settings is a slim ops page (no outreach profiles / send setup / Danger
  zone). Admin sidebar drops Board + Profile pickers.
- Insider lead meter shows raw Firecrawl remaining labeled **Leads**. When the
  credit API is unreachable: show “Credits unavailable” and reject search with
  402 — never invent a fallback balance.

## Alternatives considered
- Hide Search only in UI — rejected; need server gate.
- Soft-delete / Stripe cancel only — rejected; hard delete + best-effort Stripe
  cancel matches “remove this tenant” ops need.
- Redirect away from Search when Find leads is off — rejected; Import lives on
  that surface.

## Consequences
- Migration `0025_find_leads_enabled.sql` required on D1.
- Insider lead meter shows raw remaining credits labeled **Leads**.
