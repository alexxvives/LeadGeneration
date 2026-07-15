# Next value roadmap — find leads & act on them

**Updated:** 2026-07-14  
**Goal:** Make Lodestar the tool a solo founder / agency SDR opens every morning
to find prospects and move them to a sent (or parked) outcome — not just a
search demo.

---

## Strategy answer (features vs UI polish)

**Prioritize product value (funnel + action) over more design-tooling.**

We already have lodestar-ui + Playwright. Extra UI MCPs (Fable / 21st / v0) are
optional accelerators, not a prerequisite. A sharp execution prompt + Playwright
validation beats buying another design tool.

Order of work:

1. **Unblock trust** — map, credits display, auth CTAs (done / in this pass).
2. **Make the loop obvious** — Pipeline (funnel), Runs history, Export Excel.
3. **Raise lead quality** — better extraction, email verification, less junk titles.
4. **Make acting easy** — batch draft, reply tracking stubs, Excel + CRM export.
5. **Polish UI** only where friction remains (empty states, mobile sidebar).

---

## Phased plan

### Phase A — Close the action loop ✅ shipped
- [x] Pipeline view (`?view=pipeline`) — CRM: New → Contacted → In Conversation → Closed → Not Interested
- [x] Runs history (`?view=runs`)
- [x] Export Excel (Pipeline header — styled `.xlsx` with stage coloring)
- [x] How it works + Plans linked from Settings → Resources
- [x] Wire outreach profile `displayName` into `generateDraft` (via `Run.senderName`,
      API-safe — server never reads localStorage)
- [x] “Open run on board” loads that run’s leads into Pipeline
- [x] Search view (sidebar) separate from Pipeline; post-search redirects to Pipeline
- [x] Settings via sidebar **account card** (not a Workspace nav item)
- [x] Leads table Status = CRM funnel stage (matches Pipeline columns)

### Phase B — Lead quality ✅ shipped (highest ROI for users)
- [x] Structured extraction (company name ≠ page title “Contact Us”; prettified domain)
- [x] Email hygiene (plausibility + disposable/no-reply filter + personal-first ranking)
- [x] Per-lead address → real map pins (region-code-validated `City, ST`; street pref)
- [x] Fit-score explainability in the drawer (transparent reasons list — already shown)

### Phase C — Act on leads ✅ shipped
- [x] Bulk: draft all / approve selected (checkboxes; Send remains **per-lead** in drawer)
- [x] Reply / bounce status stub (`deliveryStatus` on Outreach + drawer controls; webhook later)
- [x] Saved ICPs (niche + location + offer templates — browser localStorage)
- [x] SMTP connect wizard (stepped env guidance in Settings — no secrets in browser)

### Phase D — Commercial readiness ✅ code shipped / ⏳ ops for live secrets
- [x] D1 + auth + Stripe **wired in code**; live secrets/webhook are deploy ops
  (`AUTH_SECRET`, Stripe keys, `cf:migrate` through 0007, Turnstile optional)
- [x] Deliverability checklist in Settings (capability ticks + link to full guide)
- [x] Usage caps UX when metered (Studio header `UsageBar` + existing UpgradeModal)

---

## Copy-paste execution prompt

Use this when you want a follow-up polish or Phase D **ops** deploy:

```
You are working in the Lodestar repo (LeadGenerator). Read AGENTS.md,
docs/constitution.md, docs/session-handoff.md, and docs/roadmap-next.md first.

MISSION: Phase A–D product code is shipped. Either (1) polish UX friction on
Pipeline/Search/Settings, or (2) run commercial deploy ops: AUTH_SECRET,
cf:migrate (through 0007), Stripe keys + webhook, verify metered usage bars.

HARD RULES
- Obey constitution: UI → API → service → repo/providers; human approval before
  send; zero-key demo still works; no secrets in the browser.
- Do NOT add approve-all-and-send that skips approval.
- Update docs/session-handoff.md + LEARNINGS in the same session.
```

---

## What not to do next
- Don’t store SMTP passwords in the UI.
- Don’t break demo mode.
- Don’t treat “Retry deploy” on an old CF commit as a fresh build (lockfile drift).

---

## Standing UX audit prompt

Paste this when you want another Pipeline / table / map polish pass:

```
Audit /app?view=pipeline (and the leads table + map below it) against
.cursor/skills/lodestar-ui/SKILL.md and docs/constitution.md Art. IV.

List 8–12 concrete UX fixes ranked by user friction. Prefer layout/hierarchy
over new features. Cite component file paths. Do not redesign the brand.

Use Playwright and/or chrome-devtools MCP on http://127.0.0.1:3000 to observe
overflow, cramped cards, and status wrapping — don’t guess.
```
