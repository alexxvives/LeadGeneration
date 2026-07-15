# Lodestar — Business Plan

_Working draft. Market figures/pricing sampled mid-2026; validate before acting._

> **Sibling doc:** technical build status for auth/plans/Stripe lives in
> [`commercialization.md`](commercialization.md). This file is strategy/market only.

---

## 1. Executive summary

Lodestar is a **human-in-the-loop lead-generation studio**: describe your ideal
customer, and it finds, enriches, and fit-scores prospects, then drafts a
personalized outreach email for each — which **you** review, approve, and send.
It targets solo founders, freelancers, agencies, and small sales teams who want
the results of an outbound stack (Apollo + Clay + Instantly) without the price,
complexity, or compliance risk. The wedge is **trust and simplicity**: nothing
sends without explicit approval, compliance guardrails are on by default, and it
works instantly (demo mode) with no setup.

## 2. Problem

- Modern outbound requires **stitching 3–4 tools** (data/enrichment + sending +
  warmup + verification), each $30–$150+/mo, often per-seat.
- These tools are **powerful but complex and easy to misuse** — one bad blast
  torches your domain reputation or lands you in legal trouble (CAN-SPAM/GDPR).
- Small operators want **a few dozen great, well-researched, personalized emails
  a week**, not 100k-send infrastructure — but pricing/UX is built for the latter.

## 3. Solution

A single, opinionated app covering **Search → Enrich → Draft → Approve → Send**,
with:
- **Human-in-the-loop by design** (per-lead approval; no auto-blast).
- **Compliance baked in** (rate limits, identity, unsubscribe, public-web-only).
- **Transparent fit scoring** (every point explained) — trust over black box.
- **Own-your-data / bring-your-own-sender** (local-first; SMTP/Resend).
- **Zero-friction start** (full demo mode, no keys).

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

## 5. Differentiation / moat

1. **Compliance-first, approval-gated** — the safe way to do outbound; a real
   wedge for the risk-averse and for regulated niches.
2. **Local-business focus** (Tier-2 Places data on the roadmap) — a segment the
   big B2B-database tools serve poorly.
3. **Simplicity + instant value** (demo mode, one tool, transparent scoring).
4. **Bring-your-own-sender / own-your-data** — lower cost and no lock-in.
5. **Cost leadership** via provider-agnostic infra (Maileroo/SES; see
   `email-providers.md`) and quality-not-volume positioning.

Honest caveat: we do **not** own a proprietary contact database (Apollo/Clay's
moat). Our moat is workflow, trust, focus, and price — not raw data. Roadmap
enrichment quality (`search-and-enrichment.md`) is what makes this credible.

## 6. Business model & pricing (proposed)

Hybrid **monthly lead-credit quota + send quota**, flat (not per-seat) to
undercut Apollo's per-seat model.

| Plan | Price | Lead credits/mo | Sends/mo | Key features |
| --- | --- | --- | --- | --- |
| **Free** | $0 | 50 enriched leads | 25 (bring-your-own sender) | Demo + live search, drafting, approval, 1 workspace. |
| **Starter** | **$29/mo** | 500 | 500 | Email verification, table+board, Excel export. |
| **Pro** | **$79/mo** | 2,500 | 2,500 | LLM personalization, Places/local source, priority. |
| **Agency** | **$199/mo** | 10,000 | 10,000 | Multiple workspaces/seats, white-label footer. |

- 1 credit = 1 lead enriched (not per source), keeping it predictable vs Clay.
- **Bring-your-own sender** (SMTP/Resend) on all tiers keeps our send costs near
  zero; we can add managed sending later as an upsell.
- Annual billing ~20% off (industry norm).

**Why a free plan?** It's table stakes in this category, it's cheap for us
(demo mode + BYO-sender ≈ $0 marginal cost), and it's the top of the funnel for a
self-serve, product-led motion.

## 7. Unit economics (rough)

- **Costs are usage-based and low**: search/scrape (Firecrawl ~$ per 1k pages),
  optional verification (~$0.001–0.004/email), LLM personalization (cents/lead),
  email send (near-free at these volumes, or BYO). A Pro user at 2,500 leads
  might cost single-digit dollars/mo in COGS → healthy gross margin.
- **Biggest cost risk**: enrichment/LLM at scale. Mitigate with caching,
  per-plan quotas, and BYO-key options for heavy users.

## 8. Go-to-market

- **Product-led / self-serve** funnel: free plan → activation (first approved
  send) → paywall on volume/verification/LLM.
- **Content + niche SEO** ("cold email for dentists", compliance guides).
- **Templates by vertical** (local services first).
- **Compliance angle** as differentiated messaging (webinars/guides).

## 9. Roadmap (business)

1. **MVP (done):** full flow, demo mode, compliance guardrails.
2. **Commercialize:** auth + workspaces, plans/billing (Stripe), usage metering,
   pricing page. (See `commercialization.md`.)
3. **Quality:** email verification + structured extraction + local/Places source
   (`search-and-enrichment.md`) — the retention driver.
4. **Depth:** LLM personalization, sequences/follow-ups (still approval-gated),
   analytics (reply/positive-reply rates).
5. **Team/agency:** multi-workspace, roles, white-label.

## 10. Key risks

- **Cold-email deliverability & legal** — mitigated by approval + rate limits +
  verification + BYO-domain guidance; keep the compliance posture central.
- **Provider ToS** (transactional ESPs vs cold mail) — see `email-providers.md`.
- **No proprietary data moat** — compete on workflow/trust/focus, not DB size.
- **Incumbent free tiers** (Apollo) — differentiate on simplicity + compliance +
  local focus, not on database breadth.
