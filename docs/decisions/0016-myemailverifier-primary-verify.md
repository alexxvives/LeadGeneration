# 0016. MyEmailVerifier is the primary email verify provider
- Status: accepted
- Date: 2026-07-20
- Amends: [0009](0009-resend-send-maileroo-verify.md)

## Context

ADR 0009 chose Maileroo Verify (Zeruh) for send-time list hygiene. In practice we
wired **MyEmailVerifier** as preferred (`MYEMAILVERIFIER_API_KEY`) because its
free tier (~100 credits/day) dwarfs Zeruh’s monthly free pool — see LEARNINGS
2026-07-16/17. Code and parts of the docs already preferred MEV; ADR 0009 and
`email-providers.md` still said Zeruh was the decision. That drift confused
operators.

We also want a **single verify story** in product copy: not two first-class
providers.

## Decision

1. **Primary verify:** MyEmailVerifier (`MYEMAILVERIFIER_API_KEY`) at **send**
   time only (`verifyEmail` → `sendApprovedOutreach`), when workspace
   `emailVerifyEnabled` is on.
2. **Legacy fallback only:** Zeruh / Maileroo Verify
   (`MAILEROO_VERIFY_API_KEY` / `ZERUH_API_KEY`) if MEV is unset. Not marketed;
   kept so existing Wrangler secrets keep working.
3. **No key:** local heuristic (demo / zero-key) — never hard-blocks send
   (constitution Art. I.2).
4. **Do not add** MillionVerifier or other verify vendors while MEV works.
5. **UI / docs:** say “MyEmailVerifier” (or “Verified before send”); mention
   Zeruh only as legacy env alias.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Keep Zeruh as documented primary | Contradicts code + free-tier economics |
| Remove Zeruh from code entirely | Breaks deploys that only have `MAILEROO_VERIFY_API_KEY` |
| MillionVerifier instead | Same job as MEV; extra vendor for no gain |
| Verify at enrich | Burns credits on leads that never send |

## Consequences

- ADR 0009’s verify clause is superseded by this ADR; send-path (Resend /
  Maileroo Easy) from 0009/0011 stays.
- `.env.example`, `docs/email-providers.md`, Settings copy align on MEV.
- Usage route: `GET /api/providers/verify/usage` (preferred). Legacy alias
  `/api/providers/zeruh/usage` re-exports the same handler.

## Implementation plan

- Docs: this ADR + amend 0009 status; `email-providers.md`; `.env.example`.
- UI: `EmailVerifySettings` copy → MyEmailVerifier; demote Zeruh to “legacy”.
- Code: no behavior change required (`verify.ts` already prefers MEV).
