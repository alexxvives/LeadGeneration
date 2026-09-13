# 0037. Studio overlay nav below `lg`

- Status: accepted
- Date: 2026-09-13

## Context

The studio used a permanent left sidebar on every width, collapsing to a 64px
unlabeled icon rail on phones. That stole content width and hid destination
names. Pipeline stayed a 4-column kanban that required horizontal pan. The
constitution already requires mobile to remain usable (Art. IV.3).

## Decision

**Below `lg` (1024px):** hide the in-flow sidebar. A compact top bar (hamburger,
current view, board pill) opens a labeled left overlay listing the same nav
sections plus Settings. Sign out sits on the overlay account card (same as
`lg+`). Pipeline and Outreach show one stage/bucket at a time via tabs. The
lead drawer is an edge-to-edge sheet below `md`. Leads default to cards
(table remains available). Collaborators show a Back panel instead of list+detail
stacked.

**At `lg+`:** keep the expandable sidebar, kanban, and three-column Outreach.

No API, types, or persistence changes. Routing stays `?view=`.

## Alternatives considered

- **Keep the icon rail** — saves a chrome rewrite but labels stay hidden and
  content stays narrowed. Rejected.
- **Bottom tabs (5 primaries + More)** — more native on phones, but the studio
  has 11+ destinations; More would hide Search/Calendar/Collaborators/Boards/Runs.
  Rejected in favor of a full labeled overlay.

## Consequences

- `StudioShell` is `h-dvh` flex column below `lg` and row at `lg+`; Studio
  children use `h-full` so fill-viewport views still fill the remaining pane.
- Overlay uses a focus trap, Escape, backdrop click, and focus return
  (same pattern as `Modal`).
- Touch scroll on Pipeline no longer fights `@dnd-kit` (drag stays `lg+`).
- Narrow laptop windows and iPad portrait get the overlay, not the rail.

## Non-goals

- Bottom navigation.
- A separate phone app or PWA install prompt.
- Changing marketing `SiteNav` (already has a hamburger at `md`).
