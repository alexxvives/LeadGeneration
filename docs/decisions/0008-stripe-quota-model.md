# 0008. Stripe billing + service-layer quota model

- Status: accepted
- Date: 2026-07-14

## Context

We need paid plans (Free / Starter $29 / Pro $79 / Agency $199) with monthly
**lead-credit** and **send** quotas, billed via Stripe, without ever trusting the
client for entitlement and without breaking the two hard invariants (per-lead
human approval; zero-key demo mode).

## Decision

**Plans are a single source of truth** in `src/lib/plans.ts` (prices, quotas,
feature bullets, and the *env var name* holding each Stripe Price ID — IDs are
read from env, never hard-coded).

**Quota enforcement lives only in `service.ts`:**
- `createAndRunSearch` checks lead credits *before* creating the run; over-limit
  throws a typed `QuotaError` → the route returns **402** with a friendly body.
- `sendApprovedOutreach` checks the send quota as an *additional* gate that runs
  **after** the approval check — it never bypasses human approval (Art. I.1).
- Usage counters (`leads_used_this_month`, `sends_used_this_month`) live on the
  workspace row (migration `0003`) and reset lazily on first read past
  `resets_at` (first of next month).

**Metering is tied to the D1 binding**, not to auth: `metered = !!binding`. The
JSON-store path (local dev / demo) is therefore **always free and unmetered** —
no quota checks at all — satisfying Art. I.2.

**Stripe integration** (all server-side; the secret key never reaches the
client):
- `POST /api/billing/checkout` → Checkout session for the chosen plan;
  `success_url=/app?upgraded=1`, `cancel_url=/pricing`. Creates/reuses a Stripe
  customer stored on the workspace.
- `POST /api/billing/portal` → Billing Portal session.
- `POST /api/webhooks/stripe` → verifies the `Stripe-Signature` against
  `STRIPE_WEBHOOK_SECRET` using the **async** verifier (Web Crypto, Workers-safe)
  over the raw body (App Router `req.text()` — no body-parser to disable), then
  maps the subscription's price → `planId` and writes it onto the workspace.
  Entitlement is set here, server-side, never from the client.

The workspace row stores `stripe_customer_id`, `stripe_subscription_id`, and
`stripe_price_id`.

## Alternatives considered

- **Stripe usage-based/metered billing.** Overkill for fixed monthly quotas and
  harder to reason about; our own counters are simpler and predictable
  (business-plan §6: "1 credit = 1 lead").
- **Enforce quotas in the API route.** Violates constitution Art. II
  (business logic belongs in the service layer) and would be easy to bypass.
- **Trust Checkout success redirect for entitlement.** Unsafe; the webhook is
  the source of truth.

## Consequences

- ✅ Changing a price/quota is a one-line edit in `plans.ts`.
- ✅ Demo mode is guaranteed free/unmetered by construction (`metered` follows
  the binding).
- ⚠️ Usage counters are read-modify-write (no atomic increment). Fine at MVP
  volumes; revisit with a D1 `UPDATE ... SET x = x + 1` if contention appears.
- ⚠️ Lead-credit accounting increments by the number of leads a run produced
  *after* the run, so a single run can slightly overshoot the cap. Acceptable;
  tighten by capping run size to remaining credits if needed.
- ⚠️ Requires real Stripe Products/Prices + webhook secret in production
  (documented in `.env.example` and the README Deploy section).
