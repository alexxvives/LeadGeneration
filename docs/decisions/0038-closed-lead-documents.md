# 0038. Documents on closed leads

- Status: accepted
- Date: 2026-09-13

## Context

Won deals collect files (proposals, contracts, tramits). Those belong on the
closed lead, not in a generic drive, and must work in zero-key demo mode.

## Decision

`LeadDocument` is a first-class, lead-scoped attachment. Upload (drag-and-drop
or file picker) is allowed only while `crmStage === "closed"`. Metadata + bytes
go through `LeadRepository`:

- **JsonStore** — metadata in `db.json`, bytes under `data/documents/{workspaceId}/{id}`.
- **D1Store** — `lead_documents` table (migration 0037) with a BLOB `content`
  column. Max **4 MB** per file (D1 bind limit + a sane studio cap).

CRUD is `UI → client-api → /api/leads/:id/documents → service → repository`.
Deleting a lead (or clearing a board / workspace) cascades documents.

## Alternatives considered

- **R2 bucket** — better for large files, but a new Cloudflare binding and
  deploy step. Deferred until 4 MB is not enough.
- **Workspace document library + assign** — extra chrome the drawer does not
  need yet. Per-lead drop zone is enough.
- **Store bytes in `Lead.customFields` / JSON on the lead row** — blows up
  board payloads and D1 row size.

## Consequences

- Allowed types: PDF, Office, images, txt/csv (see `src/lib/lead-documents.ts`).
- Demo mode stays key-free. Prod needs `npm run cf:migrate` for 0037.
- Non-goal: versioning, sharing a file across leads, or previewing PDFs inline.
