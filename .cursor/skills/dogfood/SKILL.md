---
name: dogfood
description: >-
  Systematic exploratory QA of the studio in cursor-ide-browser: plan, click
  through the changed flow, collect evidence, categorize, and report bugs. Use
  after any UI change (a static screenshot is not validation), or when the user
  asks to dogfood / QA.
---

# Dogfood: Systematic Web App QA

## Prerequisites

Browser tools: **cursor-ide-browser** MCP (`browser_navigate`, `browser_lock`,
`browser_snapshot`, `browser_click`, `browser_take_screenshot`). Target URL +
scope from the user. Dev is http://localhost:3000 (demo JSON store; auth is
production-only).

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
- `/app?view=calendar` Follow-ups / sends / calls
- Lead drawer: draft → approve → send (HITL)
- Settings sending identity

## Tips

Always check console after navigation. Test empty states, invalid form input, and Escape-to-close on the drawer.
