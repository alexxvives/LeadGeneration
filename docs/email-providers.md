# Email sending & deliverability — research notes (2026)

**Question:** What’s the best way to send Lodestar outreach efficiently and avoid
spam? Is Resend the right tool?

**Short answer:** Resend is excellent for **transactional** / product email and
a fine **BYO API** for low-volume human-approved sends — but it is **not** the
best long-term cold-outreach infrastructure. For spam avoidance, the stack that
wins in 2026 is: **customer’s own domain + warmed inboxes (Google/Microsoft) +
SPF/DKIM/DMARC + low volume + human approval**. Lodestar should stay
provider-agnostic and push **bring-your-own-sender**, not a shared Lodestar
sending domain.

_Research refreshed 2026-07-15 (Mailpool / Smartlead industry guides + prior
provider comparison)._

### How Smartlead-class tools actually send

They do **not** use Resend. They connect the user’s **Google Workspace /
Microsoft 365 mailboxes** (OAuth or SMTP/IMAP), rotate across many inboxes,
and run **warmup**. Domain auth is still on the user: buy a sending domain →
paste SPF/DKIM/DMARC at the registrar → tool polls until green. “Ready to send
right away” marketing usually means *guided setup + optional domain reseller*,
not Lodestar silently writing DNS for domains we don’t control.

**Lodestar implication:** keep BYO Resend for v1 HITL sends; the friendly
path that matches competitors is later **Connect Gmail/Outlook** + a DNS
checklist (and optional partner for domain purchase) — not a shared Lodestar
sending domain.

---

## What actually keeps mail out of spam

Provider brand matters less than these (in order):

1. **Domain reputation** — send from a domain the user controls; never the
   primary company domain for high-volume cold; use a secondary (e.g.
   `getakademo.com`) with proper DNS.
2. **Authentication** — SPF + DKIM + DMARC aligned. Without these, Gmail/Yahoo
   bulk-sender rules (2024+) punish hard.
3. **Warm-up** — new inboxes ramp slowly (often ~20–50/day early, then higher).
4. **List quality** — verify emails; bounce rate >2–3% destroys reputation.
5. **Content + cadence** — personal, short, no spammy footers; Lodestar’s
   per-lead approval + rate limits help here.
6. **Infrastructure isolation** — don’t mix transactional product mail and cold
   outreach on the same domain/IP pool.

Lodestar already helps on (5). Product work should bias toward (1)–(4).

---

## Provider landscape (for Lodestar)

| Approach | Tools | Fit for Lodestar | Spam risk |
| --- | --- | --- | --- |
| **Transactional ESP** | Resend, Postmark, Maileroo (API), SES | Great DX for “send this approved email now” | Shared pools + ToS often discourage **unsolicited** cold; fine at low human-approved volume on **user’s domain** |
| **SMTP / mailbox sending** | Google Workspace, Microsoft 365 via SMTP/OAuth | Best inbox placement for cold-ish B2B | Per-inbox caps (~20–100/day); needs multi-inbox at scale |
| **Cold infra platforms** | Instantly, Smartlead, Lemlist + domain providers (Mailpool, etc.) | Built for sequences, warmup, multi-inbox | Overkill for MVP; partner later if agencies need volume |
| **Shared platform domain** | “send via lodestar.app” | Tempting for onboarding | **Avoid for outreach** — one bad user tanks everyone |

### Is Resend the best tool?

- **For product/dev experience:** yes — clean API, already wired, good for magic
  links + low-volume approved sends when the user verifies **their** domain.
- **For cold outreach at scale:** no — industry practice in 2026 routes cold
  through **warmed Google/Microsoft inboxes** (or dedicated cold infra), not
  transactional ESPs. Resend (like Postmark) is optimized for mail recipients
  expect; aggressive cold can violate AUP and share-pool reputation.
- **Recommendation for Lodestar now:**
  1. **BYO Easy send:** Resend **or** Maileroo API key + customer domain
     (Settings → Easy — ADR 0011). Resend remains the default DX.
  2. **MyEmailVerifier** via `MYEMAILVERIFIER_API_KEY` — verify **at send**
     when the **lead’s board** has verify on (ADR 0025; was workspace-wide).
     Not run during search/enrich. No Zeruh/Maileroo Verify.
  3. Keep **SMTP path** as optional platform fallback.
  4. Do **not** market a shared Lodestar From-domain for client outreach.
  5. Later (agency plans): optional Instantly/Smartlead-style multi-inbox, or
     SES dedicated IPs — behind the same `sendEmail()` interface.

---

## Product implication (what we tell users)

- Tour / Settings: “Paste **your** Resend key and send from **your** domain.”
- Platform `RESEND_API_KEY` = local/dev and transactional product mail only.
- Physical address on US recipients (CAN-SPAM); quiet opt-out at send time.
- Human approval is a deliverability feature, not just ethics.

---

## Comparison snapshot (cost / DX)

