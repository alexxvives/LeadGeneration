---
name: dogfood
description: >-
  Systematic exploratory QA of web apps with browser tools: plan, explore,
  collect evidence, categorize, and report bugs. Use after UI passes or when
  the user asks to dogfood / QA the studio.
---

# Dogfood: Systematic Web App QA

## Prerequisites

Browser tools available (Playwright MCP / chrome-devtools). Target URL + scope from the user.

## Workflow

1. **Plan** — sitemap of pages/flows to hit; create `dogfood-output/` if saving evidence
2. **Explore** — navigate → snapshot → console → interact → re-check console
3. **Collect evidence** — URL, steps, expected vs actual, severity, screenshot
4. **Categorize** — Critical / High / Medium / Low; Functional / Visual / A11y / Console / UX
5. **Report** — executive summary + per-issue sections + what was / wasn't tested

## Lodestar focus surfaces

- `/app` Search
- `/app?view=pipeline` Pipeline kanban
- `/app?view=leads` All leads (table/cards/map)
- `/app?view=outreach` Outreach queue
- Lead drawer: draft → approve → send (HITL)
- Settings sending identity

## Tips

Always check console after navigation. Test empty states, invalid form input, and Escape-to-close on the drawer.
