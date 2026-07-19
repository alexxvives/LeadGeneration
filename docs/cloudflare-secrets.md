# Cloudflare Worker secrets checklist

`wrangler deploy` / `npm run cf:deploy` does **not** delete secrets. Secrets only
disappear if someone deletes them in the dashboard, runs `wrangler secret delete`,
or puts them on the **wrong** Worker name / account.

Worker name (must match): `leadgeneration` (`wrangler.jsonc` → `"name"`).

## Required / expected secrets

| Secret | Purpose |
|--------|---------|
| `AUTH_SECRET` | Auth.js — production login |
| `NEXTAUTH_URL` | Canonical app URL (magic links + Gmail OAuth redirect) |
| `RESEND_API_KEY` | Magic link + board-invite / platform transactional email |
| `MAILEROO_API_KEY` | Optional platform Maileroo *sending* key (board invites fallback) |
| `STRIPE_SECRET_KEY` | Billing (use `sk_live_…` in prod; `sk_test_…` only in `.env.local`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing (`whsec_…` — live endpoint in prod) |
| `STRIPE_*_PRICE_ID` | Live Price IDs for Starter / Pro / Agency |
| `FIRECRAWL_API_KEY` | Live search / scrape (preferred) |
| `EXA_API_KEY` | Search fallback when Firecrawl fails / empty |
| `GMAIL_OAUTH_CLIENT_ID` | Pro mailbox Connect Google |
| `GMAIL_OAUTH_CLIENT_SECRET` | Pro mailbox Connect Google |
| `GROQ_API_KEY` | Optional pitch/blurb fallback when Workers AI fails |
| `GEMINI_API_KEY` | Optional pitch/blurb fallback after Groq |
| `MYEMAILVERIFIER_API_KEY` | Preferred email verify at send (100 free credits/day) |
| `MAILEROO_VERIFY_API_KEY` | Fallback Zeruh verify (alias `ZERUH_API_KEY`) |
| `RESEND_WEBHOOK_SECRET` | **Required after deploy of audit hardening** — Svix secret for bounce/reply webhooks |
| `MAILEROO_WEBHOOK_SECRET` | Required only if you use Maileroo delivery webhooks |

**Removed:** `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Admin is a normal hashed user with
`users.is_admin = 1` (migration 0018). First boot creates
`admin@tryhermesmail.com` / `password` — delete any leftover Wrangler secrets:

```bash
npx wrangler secret delete ADMIN_EMAIL
npx wrangler secret delete ADMIN_PASSWORD
```

### Resend delivery webhooks (bounce / reply → CRM)

**End users do not configure webhooks.** When someone pastes their Resend API
key in Settings → Easy, Hermes calls Resend’s API to register
`/api/webhooks/resend` and stores that account’s signing secret on the
workspace (migration 0016).

Optional platform fallback (only if you send with the Worker’s
`RESEND_API_KEY` rather than a BYO key):

```bash
npx wrangler secret put RESEND_WEBHOOK_SECRET
```

Apply migration 0016 before relying on auto-register in prod:

```bash
npm run cf:migrate
```

Workers AI itself uses the `AI` binding in `wrangler.jsonc` — **no secret**.

**Do not set `SMOKE_API_KEY` in production** — it bypasses auth for the smoke harness.

## Verify (safe — names only)

```bash
npx wrangler secret list
```

## Set / restore one secret

```bash
npx wrangler secret put GMAIL_OAUTH_CLIENT_ID
npx wrangler secret put GMAIL_OAUTH_CLIENT_SECRET
npx wrangler secret put GROQ_API_KEY
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put MYEMAILVERIFIER_API_KEY
npx wrangler secret put MAILEROO_VERIFY_API_KEY
```

`MYEMAILVERIFIER_API_KEY`: preferred — [myemailverifier.com](https://myemailverifier.com) dashboard (phone verify for 100 free credits/day).  
`MAILEROO_VERIFY_API_KEY`: fallback Zeruh at [maileroo.com](https://maileroo.com) → Email Verification. Same values go in `.env.local` for `npm run dev`.

Paste the value when prompted. Never commit secret values to git.

## After rotating Google OAuth

If you recreate the Google Cloud client, update **both** Gmail secrets and confirm
`NEXTAUTH_URL` is still `https://leadgeneration.alexxvives.workers.dev`.
