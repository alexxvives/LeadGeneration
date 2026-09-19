# 0039. First-class Tasks unified with journal `kind: "task"`

- Status: accepted
- Date: 2026-09-19

## Context

Leads and collaborators already had journal lines with `kind: "task"` (Waiting on
us hourglass, green Task chip). There was no workspace-wide list, kanban, or
Calendar deadline view — tasks were invisible outside the entity drawer.

## Decision

Add a `tasks` table / JSON array and **mirror** journal task lines:

- `Task.journalFollowUpId` links to `FollowUp.id` when created from a lead/contact.
- Completing or deleting in either place updates the other (service-layer sync).
- `waitingOnUs` / `hasPendingTask` considers open `Task` rows plus legacy
  journal tasks not yet backfilled.
- Calendar shows tasks by `deadline` (amber check mark); ONGOING overdue does
  not paint the day rose.
- Studio view `?view=tasks` — kanban at `lg+`, tabs below.

## Alternatives considered

- **Aggregate-only view** over `followUps` — no migration, but no standalone
  tasks, weak filters, and contact tasks stay off Pipeline cards.
- **Replace journal tasks entirely** — breaks existing journal UX and Calendar
  history.

## Consequences

- Migration `0038_tasks.sql`; backfill on first `GET /api/tasks`.
- Drawer “Add Task” still writes journal first; reconcile creates/updates `Task`.
- New API surface; docs and Studio nav updated (between Outreach and Calendar).
