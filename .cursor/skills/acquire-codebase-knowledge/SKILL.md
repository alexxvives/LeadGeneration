---
name: acquire-codebase-knowledge
description: >-
  Map and document an existing codebase into docs/codebase/ (STACK, STRUCTURE,
  ARCHITECTURE, CONVENTIONS, INTEGRATIONS, TESTING, CONCERNS). Trigger only when
  the user explicitly asks to map, document, or onboard into the repo — not for
  routine feature work.
---

# Acquire Codebase Knowledge

Only document what is verifiable from files or terminal output. Never invent architecture.

## Output contract

Create exactly these under `docs/codebase/`:

`STACK.md`, `STRUCTURE.md`, `ARCHITECTURE.md`, `CONVENTIONS.md`, `INTEGRATIONS.md`, `TESTING.md`, `CONCERNS.md`

Mark unknowns `[TODO]`; intent gaps `[ASK USER]`. Every claim needs evidence paths.

## Lodestar note

Prefer existing docs first: `AGENTS.md`, `docs/constitution.md`, `docs/how-it-works.md`, `docs/session-handoff.md`. Do not duplicate those into `docs/codebase/` unless the user explicitly wants a full onboarding pack. The scan script from upstream SkillRepo is optional here — Lodestar already has a maintained doc index.

## Anti-patterns

- Guessing stack from variable names
- Documenting `.next/` / `dist/` conventions
- Treating outdated README intent as current architecture without checking code
