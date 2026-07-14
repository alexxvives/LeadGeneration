# Commercialization Plan (Pricing, Plans, Auth)

> **Status as of 2026-07-14:** All four commercial phases are **implemented in
> code**. The stack chosen was **Cloudflare D1 + Auth.js** (not Supabase — see
> ADRs 0005–0008 for the full rationale). What remains is **deployment** — wiring
> live D1, SMTP, and Stripe credentials on Cloudflare Workers. See `README.md`
> and `docs/session-handoff.md` for the deploy checklist.

---

## Stack decisions (locked)

| Concern | Decision | ADR |
| --- | --- | --- |
| Auth | **Auth.js v5** — JWT sessions, edge-safe split config | ADR 0007 |
| Database | **Cloudflare D1** (SQLite at the edge); `JsonStore` for local dev | ADR 0005 |
| Multi-tenancy | **Workspaces** — every Run/Lead/Outreach has a `workspaceId`; service-layer isolation (not RLS) | ADR 0006 |
| Billing | **Stripe** — Checkout + Billing Portal + webhooks, server-side entitlements only | ADR 0008 |
| Plans | Free / Starter $29 / Pro $79 / Agency $199 — monthly lead-credit + send quotas (see `src/lib/plans.ts`) | ADR 0008 |

> **Why not Supabase?** An earlier draft of this document targeted Supabase for
> auth + DB (marked as "Phase 0" below). That was superseded immediately when it
> became clear D1 + Auth.js was already in use on a related project, eliminating
> the learning-curve advantage. See ADR 0005 for the full decision.

---

## Phase status

### Phase 0 — DB swap ✅ done
`JsonStore` (local dev / demo) and `D1Store` (Workers production) both implement
`LeadRepository`. `getDb(binding?)` selects the right backend. Schema in
`migrations/0001_init.sql` through `0006_workspace_email_settings.sql`.

### Phase 1 — Auth + workspaces ✅ done
Auth.js v5 with a Credentials provider (dev, edge-safe `auth.config.ts`) and
magic-link providers in `auth.ts` only (SMTP/Nodemailer preferred, else Resend)
when a D1 adapter is present. `auth.ts` also adds workspace-provisioning JWT
callback. `workspace_id` is on all Run/Lead/Outreach rows. The "local" workspace
is the implicit single-tenant used in demo/dev mode — always free and unmetered.

### Phase 2 — Plans + usage metering ✅ done
`src/lib/plans.ts` is the single source of truth for quotas and Stripe price-env
names. `createAndRunSearch` checks lead credits; `sendApprovedOutreach` checks
send quota *after* the approval gate. Over-limit throws `QuotaError` → 402, which
the UI turns into an upgrade modal. Metering is gated on the D1 binding
(`metered = !!binding`), so the local JSON-store path is always unmetered.

### Phase 3 — Pricing page + Stripe ✅ done
`/pricing` is public (Stripe CTAs). `/api/billing/checkout` and
`/api/billing/portal` create Stripe sessions server-side. `/api/webhooks/stripe`
verifies signatures with `constructEventAsync` and writes the new plan to the
workspace row. Secrets never reach the client.

### Phase 4 — Polish ✅ largely done
Upgrade modal on quota hit, usage bars in Settings, Firecrawl-credit badge. SMTP
connect wizard (plain env instructions in Settings) shipped. Annual billing toggle
not yet implemented.

---

## What remains: deployment, not code

The commercial code path is complete. To go live:

1. **D1**: run `npm run cf:migrate` against the production D1 database (includes
   through `0006` — CRM stage + workspace email settings). Set `AUTH_SECRET` to
   enforce auth.
2. **SMTP/email**: set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
   `OUTREACH_FROM_EMAIL`, `OUTREACH_FROM_NAME`, `OUTREACH_PHYSICAL_ADDRESS` as
   Wrangler secrets.
3. **Stripe**: set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the four
   `STRIPE_PRICE_*` env vars (see `src/lib/plans.ts`). Wire the webhook endpoint
   (`/api/webhooks/stripe`) in the Stripe dashboard.
4. **Deploy**: `npm run cf:deploy` (OpenNext + Cloudflare Workers).

See `README.md` for the full step-by-step and `docs/session-handoff.md` for the
current status.

---

## Invariants that must survive deployment

These are non-negotiable (constitution Article I):

- No email sends without **explicit per-lead human approval** (`outreach.status === "approved"`).
- The app must remain **fully usable with zero API keys** (demo mode). Never
  remove the JsonStore fallback or the demo-data path.
- **Compliance footer** (from-identity, physical address, unsubscribe placeholder)
  ships in every outbound email.
- **Secrets never reach the client** — all Stripe/SMTP keys come from Wrangler
  secrets / `.env.local`, never from browser storage.
