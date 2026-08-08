# Cloudflare Worker secrets checklist

`wrangler deploy` / `npm run cf:deploy` does **not** delete secrets. Secrets only
disappear if someone deletes them in the dashboard, runs `wrangler secret delete`,
or puts them on the **wrong** Worker name / account.

Worker name (must match): `leadgeneration` (`wrangler.jsonc` → `"name"`).

## Required / expected secrets

| Secret | Purpose |
|--------|---------|
| `AUTH_SECRET` | Auth.js — production login |
| `BOOTSTRAP_ADMIN_PASSWORD` | **First boot only.** Password for `admin@tryhermesmail.com` when no `is_admin` user exists yet. Once an admin row exists, this secret is unused — you may delete it. Rotate via D1 `users.password_hash`, not this env. |
| `NEXTAUTH_URL` | Canonical app URL (magic links + Auth.js redirects) |
| `RESEND_API_KEY` | Magic link + board-invite / platform transactional email |
| `MAILEROO_API_KEY` | Optional platform Maileroo *sending* key (board invites fallback) |
| `STRIPE_SECRET_KEY` | Billing (use `sk_live_…` in prod; `sk_test_…` only in `.env.local`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing (`whsec_…` — live endpoint in prod) |
| `STRIPE_*_PRICE_ID` | Live Price IDs for Starter / Pro / Agency |
| `FIRECRAWL_API_KEY` | Live search / scrape |
| `GROQ_API_KEY` | Optional pitch/blurb fallback when Workers AI fails |
| `GEMINI_API_KEY` | Optional pitch/blurb fallback after Groq |
| `MYEMAILVERIFIER_API_KEY` | Email verify at send (ADR 0024; ~100 free credits/day) |
| `RESEND_WEBHOOK_SECRET` | **Required after deploy of audit hardening** — Svix secret for bounce/reply webhooks |
| `MAILEROO_WEBHOOK_SECRET` | Required only if you use Maileroo delivery webhooks |

**Removed:** `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Admin is a normal hashed user with
`users.is_admin = 1` (migration 0018). First boot creates
`admin@tryhermesmail.com` using `BOOTSTRAP_ADMIN_PASSWORD` (or a one-time
random UUID printed to Worker logs). After that, the secret is inert — rotate
the password hash in D1 (or change password after login), then you can delete
`BOOTSTRAP_ADMIN_PASSWORD`. Delete any leftover Wrangler secrets:

```bash
npx wrangler secret delete ADMIN_EMAIL
npx wrangler secret delete ADMIN_PASSWORD
# Only if you still need a first-boot (no admin row yet):
# npx wrangler secret put BOOTSTRAP_ADMIN_PASSWORD
# After admin exists:
# npx wrangler secret delete BOOTSTRAP_ADMIN_PASSWORD
```

### Resend delivery webhooks (bounce / reply → CRM)

**End users do not configure webhooks.** When someone pastes their Resend API
key in Settings → Easy (or re-saves Easy settings with a key on file), Hermes
registers `/api/webhooks/resend` and **re-enables** the endpoint if Resend
auto-disabled it after delivery failures. Signing secret is stored on the
workspace (migration 0016).

If Resend emails “Webhook endpoint disabled”, deploy a healthy Worker first,
then either click **Enable** in the Resend dashboard or re-save Settings → Easy
in Hermes (API `status: enabled`).

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
```

`MYEMAILVERIFIER_API_KEY`: required for verify-at-send —
[client.myemailverifier.com/apisettings](https://client.myemailverifier.com/apisettings)
(phone verify for ~100 free credits/day). Same value in `.env.local` for
`npm run dev`. Delete any leftover `MAILEROO_VERIFY_API_KEY` /
`ZERUH_API_KEY` secrets (removed in ADR 0024):

```bash
npx wrangler secret delete MAILEROO_VERIFY_API_KEY
npx wrangler secret delete ZERUH_API_KEY
```

Paste the value when prompted. Never commit secret values to git.

**Removed (ADR 0026):** `GMAIL_OAUTH_CLIENT_ID` / `GMAIL_OAUTH_CLIENT_SECRET`
(Pro mailbox send). Safe to delete leftover Wrangler secrets:

```bash
npx wrangler secret delete GMAIL_OAUTH_CLIENT_ID
npx wrangler secret delete GMAIL_OAUTH_CLIENT_SECRET
```
