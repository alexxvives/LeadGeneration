# 0015. Board sharing with soft presence lock
- Status: accepted
- Date: 2026-07-19

## Context
Users want to collaborate on the same lead board (invite + accept). True
simultaneous editing needs realtime sync (OT/CRDT) and is out of scope for the
current architecture. Overwrites on CRM stage/notes are painful without
coordination.

## Decision
- Boards stay owned by the creator’s workspace (quotas stay on the owner).
- `board_members` + `board_invites` (in-app accept by matching email; no email
  delivery required in this pass).
- Soft lock: `board_locks` with ~45s heartbeat / ~2.5m TTL. Another user’s edits
  return 423; view remains allowed. UI shows who holds the board.
- Shared boards appear in the invitee’s board list; lead reads/writes re-scope
  the repository to the owner workspace via `Ctx.scopeToWorkspace`.

## Alternatives considered
- Last-write-wins concurrent edit — rejected; risk of silent CRM clobber.
- Full CRDT / presence cursors — deferred; high complexity for MVP.
- Clone board into invitee workspace — rejected; duplicates and drift.

## Consequences
- Migrations `0020_board_sharing.sql`; JsonStore arrays for demo parity.
- `Ctx` gains `userId` / `userEmail` / `userName` / `scopeToWorkspace`.
- Email invite delivery and viewer-only roles are follow-ups.
