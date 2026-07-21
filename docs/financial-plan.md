# HERMES mail — Financial Plan (quotas, COGS, pricing)

_Working model — mid-2026 provider list prices. Re-validate before changing
live Stripe prices. Implementation source of truth for shipped numbers:
`src/lib/plans.ts`. This doc is the **why** and the **proposed** numbers._

> Sibling: [`business-plan.md`](business-plan.md) (market / GTM).  
> Tech billing: [`commercialization.md`](commercialization.md) + ADR 0008.

---

## 1. Goal

Maximize **revenue per activated user** with a hook that:

1. Lets a new user feel the full loop (search → enrich → draft → approve → send)
   in the first session.
2. Hits a natural wall on the **scarce / costly** resources before they can run
   Hermes Mail as a free replacement for Apollo/Instantly.
3. Makes the first paid plan an obvious “I’m doing this for real” impulse buy
   (under ~$40), then upsells volume.

---

## 2. New-user behavior (assumptions)

Typical solo founder / freelancer in week 1:

| Moment | What they do | What must work |
| --- | --- | --- |
| Minute 0–5 | Demo or first live search | Batch big enough to look real (not “10 baby leads”) |
| Minute 5–20 | Skim fit scores, open drawer, edit draft | Editing feels primary; no dead “Reject” ritual |
| Day 1 | Approve + send 5–15 emails | Verify + send must not hard-fail on first try |
| Day 2–7 | 1–3 more searches, more sends | Monthly lead + send caps start to bite |
| Week 2+ | Either habit or churn | Upgrade prompt when they want another “real” batch |

**Aha moment to optimize for:** “I found ~25 local businesses, drafts look
usable, I sent 5 that didn’t bounce.”  
**Paywall moment to design for:** “I want to do this every week” (leads +
verifies + sends), not “I can’t even try a 25-lead search.”

---

## 3. Platform free credits (our COGS floor)

What we get **before paying providers** (shared across all workspaces unless
noted):

| Provider | Free allotment | Used for | Binding? |
| --- | --- | --- | --- |
| **Firecrawl** | ~1,000 credits / mo / account | Search + scrape (+ extract) | Yes at scale |
| **MyEmailVerifier** | ~100 credits / **day** / account | Verify-at-send (ADR 0016) | **Yes — scarcest** |
| **Zeruh / Maileroo verify** | Provider free tier | Legacy env fallback only (not marketed) | Optional |
| **Resend** | ~3,000 emails / mo | Auth / product mail; BYO for outreach | Low for outreach (BYO) |
| **Groq / Gemini** | Generous free tiers | Pitch / blurbs / fit AI | Soft |
| **Cloudflare Workers + D1** | Free / paid Workers | Hosting | Soft at MVP |

### Firecrawl unit math (approx.)

From Firecrawl pricing (2026): Search = **2 credits / 10 results**; Scrape =
**1 credit / page** (JSON extract +4, etc.).

| Mode | Rough credits / lead | Leads from 1,000 free credits |
| --- | --- | --- |
| Standard (search+scrape) | ~1.2–2 | ~500–800 |
| Smart / local (~3× calls) | ~4–6 | ~150–250 |

Paid Firecrawl (Hobby **$19**/mo / 5,000 credits ≈ **$0.0038 / credit**;
annual Hobby **$16**/mo):

- Standard lead (search + scrape, ~1.2 credits) ≈ **$0.005**
- Avoid JSON/Enhanced scrape (+4 credits each) — we use markdown only
- Smart / multi-call modes ≈ **$0.015–$0.025** (avoid as default)

### Verify unit math

- Free pool: **100 / day platform-wide** (not per user).
- Paid MyEmailVerifier: typically **~$0.001–$0.004 / verify** (order-of-magnitude).
- Plan `verifiesPerDay` is fairness against the **shared** free pool until we
  buy a paid verify plan.

### Send unit math

- Outreach is **BYO sender** (Resend / Maileroo / Gmail) → **~$0 COGS** to us.
- Platform Resend free tier is for magic-links / product mail, not customer
  cold volume.

### Blended COGS per “full” lead (search → verify → send)

| Stack | COGS / lead (order of magnitude) |
| --- | --- |
| Free Firecrawl + free verify + BYO send | ~$0 (until free pools exhaust) |
| Paid Firecrawl + free verify + BYO | ~$0.01–$0.03 |
| Paid Firecrawl + paid verify + BYO | ~$0.015–$0.035 |

**Implication:** Gross margin on Starter/Pro is excellent **as long as** we
cap leads + verifies. The real risk is **unbounded free users** burning the
shared MEV 100/day and Firecrawl 1k/mo.

---

## 4. Pricing strategy (hook → expand)

```
Free ──aha (batch search + few sends)──► Starter (habit)
                                              │
                                              ▼
                                         Pro (volume / AI)
                                              │
                                              ▼
                                        Agency (seats / ceiling)
```

| Lever | Free (hook) | Paid (revenue) |
| --- | --- | --- |
| Per-run batch size | Unlocked up to monthly remaining | Same rule |
| Monthly leads | Enough for 1–2 real campaigns | Scales with price |
| Sends | Enough to feel deliverability | Matches lead intent |
| Verifies / day | Tiny slice of shared 100 | Primary upgrade pressure |
| Features | Core HITL loop | Export, AI, mailbox, seats |

**Do not** use a Free-only “max 10 per search” lock — it kills the aha before
the monthly cap matters. Enforce: `batch ≤ min(planMonthlyLeads, remaining)`.

---

## 5. Recommended quotas & prices (shipped)

Synced in `src/lib/plans.ts`. Create matching Stripe Prices before go-live.

