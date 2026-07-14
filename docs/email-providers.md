# Email Provider Choice — Research & Recommendation

**Question:** Is Resend the best tool here? What about Maileroo? Lowest cost
without sacrificing too much quality.

**Short answer:** For Lodestar's profile (cold-ish outreach, low volume per user,
cost-sensitive, early stage), **start on Maileroo via the existing SMTP path** —
it has the most generous permanent free tier, the lowest paid entry, and a
built-in **email-verification API** that directly improves lead quality. Keep
**Resend** as the "best developer experience" option, and plan to move
high-volume sending to **Amazon SES** later. The app is already provider-agnostic,
so this is a config choice, not a rewrite.

_Pricing checked mid-2026; verify current numbers before committing._

---

## Comparison

| Provider | Free tier | Cheapest paid | ~Cost @ 50k/mo | ~Cost @ 1M/mo | DX | Deliverability | Notes for us |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Maileroo** | **3,000/mo, forever, no card** | ~$10–25/mo | ~$25–45 | custom | Good (SMTP + REST, SDKs) | Good | **Includes email-verification API.** SMTP works with our code today. Lowest cost entry. |
| **Resend** | 3,000/mo forever (100/day cap) | $20/mo (50k) | $20 | ~$650 (Scale) | **Best** (React Email, clean API) | Good (building reputation) | Transactional-focused; cold outreach is against the spirit of ToS. |
| **Amazon SES** | 3,000/mo, first 12 months only | pay-as-you-go | **$5** | **$100** | Poor (AWS, sandbox, IAM) | Good (you manage reputation) | **Cheapest at scale by far.** High setup cost (hours), you handle bounces/reputation. |
| **Postmark** | 100/mo | $15/mo | $50 | $475 | Excellent | **Best (99%+ published)** | **Transactional ONLY — will suspend cold email.** Not for outreach. |
| **SendGrid** | 100/day | ~$20/mo | ~$20 | $400+ | Good | Varies by IP pool | All-in-one (also marketing). Heavier. |

### The math that matters
- **At the volumes a single user of Lodestar sends** (dozens–hundreds of
  approved emails/month), **every provider is effectively free.** Cost only
  becomes a real factor if we send on behalf of many users at scale — then **SES
  wins decisively** (5–20× cheaper than the others).
- So "lowest cost without sacrificing quality" resolves to: **free tier + good
  deliverability + useful extras now**, with a **cheap-at-scale escape hatch**.

## Recommendation for Lodestar

1. **Default / recommended: Maileroo (SMTP).**
   - 3,000 emails/mo free, no credit card → covers early real usage at $0.
   - Lowest paid tiers if you grow ($10–25/mo).
   - **Email verification API** is a direct quality win for scraped leads (see
     `search-and-enrichment.md`, Tier 1) — cleaning dead emails matters more than
     the sender brand for outreach results.
   - Works with our current Nodemailer/SMTP path **with zero code changes**
     (`SMTP_HOST=smtp.maileroo.com`).
2. **Best DX / if you prefer an API: Resend.** Cleanest integration, already
   wired (`RESEND_API_KEY`). Great if you stay transactional-adjacent.
3. **Scale: Amazon SES (SMTP).** Move here when monthly volume crosses ~tens of
   thousands; it's ~$0.10/1k. Also works via our SMTP path.
4. **Avoid for outreach: Postmark** (transactional-only; bans cold email despite
   great deliverability).

## ⚠️ The real constraint: cold email ≠ transactional email

This is more important than provider price. Transactional ESPs (Resend,
Postmark, and to a degree SES/SendGrid shared pools) are designed for mail the
recipient expects (receipts, resets). **Unsolicited cold outreach can violate
their acceptable-use policies and will hurt shared-IP reputation.** For serious
outreach volume you typically want:
- Your **own sending domain** (with SPF/DKIM/DMARC) and a warmed-up reputation,
- Possibly **dedicated IPs** (SES $15–25/mo, Resend/others on higher plans),
- And to keep volume/quality in check — which Lodestar already enforces via
  **per-lead approval + rate limiting + verified emails**.

Purpose-built cold-email infra (Instantly, Smartlead, etc.) exists for high
volume, but that's out of scope for the MVP and adds cost/complexity. The
provider-agnostic SMTP design keeps all these doors open.

## How this maps to the code

- `src/lib/email/sender.ts` already tries **Resend → SMTP → demo**. Maileroo and
  SES are just SMTP config (`.env.local`). No new code needed to adopt the
  recommendation.
- Adding **email verification** is a search/enrichment task, not a sender task —
  see `search-and-enrichment.md`.
- If we later want React-Email templates, add them behind `sendEmail()` without
  changing the approval flow.

**Bottom line:** stay provider-agnostic (already done). Point `.env.local` at
**Maileroo** for the cheapest quality baseline today; keep **SES** as the
scale plan. Spend optimization energy on **email verification**, not on the ESP.
