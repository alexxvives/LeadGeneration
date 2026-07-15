# 0014. First-class Boards for lead collections
- Status: accepted
- Date: 2026-07-15

## Context
"Board" previously meant "the latest run's leads" — a transient view, not a
durable org unit. Users need named collections (e.g. by campaign or niche), a
sidebar filter (All vs one board), and a destination picker on search/import.

## Decision
- Add a `Board` entity scoped to a workspace.
- Every workspace has exactly one `isDefault` board ("Default"); leads without
  an explicit board land there.
- `Lead.boardId` and `Run.boardId` are required (back-filled on migrate).
- Studio sidebar: **All** (default filter) or a specific board; Dashboard and
  Boards nav surfaces for stats.
- Search/import open a **popup** to pick (or create) a board — no inline
  "Current board / New list" toggle.

## Alternatives considered
- Treat each Run as a board — rejected; users want multiple imports/searches
  into one named list.
- Tags only — rejected; weak for sidebar filtering and destination UX.

## Consequences
- Pipeline/Leads filter by board (or All = workspace-wide).
- D1 migration `0011_boards.sql` + JsonStore `boards[]`; `ensureDefaultBoard`
  back-fills orphans.
- Import `mode: append|new` replaced by `boardId` (+ optional new board name).
