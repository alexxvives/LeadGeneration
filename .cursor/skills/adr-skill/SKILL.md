---
name: adr-skill
description: >-
  Create and maintain Architecture Decision Records optimized for agentic
  coding. Use when proposing, writing, updating, accepting, or superseding an
  ADR; or when a hard-to-reverse architectural choice appears mid-task.
---

# ADR Skill

ADRs are executable specs for coding agents. A human approves; an agent implements. Be specific, measurable, and self-contained.

## When to write

- New dependency, architecture pattern, infra, or API design
- Hard to reverse once code lands
- Real alternatives were considered

Skip for routine fixes, style, or decisions already covered by an existing ADR.

## Lodestar path

This repo stores ADRs in `docs/decisions/` (see `docs/decisions/README.md`). Follow existing numbering and LEARNINGS.md for smaller discoveries.

## Four-phase workflow

0. **Scan** — read existing ADRs, stack, related code
1. **Capture intent** — Socratic questions one at a time (what / why / alternatives / constraints / non-goals)
2. **Draft** — Context, Decision, Consequences, Implementation plan (files, patterns, tests, verify)
3. **Validate** — agent-readiness checklist; ask human to accept before coding against it

## Agent-readiness checklist

- [ ] Decision is concrete enough to implement without follow-ups
- [ ] Alternatives + why rejected
- [ ] Non-goals stated
- [ ] Files/patterns/tests/verification listed
- [ ] Does not contradict accepted ADRs (or supersedes them explicitly)
