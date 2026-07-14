# 0004. Cloudflare Workers via @opennextjs/cloudflare as the deploy target

- Status: accepted
- Date: 2026-07-13

## Context
Commercialization needs a hosting target for the Next.js (App Router) app that is
cheap at low volume, global/low-latency, and comes with a CDN, WAF, and rate
limiting we can put in front of signup and the API (bot/abuse control) as we add
auth and billing. It must not compromise the invariants: the app must still run
locally with `npm run dev` and in zero-key demo mode, and no security control may
block local dev.

## Decision
Deploy to **Cloudflare Workers** using **`@opennextjs/cloudflare`** as the
Next.js adapter. Cloudflare provides the CDN, WAF, and rate-limiting rules;
Turnstile (on signup) and WAF rate-limit rules are added in a **later phase** and
must be scoped so they never affect local dev or demo mode.

Deployment configuration lives in code/CI (Wrangler), not in app runtime env: the
application itself reads **no Cloudflare secrets**, so hosting stays decoupled
from business logic. This is recorded now (Phase 0) to fix the target; the actual
Wrangler/OpenNext wiring is implemented in a later phase.

## Alternatives considered
- **Vercel.** First-class Next.js DX and the default path. Rejected as the
  primary target for cost/lock-in reasons and because we specifically want
  Cloudflare's integrated WAF/Turnstile/rate-limiting for abuse control; still a
  viable fallback if OpenNext friction is high.
- **Node server on a VM / container (Fly, Render, Railway).** Full Node
  compatibility, but we manage scaling, CDN, and WAF ourselves.
- **Cloudflare Pages.** Being superseded by the Workers + OpenNext path for
  full-featured Next.js apps; Workers is the forward-looking target.

## Consequences
- ✅ Edge distribution, CDN, WAF, and rate limiting available at the platform
  layer — a natural home for Turnstile + WAF rules guarding signup/billing.
- ✅ Hosting stays decoupled: no Cloudflare secrets in app code; the app runs
  unchanged locally (`npm run dev`) and in demo mode.
- ⚠️ The Workers runtime is edge, not full Node. Server code must avoid
  Node-only APIs that OpenNext can't polyfill. Notably, the JSON file store
  (`fs`) will not work on Workers — but that is fine: production uses Supabase
  (ADR 0003), and the JSON store stays the **local/offline** default only.
- ⚠️ Turnstile/WAF/rate-limit rules must be scoped to production and must never
  block local dev or demo mode (constitution Article I.2). Enforce in a later
  phase with explicit env/host guards.
- ⚠️ Adds a build/deploy toolchain (Wrangler + OpenNext) to CI; implemented in a
  later phase, not Phase 0.
