# 0036. Board-scoped collaborators (Contacts)

- Status: accepted
- Date: 2026-09-13

## Context

The studio tracks prospects as `Lead`s on a Pipeline. We also need a place for
people we collaborate with (partners, referrers, operators) — not outreach
targets. Those people need notes and dated follow-ups, and those follow-ups
should appear on the existing Calendar.

## Decision

Contacts are a **first-class, board-scoped** entity (`Contact`), persisted in
their own `contacts` table (JSON `contacts[]` in demo). They share the lead
`FollowUp` journal shape so Calendar can merge events. CRUD goes
`UI → client-api → /api/contacts → service → LeadRepository`. Creating a
contact does not consume lead quota. Deleting a board (or clearing its leads)
cascades contacts.

In-conversation leads also gained `waitingOnUs` and `demoDone` flags (same
migration). `waitingOnUs` is derived from an open journal **task** (not a
toggle); `demoDone` stays a lead flag. Neither lives on Contact.

## Alternatives considered

- **Tag a lead as “collaborator”** — pollutes Pipeline, outreach, and quotas.
- **Workspace-global contacts** — rejected; the user asked for per-board
  contacts tied to the current board filter.
- **Custom fields / notes-only** — no Calendar integration, weaker typing.

## Consequences

- New repository methods on both D1 and JsonStore.
- Calendar events now have `source: "lead" | "contact"`.
- Shared-board access uses the same `resolveBoardAccess` path as leads.
- Non-goal: contacts are not emailed through Outreach and have no CRM stage.

## Implementation

- Types: `Contact` in `src/lib/types.ts`
- Migration: `0036_conversation_flags_and_contacts.sql`
- API: `GET/POST /api/contacts`, `PATCH/DELETE /api/contacts/[id]`
- UI: `?view=contacts` + Calendar merge
