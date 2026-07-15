# Competitor gap analysis — Smartlead / Instantly / Lemlist / Apollo

**Date:** 2026-07-15  
**Goal:** Features worth adding to Lodestar to improve performance (pipeline
outcomes) and reduce UX friction — without becoming a cold-email blaster that
violates HITL / demo-mode constitution.

## What competitors optimize for

| Product | Core bet |
| --- | --- |
| **Smartlead** | Unlimited mailboxes, warmup, rotation, deliverability ops, sequences + AI reply |
| **Instantly** | Volume sending + built-in lead DB + simple UI |
| **Lemlist** | Multichannel personalization (email + LinkedIn) |
| **Apollo** | B2B contact database + sequencing |

Lodestar’s wedge is different: **find → enrich → human-approve → send** for
solo founders / agencies who care about quality and compliance, not blast scale.

## Worth adding (ranked)

### P0 — high leverage, fits our product
1. **Outreach queue as a first-class nav item** (done this session) — draft →
   approve → send was buried in the drawer; competitors make the send lane
   obvious.
2. **Email verification before send** (shipped ADR 0009) — Instantly/Smartlead
   treat bad addresses as wasted reputation.
3. **Saved ICPs + one-click re-run** (partially shipped) — reduce search friction.
4. **Follow-up / note journal with dates** (done this session) — Smartlead/Lemlist
   keep activity timelines; freeform notes were too easy to lose.
5. **Clear CRM vs outreach status** (done — drop “In review” UX) — competitors
   separate “lead stage” from “email state”; we were mixing them.

### P1 — next performance wins
6. **Sequence stubs (day 0 / day 3 / day 7) with HITL per step** — competitors’
   sequences are auto-send; we can offer *scheduled draft reminders* that still
   require approve+send. Big retention without breaking Art. I.1.
7. **Mailbox / domain health checklist in Settings** — SPF/DKIM/DMARC ticks,
   warmup tips (we already point to Instantly/Smartlead for scale).
8. **Reply / bounce webhooks → auto CRM move** — deliveryStatus stub exists;
   wire Resend events so “replied” → In Conversation without manual clicks.
9. **Lead dedupe across runs** — competitors suppress already-contacted domains.
10. **Export + CRM sync polish** (HubSpot/Sheets) — agencies live in external CRM.

### P2 — later / only if we chase volume
11. Unlimited mailbox rotation / built-in warmup — **out of scope** for v1;
    partner/recommend Instantly or Smartlead (see `docs/email-providers.md`).
12. AI auto-reply agent — conflicts with HITL; skip unless framed as *draft*
    suggestions only.
13. LinkedIn automation — legal/ToS risk; stay public-web only (Art. I.5).

## Explicit non-goals
- Approve-all-and-send that skips per-lead approval
- Shared Lodestar sending domain for customers
- Becoming a Smartlead clone — we win on discovery quality + human judgment

## UX friction we observed vs theirs
- Send path not a nav destination → fixed with Outreach tab
- Pipeline mixed list+kanban → Leads tab split
- Privacy/cookie text as “About” → enrichment junk filters
- Fit score showing raw Source URL → noise removed
