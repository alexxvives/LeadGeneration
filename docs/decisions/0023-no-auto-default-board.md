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

1. **Do not auto-create** a Default board. `ensureDefaultBoard` only heals
   duplicate-default collapse and orphan lead/run backfill onto an *existing*
   board.
2. **Search / import / manual lead** require an explicit `boardId` or
   `newBoardName` — no silent fallback.
3. **Delete** may remove any board (including legacy `isDefault`). Leads move
   to another remaining board; deleting the last board with leads is blocked.
4. Legacy `isDefault` rows may remain until users delete them; new boards are
   never flagged default.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Keep Default as catch-all | Users ignore it; orphans rare after migrate |
| Soft-hide Default in UI only | Still created on every new workspace |
| Auto-delete empty Default | Racey; better to stop creating |

## Consequences

- `BoardAssignModal` opens in create mode when the workspace has zero boards.
- Boards UI no longer blocks delete on `isDefault`.
- Demo `scripts/seed.ts` may still ship a local Default for zero-key demo data.
- ADR 0014's "exactly one Default" rule is superseded for new workspaces.
