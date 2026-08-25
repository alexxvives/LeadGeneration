# 0023. No auto-created Default board
- Status: accepted
- Date: 2026-08-06
- Amends: [0014](0014-boards.md)

## Context

Every workspace auto-created a "Default" board via `ensureDefaultBoard`. Users
already pick or create a board at search/import (`BoardAssignModal`). The
Default board became clutter (often holding only seed/demo leftovers) and
encouraged duplicate empty outreach profiles.

## Decision

1. **Do not auto-create** a Default board. `ensureDefaultBoard` clears leftover
   `isDefault` flags, deletes empty boards named "Default", and back-fills
   orphan leads/runs onto an existing board.
2. **Search / import / manual lead** require an explicit `boardId` or
   `newBoardName` — no silent fallback.
3. **Delete** may remove any board. Leads move to another remaining board;
   deleting the last board with leads is blocked.
4. New workspaces start with **zero boards**. The getting-started tour creates
   a named board (e.g. "Austin dental clinics"), never "Default". Empty
   leftover Default boards are removed by migration `0034` and the heal path.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Keep Default as catch-all | Users ignore it; orphans rare after migrate |
| Soft-hide Default in UI only | Still created on every new workspace |
| Auto-delete Default boards that still have leads | Would hide real user data |

## Consequences

- `BoardAssignModal` opens in create mode when the workspace has zero boards.
- Boards UI no longer blocks delete on `isDefault`.
- Demo `scripts/seed.ts` uses a named board ("Austin dental clinics"), not Default.
- ADR 0014's "exactly one Default" rule is superseded for new workspaces.
