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
| `RESEND_API_KEY` | Magic-link + optional platform email |
| `FIRECRAWL_API_KEY` | Live search / scrape |
| `GMAIL_OAUTH_CLIENT_ID` | Pro mailbox Connect Google |
| `GMAIL_OAUTH_CLIENT_SECRET` | Pro mailbox Connect Google |
| `GROQ_API_KEY` | Optional pitch/blurb fallback when Workers AI fails |
| `GEMINI_API_KEY` | Optional pitch/blurb fallback after Groq |
| `MAILEROO_VERIFY_API_KEY` | Zeruh email verify at send (alias `ZERUH_API_KEY`) |

Workers AI itself uses the `AI` binding in `wrangler.jsonc` — **no secret**.

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
npx wrangler secret put MAILEROO_VERIFY_API_KEY
```

`MAILEROO_VERIFY_API_KEY`: create a free key at [maileroo.com](https://maileroo.com) → Email Verification / Zeruh, then paste when prompted. Same value can go in `.env.local` for `npm run dev`.

Paste the value when prompted. Never commit secret values to git.

## After rotating Google OAuth

If you recreate the Google Cloud client, update **both** Gmail secrets and confirm
`NEXTAUTH_URL` is still `https://leadgeneration.alexxvives.workers.dev`.