| Provider | Free tier | Notes for us |
| --- | --- | --- |
| **Resend** | ~3k/mo (daily caps apply) | Best DX; BYO domain; not cold-infra |
| **Maileroo** | Generous SMTP free | Easy BYO *send* (ADR 0011); not the verify product |
| **Amazon SES** | Cheap at scale | Best $/email later; more ops |
| **Instantly / Smartlead** | Paid | Cold sequences + warmup; future integration |
| **Postmark** | Low | Transactional-only — avoid for cold |

---

## How this maps to code

- `src/lib/email/sender.ts`: Google mailbox → workspace Resend / Maileroo /
  **BYO SMTP** (Hostinger etc.) → platform Resend → platform SMTP → demo.
  Outbound sends tag `leadify_ws` + `leadify_outreach` for webhooks (legacy
  `lodestar_*` still matched). Bodies are sent as drafted — no STOP /
  mailing-address auto-footer.
- `src/lib/email/maileroo.ts`: Maileroo HTTP send (`smtp.maileroo.com/api/v2`).
- `src/lib/email/domain-health.ts` + `POST /api/providers/resend/domain-health`:
  live SPF/DKIM rows from Resend Domains API (demo-safe when no key).
- `src/lib/email/verify.ts`: **MyEmailVerifier only**
  (`client.myemailverifier.com/verifier/validate_single/{email}/{key}`) — **at
  send** only (`sendApprovedOutreach`) when `emailVerifyEnabled` is on. Soft
  “Invalid” / greylist → warn + optional `skipVerify` force-send (address kept).
  Hard junk (disposable / no-reply) still strips. Plan daily verify caps in
  Settings + studio; provider balance: `GET /api/providers/verify/usage`.
- Quotas + rate limits in `service.ts`.
- Settings → Easy: Resend, Maileroo, or **SMTP** (Hostinger / Zoho / etc.) +
  **Verify emails before sending** (MyEmailVerifier) toggle; Pro mailbox
  Connect Google (`SendSetupPanel`).   Easy From + keys are **per outreach
  profile** (`profile_send_settings_json`, migration 0027 / ADR 0021); each
  **board** links to one profile (`outreach_profile_id`, ADR 0022) so send uses
  that board’s From/keys. Pro mailbox stays workspace-scoped. Legacy workspace SMTP/From columns remain
  as fallback. Password never echoed — Settings gets `hasSmtpPass` only.
  Platform `SMTP_*` env stays auth / last-resort fallback, not tenant
  mailboxes. **Send a test email** (`POST /api/send/test`) uses the active
  profile’s identity via the same `sendEmail()` path. Profile
  `preferredSendPath` chooses Easy vs Pro at send time. API keys are
  server-side only; Settings receives `hasResendKey` / `hasMailerooKey` /
  `hasSmtpPass` flags.
- **Hostinger Sent:** API sends (Resend/Maileroo) never appear in
  Hostinger webmail Sent. Easy → SMTP through `smtp.hostinger.com` uses
  that mailbox; copies often show in Sent (IMAP APPEND not implemented).
- Stay pluggable: swapping providers is config, not a rewrite.
- **Webhooks:** `POST /api/webhooks/resend` and `POST /api/webhooks/maileroo`
  (public) — prefer tags (`hermes_ws` + `hermes_outreach`), else latest sent
  by recipient email (replies + bounces, after signature verifies).
  Resend webhook payloads carry tags as a **flat object** (not the
  `{name,value}[]` send shape) — the route normalizes both.
  Bounce/complaint/failed → `deliveryStatus=bounced`, undo auto-Contacted when
  email was the only contact method, journal “Email bounced”, Pipeline rose
  highlight + toast on soft refresh. Resend inbound `email.received` →
  `replied` (+ CRM In Conversation). Missing signing secret / unexpected
  handler errors return **200 ignored** (not 5xx) so Resend does not
  auto-disable the endpoint. Saving Easy settings auto-registers **one**
  webhook endpoint per Resend **account** (API key); signing secrets are kept
  per outreach profile (and mirrored on the workspace). Different profiles that
  share the same Resend account reuse that webhook — do **not** create one
  webhook per profile in the Resend dashboard. The handler tries every stored
  profile secret for the tagged workspace. Platform fallback:
  `RESEND_WEBHOOK_SECRET` / `MAILEROO_WEBHOOK_SECRET`.
- **Pro path:** [`0010-mailbox-oauth-send.md`](decisions/0010-mailbox-oauth-send.md)
  (accepted) — Google OAuth behind `sendEmail()` when connected; Microsoft next.
  Warmup: free DIY slow ramp; paid partner optional — no free automated network.
- **Registrar note:** Domain at Hostinger/GoDaddy/etc. is fine for Easy path —
  add Resend's DNS records there (or at the DNS host if nameservers differ).
  Resend does not require moving the domain away from the registrar. For
  Easy → SMTP via Hostinger, SPF should authorize Hostinger’s mail servers
  (avoid a Resend-only SPF if you leave Resend half-configured).

**Bottom line:** Resend is the right **API shape** for v1 BYO sending;
**MyEmailVerifier** is the **verify** layer (ADR 0016). Deliverability still
needs the customer’s domain, DNS, warm-up, list hygiene, and human-in-the-loop
limits.
