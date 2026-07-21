# 0018. Insider shows raw Firecrawl remaining credits
- Status: accepted
- Date: 2026-07-21
- Supersedes: [0017](0017-insider-shared-free-pool.md) (credit ÷5 → lead slots)

## Context
ADR 0017 converted live Firecrawl `remainingCredits ÷ ~5` into “lead slots”
so the UI could show how many enriched leads fit the balance. That estimate
is wrong whenever a run is cheaper or more expensive than ~5 credits/lead,
and it hid the real shared pool number.

## Decision
- Insider capacity display = **raw** Firecrawl `remainingCredits` (shared API
  key). When one Insider burns credits, the number drops for everyone.
- Drop `FIRECRAWL_CREDITS_PER_LEAD_EST` from quota math.
- Soft-gate search batch size against remaining credits (`min(want, credits)`);
  if the credit API is down, fall back to the free-tier monthly allotment
  (1000), not `1000÷5`.
- Imports do not use Firecrawl — do not gate Insider imports on FC credits.

## Alternatives considered
- Keep ÷5 as an internal estimate only — rejected; still confuses “slots”
  vs credits.
- Per-workspace lead counters independent of FC — rejected; the scarce
  resource is the shared key.

## Consequences
- Usage bars label “Firecrawl credits” with a remaining-style meter.
- SearchPanel lead-count options disable when `n > remainingCredits`.
- Docs / ADR 0017 features line updated via this ADR.
