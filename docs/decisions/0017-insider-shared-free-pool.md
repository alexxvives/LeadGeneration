# 0017. Hidden Insider plan with Firecrawl-backed lead slots
- Status: accepted
- Date: 2026-07-20

## Context
Founders and friends dogfood on a shared Firecrawl API key (free ~1k
credits/mo) and MyEmailVerifier (~100 verifies/day). Sends use each person's
own mailbox / Easy key — there is no shared send token pool to protect.

## Decision
Add `PlanId = "insider"`:
- Hidden from `/pricing` (`plan.hidden`, not in `PLAN_ORDER`).
- Assignable only via admin plan override (Settings admin panel or Admin →
  Users; `POST /api/workspace/set-plan` with optional `workspaceId`).
- **Leads:** capacity = live Firecrawl `remainingCredits` (raw; shared API key
  is the pool). See [0018](0018-insider-raw-firecrawl-credits.md) — ÷5 removed.
- **Sends:** unlimited (`unlimitedSends`) — BYO sender, no platform send meter.
- **Verifies:** 100/day shared across Insider workspaces (MEV free tier).
- Not a Stripe product (`monthlyPrice: 0`).

## Alternatives considered
- Fixed 100 leads / 100 sends — rejected; underuses Firecrawl free credits and
  wrongly meters BYO sends.
- Per-workspace high Free caps — rejected; does not reflect the shared FC key.
- Keep Exa as search fallback — rejected; one scrape path only (Firecrawl).

## Consequences
- Disable Firecrawl Smart Upgrade / auto-recharge on the shared key.
- Usage bars: “Leads (Firecrawl)” + “Sends → Unlimited” for Insider.
- Exhaustion of leads = Firecrawl balance too low for another enrich pass.
