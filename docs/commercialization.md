# Commercialization Plan (Pricing, Plans, Auth)

This is the **bigger change**: turning the MVP into something sellable — pricing
page, plans (incl. a free tier), authentication, and putting the studio behind a
login. Per your request, this doc lays out the plan **and gives you a ready-to-run
prompt** to kick it off efficiently. Read `business-plan.md` for the pricing
rationale.

> **Recommendation: don't build this in one giant pass.** Do it in the phased
> order below, each phase shippable and reviewable. The prompt at the bottom
> encodes exactly that.

---

## Decisions to lock before building

1. **Auth + DB provider → Supabase.** It gives us auth (email/OAuth), Postgres,
   and row-level security in one place, and it's the exact swap our
   `LeadRepository` abstraction was designed for (`docs/how-it-works.md` §5).
   One implementation of the interface + swap `getDb()`.
2. **Billing → Stripe** (Checkout + Billing Portal + webhooks). Metered/quota via
   our own counters, enforced in the service layer.
3. **Multi-tenancy → workspaces.** Every `Run`/`Lead`/`Outreach` gets a
   `workspaceId`; RLS scopes data per workspace. Flat pricing (not per-seat).
4. **Plans & limits** (from `business-plan.md`): Free / Starter $29 / Pro $79 /
   Agency $199, with monthly **lead-credit** and **send** quotas.
5. **Studio behind login; landing + pricing public.** Free plan = full flow at
   small quotas (demo mode always free). This keeps the PLG funnel.
6. **Keep the invariants** (constitution Article I): human approval, demo mode,
   compliance-by-default all survive commercialization.

## Phased build

- **Phase 0 — Supabase swap (no user-visible change).** Implement
  `SupabaseRepository` behind `LeadRepository`; migrate schema; keep JSON store
  as the local/dev fallback. Ship. _This de-risks everything else._
- **Phase 1 — Auth + workspaces.** Supabase Auth, `/login`, protected `/app`,
  a default workspace per user, `workspaceId` on all rows + RLS.
- **Phase 2 — Plans + usage metering.** `plans` config, per-workspace usage
  counters (lead credits, sends) enforced in `service.ts`; friendly "limit
  reached" UX. Still no payment.
- **Phase 3 — Pricing page + Stripe.** Public `/pricing`, Stripe Checkout,
  Billing Portal, webhooks → set workspace plan; gate quotas by plan.
- **Phase 4 — Polish.** Upgrade prompts at the paywall, usage dashboard in
  settings, annual billing toggle, email receipts.

## Things to get right (so it stays consistent)

- All new persistence goes through the repository interface — **no direct DB
  calls in routes/UI** (constitution Article II).
- Quota checks live in the **service layer**, not the UI (UI just reflects them).
- Never trust the client for entitlements; enforce plan/limits server-side and in
  Stripe webhooks.
- Add ADRs in `docs/decisions/` for: Supabase choice, Stripe model,
  credit definition, RLS design.
- Update `docs/how-it-works.md` and `AGENTS.md` as the architecture grows.

---

## ✅ The prompt to run (paste this back to me to start)

> I want to commercialize Lodestar. Follow `docs/commercialization.md` and
> `docs/business-plan.md`, and obey `docs/constitution.md` (keep human approval,
> demo mode, and compliance-by-default intact).
>
> **Do it in the phased order, one phase per PR/checkpoint, pausing after each so
> I can review. Start with Phase 0 only** and stop for my sign-off before Phase 1.
>
> Constraints & choices:
> - Auth + DB: **Supabase** (implement `SupabaseRepository` behind the existing
>   `LeadRepository`; keep the JSON store as a dev/offline fallback selected via
>   env). Provide SQL migrations and update `.env.example`.
> - Billing: **Stripe** (Checkout + Billing Portal + webhooks). No secrets in the
>   client; enforce entitlements server-side.
> - Multi-tenancy: **workspaces**; add `workspaceId` to Run/Lead/Outreach with
>   row-level security. Flat pricing, not per-seat.
> - Plans/quotas from `business-plan.md`: Free / Starter $29 / Pro $79 /
>   Agency $199, with monthly lead-credit + send quotas enforced in the service
>   layer. Demo mode is always free and unmetered.
> - Studio (`/app`) behind login; landing + a new `/pricing` page public.
>
> For **Phase 0**: implement and verify the Supabase repository swap with **no
> user-visible change**, keep `npm run smoke` green, run `tsc`/`lint`, and record
> an ADR for the Supabase decision. Tell me exactly what env vars / Supabase
> project setup I need to provide, and what you couldn't verify without them.

Adjust plan prices/quotas in the prompt if you want different numbers — the code
should read them from a single `plans` config so they're easy to change.