| Plan | Price | Leads / mo | Sends / mo | Verifies / day | Job to be done |
| --- | --- | --- | --- | --- | --- |
| **Free** | **$0** | **50** | **20** | **5** | One solid first campaign; feel the product |
| **Starter** | **$19** | **150** | **150** | **15** | Weekly habit for a solo (impulse buy) |
| **Pro** | **$49** | **600** | **600** | **30** | Power user / tiny team; AI personalization |
| **Agency** | **$99** | **2,000** | **2,000** | **50** | Multi-client; still under verify ceiling |

Annual: **~20% off** (`ANNUAL_DISCOUNT` already in code).

### Why these numbers (2026-07 appeal cut)

| Change | Why |
| --- | --- |
| Starter **$19** / 150 leads | Entry under $20; still ~5 leads/weekday |
| Pro **$49** / 600 | Clear step up without Apollo-seat sticker shock |
| Agency **$99** / 2k | Volume ladder; avoids COGS-negative at max paid Firecrawl |
| Free **50** / **20** | Slightly tighter hook; protect shared FC + verify pools |

### Effective $/enriched-lead (list)

| Plan | $/lead credit | $/send |
| --- | --- | --- |
| Free | $0 | $0 |
| Starter | **$0.127** | $0.127 |
| Pro | **$0.082** | $0.082 |
| Agency | **$0.050** | $0.050 |

Volume discounts pull power users up-market (classic SaaS ladder).

### Max-usage COGS breakdown (paid APIs)

Unit assumptions: Firecrawl **$0.02**/lead, verify **$0.003**/send, send **$0** (BYO).

| Plan | Firecrawl | Verify | Send | Total COGS | Revenue | Margin |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Starter | $3.00 | $0.45 | $0 | **$3.45** | $19 | **82%** |
| Pro | $12.00 | $1.80 | $0 | **$13.80** | $49 | **72%** |
| Agency | $40.00 | $6.00 | $0 | **$46.00** | $99 | **54%** |

Firecrawl dominates (~85–90% of variable COGS). On Firecrawl Hobby
($19/mo → 5k credits ≈ **$0.0038**/credit; ~1.2 credits/lead ≈ **~$0.005**/lead)
max COGS drops sharply vs the $0.02 planning rate above.

---

## 6. Unit economics sanity check

Assume average paid user uses **60%** of lead quota, standard search, BYO send,
verify on most sends:

| Plan | Revenue | Est. COGS (paid FC + free verify) | Gross margin |
| --- | --- | --- | --- |
| Starter | $19 | ~$1–3 | **>80%** |
| Pro | $49 | ~$4–10 | **>75%** |
| Agency | $99 | ~$12–30 | **>65%** |

When Firecrawl free (1k) + MEV free (100/day) cover early users, early COGS
≈ hosting only. **Buy Firecrawl Hobby/Standard and a paid verify pack before
paid users exceed free pools** — don’t wait for a outage to force it.

### Shared-pool stress (verifies)

| Concurrent users hitting daily verify cap | Drain on 100 free MEV/day |
| --- | --- |
| 20 Free @ 5/day | 100 (saturated) |
| ~7 Starter @ 15/day | 100 |
| ~3 Pro @ 30/day | 100 |
| 2 Agency @ 50/day | 100 |

**Rule:** free verifies are a **growth subsidy**, not an unlimited entitlement.
Free is already **5/day** in `plans.ts`. If free signups explode, either (a)
buy MEV credits, (b) lower Free further, or (c) offer BYO verify key on Pro+.

---

## 7. What to charge the user vs what we pay

| Resource | User pays (plan) | We pay (provider) | Margin lever |
| --- | --- | --- | --- |
| Enriched lead | Monthly lead credits | Firecrawl (+ optional LLM) | Cap + cache + standard-default mode |
| Verify | Daily verify cap | MyEmailVerifier (Zeruh legacy env) | Cap hard; cache hits free |
| Send | Monthly send cap | **$0** (BYO) | Cap for abuse / spam optics |
| AI pitch / fit | Bundled on Pro+ | Groq/Gemini free→paid | Soft gate on Pro feature flag |

**Never** subsidize unbounded search on Free — monthly lead credits are the
meter. Per-run size is only limited by that meter.

---

## 8. Conversion levers (product)

1. **First search default = 25** on Free when remaining ≥ 25 (not 10).
2. Upgrade modal copy tied to the quota that actually fired (`leads` |
   `sends` | `verifies`) — already wired via `QuotaError`.
3. Soft nudge in Settings when usage > 70% of any meter.
4. Starter CTA: “Unlock weekly batches + 25 verifies/day” (not feature laundry).
5. Keep demo mode forever (constitution) — free of provider COGS.

---

## 9. Decision log for this model

| Decision | Choice |
| --- | --- |
| Meter | Lead credits + sends / mo + verifies / day |
| Free per-run lock at 10 | **Removed** — only monthly remaining/cap |
| Send COGS | BYO; we don’t resell sends at MVP |
| Scarce resource | Shared verify free pool |
| Entry paid price | **$19** Starter (appeal cut 2026-07) |
| Price in code today | Synced in `plans.ts` — create Stripe Prices to match |

When accepted: update `src/lib/plans.ts`, pricing page copy, Stripe Prices,
and §6 of `business-plan.md` to match this table exactly.

---

## 10. Open questions

1. When do we buy Firecrawl Hobby vs Standard? (Trigger: >~400 live leads/mo
   platform-wide on standard search.)
2. BYO verify API key on Pro+ to shed shared-pool risk?
3. Annual Stripe prices — create parallel Price IDs when discount ships in UI.
4. Import-from-Excel: today imports are cheap vs Firecrawl — keep imports on
   lead credits or a separate cheaper meter?
