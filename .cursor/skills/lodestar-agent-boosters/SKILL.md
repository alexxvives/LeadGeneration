---
name: lodestar-agent-boosters
description: >-
  Recommended external agent skills and habits that make Lodestar work faster
  and cleaner. Use when improving agent efficiency, adding skills, or reviewing
  UI/UX quality gates for this repo.
---

# Lodestar — agent booster skills

You already have `lodestar-ui` (brand) + Cloudflare/Stripe plugins. These add
leverage without replacing project docs (`docs/constitution.md`, ADRs).

## Install from [SkillRepo](https://skillrepo.dev/skills) (recommended)

| Skill | Why for Lodestar |
| --- | --- |
| [affaan-m/accessibility](https://skillrepo.dev/skills/affaan-m/accessibility) | WCAG AA for studio forms, pipeline keyboard/dnd, Settings |
| [vercel/adr-skill](https://skillrepo.dev/skills/vercel/adr-skill) | Matches our `docs/decisions/` ADR habit |
| [NousResearch/dogfood](https://skillrepo.dev/skills/NousResearch/dogfood) | Structured browser QA after UI passes |
| [github/acquire-codebase-knowledge](https://skillrepo.dev/skills/github/acquire-codebase-knowledge) | Faster onboarding for new agents (use sparingly) |

Catalog: https://skillrepo.dev/skills — prefer graded A/B skills; avoid ungraded
ones that ask for broad file writes.

Connect with `npx skillrepo init` if you want auto-sync; otherwise copy SKILL.md
into `.cursor/skills/<name>/`.

**Installed locally (manual copy, no SkillRepo key):**
`.cursor/skills/accessibility`, `adr-skill`, `dogfood`, `acquire-codebase-knowledge`.

## Also useful (outside SkillRepo)

- [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) — large index; cherry-pick frontend/Next skills only.
- Keep **Lodestar-specific** rules in `AGENTS.md` + `docs/` — external skills
  should never override constitution invariants (HITL send, zero-key demo).

## Efficiency habits in this repo

1. Read `docs/session-handoff.md` + `docs/constitution.md` before coding.
2. Touch UI → read `.cursor/skills/lodestar-ui/SKILL.md` first.
3. Email/send/verify → `docs/email-providers.md` + ADR 0009.
4. After meaningful batches: commit + push (AGENTS #8); CI runs on push.
