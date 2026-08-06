# 0025. Per-board email verify toggle
- Status: accepted
- Date: 2026-08-07
- Amends: [0016](0016-myemailverifier-primary-verify.md)

## Context

Verify-before-send lived on `workspaces.email_verify_enabled`, so every board
shared one on/off. Operators want LUMIA verifying while another board skips MEV
(flaky timeouts) without a workspace-wide flip.

## Decision

1. **Source of truth:** `boards.email_verify_enabled` (migration 0030).
2. **Send path:** `sendApprovedOutreach` reads the lead’s board flag; workspace
   flag is fallback only when the board row is missing.
3. **Settings UI unchanged:** the existing switch writes the **active sidebar
   board** (`hermes_active_board`). With “All boards”, it still patches the
   workspace default (used when creating boards).
4. **Boards page:** each owned board card has the same switch for direct
   per-board control.
5. **New boards** inherit the current workspace default.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Keep workspace-only | Cannot differ per board |
| Move toggle out of Settings | User asked to leave Settings chrome alone |
| Settings updates all boards | Would erase per-board choices |

## Consequences

- GET `/api/board` echoes effective verify on `workspace.emailVerifyEnabled` for
  the active board so Studio chrome stays consistent.
- Deploy requires `wrangler d1 migrations apply` for 0030.
