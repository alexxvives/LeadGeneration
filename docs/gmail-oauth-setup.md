# Gmail OAuth setup (Pro mailbox send) — step by step

Lodestar needs a **Google Cloud OAuth client** so users can click
**Connect Google** and approve sending via Gmail. This is separate from Auth.js
login (`AUTH_GOOGLE_*`).

You need: a Google account, ~15 minutes, and your app URL
(local: `http://localhost:3000` · prod: `https://leadgeneration.alexxvives.workers.dev`).

Google’s UI is now **Google Auth Platform** (sidebar: Overview, Branding,
Audience, Clients, Data Access, …). Older docs said “OAuth consent screen” —
same ideas, new labels.

---

## 1. Create / open a Google Cloud project

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Top bar → project picker → **New Project** (or pick an existing one).
3. Name e.g. `LEADIFY` / `Lodestar` → **Create**.

## 2. Enable APIs — what you actually need

**Required (only this):**

| API | Why |
| --- | --- |
| **Gmail API** | Send mail via the user’s mailbox (`gmail.send`) |

**Skip for now (not useful for Lodestar send):**

| API | Why skip |
| --- | --- |
| Gmail MCP API | Agent/MCP tooling — not our product send path |
| Workspace MCP API | Same — MCP, not outreach |
| Gmail Postmaster Tools API | Domain reputation dashboards for high-volume bulk senders. Interesting later for agencies; **not** needed to Connect Google or send |

You can enable Postmaster much later if you want reputation charts. Do **not**
enable MCP APIs unless you’re building something else.

1. **APIs & Services** → **Library**.
2. Search **Gmail API** (exact name, not “MCP”) → **Enable**.

## 3. Scopes live under **Data Access** (not on the Client form)

The **Create OAuth client ID** page (Application type / Name / Origins /
Redirect URIs) does **not** have scopes. That’s expected.

1. Left sidebar → **Google Auth Platform** → **Data Access**.
2. **Add or remove scopes** (or **Add scopes**).
3. Filter / search and add:
   - `openid`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/gmail.send`
4. Save.

Also check:

- **Branding** — app name, support email (shows on the consent screen).
- **Audience** — External + **Test users**: add your Google account while the
  app is in Testing (required or Google will block you).

> `gmail.send` is a sensitive scope. Testing mode + test users is enough for
> you. Public “Production” later may need Google verification.

### Allow any Google account (leave Testing)

From **APIs & Services → Gmail API → Credentials** you only see the OAuth
*client* (e.g. Web client 1). Publishing is a different screen:

1. Left sidebar → **OAuth consent screen**  
   (or **Google Auth Platform → Audience** in the newer nav).
2. Confirm **User type: External**.
3. Under **Publishing status**, click **Publish app** (Testing → In production).
4. Fill branding / privacy policy / support email if Google asks.
5. Because `gmail.send` is a **sensitive** scope, Google may still show an
   “unverified app” warning until verification completes. Users can often click
   through “Advanced → Go to … (unsafe)” — or stay in Testing and keep adding
   **Test users** (best while dogfooding).

You do **not** need a Service Account for Connect Google. The existing
**Web application** OAuth client is correct.

## 4. Finish creating the OAuth Client (your current screenshot)

You’re on **Clients** → Create OAuth client ID. Fill:

1. **Application type:** Web application (already set).
2. **Name:** e.g. `Lodestar Gmail send` (or leave `Web client 1`).
3. **Authorized JavaScript origins** → **+ Add URI**:
   - `http://localhost:3000`
   - `https://leadgeneration.alexxvives.workers.dev`
4. **Authorized redirect URIs** → **+ Add URI** (required — exact match):
   - `http://localhost:3000/api/mailbox/google/callback`
   - `https://leadgeneration.alexxvives.workers.dev/api/mailbox/google/callback`
5. **Create** → copy **Client ID** and **Client secret**.

Settings can take a few minutes to propagate (as the yellow note says).

## 5. Put secrets in Lodestar env

### Local (`.env.local`)

```env
GMAIL_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
GMAIL_OAUTH_CLIENT_SECRET=your-client-secret
NEXTAUTH_URL=http://localhost:3000
```

Restart `npm run dev`.

### Production (Cloudflare Workers secrets)

```bash
npx wrangler secret put GMAIL_OAUTH_CLIENT_ID
npx wrangler secret put GMAIL_OAUTH_CLIENT_SECRET
npx wrangler secret put NEXTAUTH_URL
```

For `NEXTAUTH_URL`, paste the live Workers origin (no trailing slash), e.g.
`https://leadgeneration.alexxvives.workers.dev`. If this stays at
`http://localhost:3000`, Connect Google fails with `redirect_uri_mismatch`.
Settings → Pro shows a warning when OAuth is configured but the app URL looks
local.

## 6. What happens next in the product

Once these env vars are set, we finish:

1. Settings → Pro → **Connect Google**
2. OAuth consent → store refresh token (encrypted) on the workspace
3. Approved sends go through Gmail API behind `sendEmail()`
4. Soft daily warmup recommend (warning popup, not a hard block)

Until then, Easy (Resend) keeps working.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Can’t find scopes on Client page | Use **Data Access** in the left sidebar |
| `redirect_uri_mismatch` | Exact URI must match (no trailing slash mismatch; `http` vs `https`) |
| App blocked / access denied | **Audience** → add your Google account as a Test user |
| Scope error | Re-add `gmail.send` under **Data Access** |
| Works local, fails prod | Add the Workers redirect URI + set Wrangler secrets |

## Security notes

- Never commit Client Secret to git.
- Prefer a dedicated Google Cloud project for Lodestar.
- Keep the app in Testing until you’re ready for Google’s verification for
  public users.
