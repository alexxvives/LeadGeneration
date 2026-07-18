# HERMES mail — Business Plan

_Working draft. Market figures/pricing sampled mid-2026; validate before acting._

> **Sibling docs**
> - [`financial-plan.md`](financial-plan.md) — **quotas, COGS, recommended prices** (source of the numbers)
> - [`commercialization.md`](commercialization.md) — auth / Stripe / metering build status

---

## 1. Executive summary

HERMES mail is a **human-in-the-loop lead-generation studio**: describe your ideal
customer, and it finds, enriches, and fit-scores prospects, then drafts a
personalized outreach email for each — which **you** review, approve, and send.
It targets solo founders, freelancers, agencies, and small sales teams who want
the results of an outbound stack (Apollo + Clay + Instantly) without the price,
complexity, or compliance risk. The wedge is **trust and simplicity**: nothing
sends without explicit approval, compliance guardrails are on by default, and it
works instantly (demo mode) with no setup.

**Commercial motion:** product-led freemium. Hook with a real first campaign
(batch search + a handful of verified sends), monetize when the user wants a
weekly habit (leads + verifies + sends). Detailed unit economics live in
[`financial-plan.md`](financial-plan.md).

---

## 2. Problem

- Modern outbound requires **stitching 3–4 tools** (data/enrichment + sending +
  warmup + verification), each $30–$150+/mo, often per-seat.
- These tools are **powerful but complex and easy to misuse** — one bad blast
  torches your domain reputation or lands you in legal trouble (CAN-SPAM/GDPR).
- Small operators want **a few dozen great, well-researched, personalized emails
  a week**, not 100k-send infrastructure — but pricing/UX is built for the latter.

---

## 3. Solution

A single, opinionated app covering **Search → Enrich → Draft → Approve → Send**,
with:
- **Human-in-the-loop by design** (per-lead approval; no auto-blast).
- **Compliance baked in** (rate limits, identity, public-web-only).
- **Transparent fit scoring** (every point explained) — trust over black box.
- **Bring-your-own-sender** (Resend / Maileroo / Gmail) — near-zero send COGS.
- **Zero-friction start** (full demo mode, no keys).

---

## 4. Market & competitors

| Tool | Model | Entry price | Notes |
| --- | --- | --- | --- |
| Apollo | Per-seat + credits | Free / $49–119/user | Huge B2B DB + sequencing; per-seat cost compounds. |
| Instantly | Flat, by volume | $37–358/mo | Sending + warmup; data is an add-on. |
| Clay | Credit-based | Free / $149–800/mo | Best enrichment + AI personalization; complex, pricey. |
| Smartlead | Flat | $39–79/mo | Agency/technical sending. |
| Hunter | Freemium | Free / $37+/mo | Email finding/verification. |

**Takeaways:** free tiers are table stakes; paid entry clusters at **$30–$49**;
models are **credit-based (enrichment)** or **flat by send volume**. Everyone is
built for scale/teams — leaving the **cost-sensitive solo/SMB "quality over
volume"** segment underserved on simplicity + compliance.

---

## 5. Differentiation / moat

1. **Compliance-first, approval-gated** — the safe way to do outbound.
2. **Local-business focus** (Places / local search modes) — poorly served by
   big B2B databases.
3. **Simplicity + instant value** (demo mode, one tool, transparent scoring).
4. **Bring-your-own-sender / own-your-data** — lower cost and no lock-in.
5. **Cost leadership** via provider-agnostic infra (see `email-providers.md`).

Honest caveat: we do **not** own a proprietary contact database. Moat is
workflow, trust, focus, and price — enrichment quality is the retention driver
(`search-and-enrichment.md`).

---

## 6. Business model & pricing

Hybrid **monthly lead-credit + send quota + daily verify cap**, flat (not
per-seat).

### Proposed ladder (see financial-plan for rationale)

| Plan | Price | Leads/mo | Sends/mo | Verifies/day | Hook / job |
| --- | --- | --- | --- | --- | --- |
| **Free** | $0 | 50 | 20 | 5 | First real campaign; feel the loop |
| **Starter** | **$19/mo** | 150 | 150 | 15 | Weekly habit for a solo |
| **Pro** | **$49/mo** | 600 | 600 | 30 | Volume + LLM personalization |
| **Agency** | **$99/mo** | 2,000 | 2,000 | 50 | Multi-client; verify ceiling |

- 1 lead credit = 1 enriched lead (not per source).
- **Per-run batch size** is limited only by monthly remaining credits (Free can
  pick 25/50 if credits remain — no artificial “max 10” lock).
- **BYO sender** on all tiers → send COGS ≈ $0 to us.
- Annual ~20% off.

### Shipped today

`src/lib/plans.ts` matches this table (Free 50/20/5, Starter $19/150,
Pro $49/600, Agency $99/2k). Create matching Stripe Prices and set env Price
IDs — see [`stripe-setup.md`](stripe-setup.md).

### Why freemium

Table stakes in category; demo + BYO-sender keeps Free cheap; Free is the top
of a self-serve funnel. Scarce resource to protect: **shared verify free pool
(~100/day)** and Firecrawl credits (~1k/mo free) — details in the financial plan.

---

## 7. Go-to-market

- **Product-led / self-serve:** Free → aha (batch search + first sends) →
  paywall on volume / verifies.
- **Content + niche SEO** (“cold email for dentists”, compliance guides).
- **Templates by vertical** (local services first).
- **Compliance angle** as differentiated messaging.

### Activation metrics to watch

1. % of signups who complete a **≥25-lead** search in session 1.
2. % who **approve + send** ≥1 email in 48h.
3. Free → Starter conversion within 14 days of hitting any 402 quota.
4. Verify-cap 402s vs lead-cap 402s (which wall converts better?).

---

## 8. Roadmap (business)

1. **MVP (done):** full flow, demo mode, compliance guardrails.
2. **Commercialize (code done):** auth, plans, Stripe, metering — deploy +
   accept financial-plan numbers.
3. **Quality:** enrichment + verify UX — retention driver.
4. **Depth:** LLM personalization, follow-ups (still approval-gated), reply
   analytics.
5. **Team/agency:** multi-workspace, roles, white-label.

---

## 9. Key risks

- **Cold-email deliverability & legal** — approval + rate limits + verify + BYO
  domain guidance.
- **Provider ToS** (transactional ESPs vs cold) — see `email-providers.md`.
- **No proprietary data moat** — compete on workflow/trust/focus.
- **Shared free verify pool exhaustion** — buy paid verify or tighten Free
  daily cap; see financial-plan §6.
- **Incumbent free tiers (Apollo)** — differentiate on simplicity + compliance
  + local focus, not DB breadth.

---

## 10. Product note — “Rejected” status

There is **no user-facing Reject button** today. Drafts are edited, then
approved/sent. `status: "rejected"` is set by **verify cleanup** (undeliverable
email stripped). Treat “Rejected” in export/UI as “dropped / undeliverable,”
not “human rejected the draft.” Do not build a Reject CTA unless product asks
for a discard workflow distinct from editing.
