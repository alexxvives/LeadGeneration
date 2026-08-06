# 0024. Remove Zeruh / Maileroo Verify — MyEmailVerifier only
- Status: accepted
- Date: 2026-08-06
- Amends: [0016](0016-myemailverifier-primary-verify.md), [0009](0009-resend-send-maileroo-verify.md) (verify clause)

## Context

ADR 0016 kept Zeruh (`MAILEROO_VERIFY_API_KEY` / `ZERUH_API_KEY`) as a legacy
fallback when MyEmailVerifier failed or was unset. In production that fallback
was worse than nothing: a bad Zeruh key returned HTTP 401, overwrote the real
MEV error (`Invalid API Key`), and with the new “hard-fail when verify is on
but the provider never completed” policy, **blocked every send** while looking
like a free-tier problem.

We do not market two verify vendors. MEV’s ~100 free credits/day is the only
verify story we want.

## Decision

1. **Verify = MyEmailVerifier only** (`MYEMAILVERIFIER_API_KEY`).
2. **Remove** Zeruh client code, env aliases, and capability ORs.
3. **Delete** leftover Wrangler secrets `MAILEROO_VERIFY_API_KEY` /
   `ZERUH_API_KEY` when present.
4. Keep deprecated route alias `GET /api/providers/zeruh/usage` → verify/usage
   so old bookmarks do not 404 (handler is MEV-only).
5. Provider failures still hard-block send when verify is on; error text must
   surface MEV’s message (e.g. `Invalid API Key`) so ops is not guessing.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Keep Zeruh as silent fallback | Masked MEV auth failures; second vendor to maintain |
| Fail-open again on MEV errors | Re-hides broken keys; contradicts recent hygiene hardening |
| MillionVerifier instead | Same job as MEV; no need for a third vendor |

## Consequences

- Deploys that only had `MAILEROO_VERIFY_API_KEY` lose verify until they set
  `MYEMAILVERIFIER_API_KEY` (acceptable — we never marketed Zeruh).
- Diagnosis is one provider deep: fix MEV key/credits or turn verify off.
- Docs / `.env.example` / secrets list drop Zeruh verify.

## Implementation plan

- `src/lib/email/verify.ts` — MEV + heuristic only.
- `src/lib/config.ts` — `emailVerify` / `emailVerifyKey` = MEV only.
- `src/app/api/providers/verify/usage/route.ts` — drop Zeruh account branch.
- Docs: this ADR, amend 0016, `email-providers.md`, `cloudflare-secrets.md`,
  LEARNINGS + session-handoff.
- Ops: `npx wrangler secret delete MAILEROO_VERIFY_API_KEY`.
