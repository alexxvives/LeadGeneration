# Connect Stripe to HERMES mail

Step-by-step so Checkout, the customer portal, and plan upgrades work in
production. Code is already wired (`/api/billing/checkout`, `/api/billing/portal`,
`/api/webhooks/stripe`). You only need Products/Prices + secrets.

Prices in the app come from [`src/lib/plans.ts`](../src/lib/plans.ts)
(financial plan: Starter **$19**, Pro **$49**, Agency **$99** / month).

---

## 1. Stripe account

1. Create / open [Stripe Dashboard](https://dashboard.stripe.com).
2. Stay in **Test mode** until a dry-run checkout works end-to-end.
3. Complete business details when you go live (payouts need them).

---

## 2. Create Products + monthly Prices

For each paid plan, create a **Product** with one **recurring monthly** Price:

| Plan | Amount (USD) | Env var for Price ID |
| --- | ---: | --- |
| Starter | 19.00 | `STRIPE_STARTER_PRICE_ID` |
| Pro | 49.00 | `STRIPE_PRO_PRICE_ID` |
| Agency | 99.00 | `STRIPE_AGENCY_PRICE_ID` |

**Dashboard path:** Products → Add product → Name (e.g. “HERMES mail Starter”) →
Pricing: **Recurring / Monthly** → amount above → Save.

Copy each Price ID (`price_…`). Do **not** hard-code them in the repo.

Optional later: annual Prices at ~20% off (`ANNUAL_DISCOUNT` in `plans.ts`). The
UI annual toggle is not fully wired yet — monthly is enough for launch.

---

## 3. API keys

1. Developers → API keys.
2. Copy the **Secret key** (`sk_test_…` or `rk_test_…` restricted key preferred).
3. Put it in:
   - Local: `.env.local` → `STRIPE_SECRET_KEY=…`
   - Prod: `npx wrangler secret put STRIPE_SECRET_KEY`

Never put the secret key in `NEXT_PUBLIC_*` or client code.

---

## 4. Webhook endpoint (required for plan entitlement)

Checkout success alone must **not** grant the plan — the webhook does
(ADR 0008).

1. Developers → Webhooks → Add endpoint.
2. **Endpoint URL (prod):**  
   `https://leadgeneration.alexxvives.workers.dev/api/webhooks/stripe`  
   (or your custom domain).
3. Events to send (minimum):
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy the endpoint **Signing secret** (`whsec_…`).
5. Set `STRIPE_WEBHOOK_SECRET` locally and via Wrangler secret.

**Two different webhook setups — don’t mix them:**

| Where you develop | What to configure |
| --- | --- |
| **Local** (`npm run dev`) | Do **not** put `localhost` in the Stripe Dashboard. Install [Stripe CLI](https://stripe.com/docs/stripe-cli), then run in a **terminal**: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`. Paste the CLI’s temporary `whsec_…` into `.env.local` as `STRIPE_WEBHOOK_SECRET`. |
| **Production** (Workers) | Stripe Dashboard → Webhooks → endpoint URL = `https://leadgeneration.alexxvives.workers.dev/api/webhooks/stripe` (correct for **prod only**). Put that endpoint’s `whsec_…` in Wrangler as `STRIPE_WEBHOOK_SECRET`. |

The Dashboard URL is right for **production**. It does **not** receive events from Checkout on `localhost` — that’s what `stripe listen` is for.

---

## 5. Env checklist

```bash
STRIPE_SECRET_KEY=sk_test_…
STRIPE_WEBHOOK_SECRET=whsec_…
STRIPE_STARTER_PRICE_ID=price_…
STRIPE_PRO_PRICE_ID=price_…
STRIPE_AGENCY_PRICE_ID=price_…
NEXTAUTH_URL=https://your-production-host   # used in Checkout success/cancel URLs
```

Prod (Cloudflare):

```bash
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put STRIPE_STARTER_PRICE_ID
npx wrangler secret put STRIPE_PRO_PRICE_ID
npx wrangler secret put STRIPE_AGENCY_PRICE_ID
```

Also ensure `AUTH_SECRET` + `NEXTAUTH_URL` are set so users can sign in before
Checkout.

---

## 6. Smoke test

1. Sign in on the live (or preview) app.
2. Open `/pricing` → Upgrade on Starter.
3. Pay with Stripe test card `4242 4242 4242 4242`.
4. Confirm:
   - Redirect back to `/app?upgraded=1`
   - Webhook delivered (Stripe Dashboard → Webhooks → attempts)
   - Settings → Plan shows **Starter**
5. Open Billing portal from Settings (manages card / cancel).

If plan stays Free: webhook secret mismatch or wrong Price ID mapping.

---

## 7. Go live

1. Toggle Stripe to **Live mode**.
2. Recreate Products/Prices (or copy) — new `price_…` IDs.
3. New live webhook endpoint + `whsec_…`.
4. Replace all Wrangler secrets with **live** keys/IDs.
5. Redeploy: `npm run cf:deploy`.

---

## What the app does with Stripe

| Piece | Role |
| --- | --- |
| `POST /api/billing/checkout` | Creates Checkout Session for the chosen `planId` |
| `POST /api/billing/portal` | Customer Billing Portal |
| `POST /api/webhooks/stripe` | Verifies signature → writes `planId` on the workspace |
| `src/lib/plans.ts` | Display prices + quotas (must match Stripe Price amounts) |

Changing a dollar amount: update `plans.ts` **and** the Stripe Price (or create a
new Price and update the env Price ID).
