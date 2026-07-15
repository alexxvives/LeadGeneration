# Phase E — Send paths + deliverability (next)

**Updated:** 2026-07-15  
**Goal:** Make outbound setup feel as easy as Smartlead for non-technical
users, while keeping a clear “power user” path — without breaking HITL or
zero-key demo mode.

See also [`email-providers.md`](email-providers.md),
[`gmail-oauth-setup.md`](gmail-oauth-setup.md), and
[`decisions/competitor-features-2026-07.md`](decisions/competitor-features-2026-07.md).

---

## Dual send setup (product framing)

| Path | Who | What they do | Lodestar does |
| --- | --- | --- | --- |
| **Easy (non-tech)** | Solo founders who want “just send” | Paste Resend API key + From name/email; follow 3 DNS copy-paste rows | Verify domain health (poll SPF/DKIM/DMARC), show green/red, rate-limit, HITL approve |
| **Pro (tech / cold volume)** | Agencies / SDRs scaling | Connect Google Workspace or Microsoft 365 mailbox(es); optional secondary domain | OAuth/SMTP send via same `sendEmail()`, per-inbox caps, DNS checklist, later warmup partner |

**Non-goal:** shared `lodestar.app` From-domain for client outreach (reputation
contamination). **Non-goal:** Lodestar writing DNS at a registrar we don’t own.

### Easy path — ship next (P0)
1. Settings wizard: “I don’t want to think about this” → Resend steps only.
2. Show exact SPF/DKIM/DMARC records for their From domain (Resend API or docs deep-link).
3. Auto-poll / checklist already started — make it the hero of Sending.
4. Keep demo/simulate when no key.

### Pro path — design then ADR (P1)
1. ADR: Google + Microsoft OAuth as first-class transports behind `sendEmail()`.
2. Connect mailbox UI (scopes, reconnect, daily cap).
3. Multi-inbox rotation later (agency plan).
4. Warmup: partner (Instantly warmup-only or similar) — do **not** build a warmup network in-house first.

---

## OSS-inspired improvement backlog

Inspired by Wu-Wei-Mail, OutreachStud-io, PaulleDemon Email-automation — **ideas
to steal, not repos to vendor**.

| Idea | Source | Lodestar fit | Priority |
| --- | --- | --- | --- |
| Reply + bounce via IMAP/webhooks | Wu-Wei-Mail | Resend webhooks exist; IMAP if mailbox path ships | P0 webhook polish → P1 IMAP |
| Per-inbox daily caps + pacing | Wu-Wei-Mail | Extend rate limits per connected mailbox | P1 with OAuth |
| DNS health checks (SPF/DKIM/DMARC/MX) | OutreachStud-io | Expand Settings checklist + live DNS lookup | P0 |
| Sender rotation / cool-off on bounce | OutreachStud-io / Wu-Wei | After multi-inbox | P2 |
| Template variables + follow-up sequences | PaulleDemon | We have Day+3/+7 notes; real sequence templates next | P1 |
| Spintax / A-B variants | PaulleDemon / cold tools | Optional; keep HITL (no auto-blast) | P2 |
| Email verify before send | already (Zeruh) | Keep; surface failures in Outreach UI | done / polish |

### Ordered next steps
1. **P0 UX:** dual-path Settings copy (Easy Resend vs Pro mailbox “coming”).
2. **P0:** live DNS record display + poll for Resend domains.
3. **P0:** harden Resend webhooks (workspace matching, delivery UI on cards).
4. **P1 ADR:** Google/Microsoft connect → implement one provider end-to-end.
5. **P1:** sequence templates (still approve → send per step).
6. **P2:** multi-inbox + partner warmup.

---

## Agent execution prompt (copy-paste)

Use this when an agent should **apply the ordered steps one by one with
validation gates**. Do not skip gates. Do not implement Pro OAuth until the ADR
is accepted by a human.

```text
You are implementing docs/roadmap-send-paths.md for Lodestar.

Before coding: read docs/constitution.md, docs/email-providers.md, and
.cursor/skills/lodestar-ui/SKILL.md. Keep layering UI → API → service →
repo/providers. Never break HITL approve-before-send or zero-key demo mode.

Execute Ordered next steps IN ORDER. After EACH step:
  - npx tsc --noEmit
  - npm run lint
  - If a smoke-relevant path changed and dev server is up: npm run smoke
  - Stop and fix before the next step.

Step 1 — P0 UX dual-path Settings
  Add Easy vs Pro framing on Settings → Sending. Easy = Resend wizard steps
  (key + From + DNS). Pro = “Connect Google / Microsoft — coming soon” (no
  fake OAuth). Demo/simulate copy when no key. Validate.

Step 2 — P0 live DNS + poll
  Using workspace Resend key (via service), list/get Resend domains matching
  From email domain; show exact SPF/DKIM(/DMARC) rows with copy; poll status
  (Resend domain status + optional DoH). Domain health is the hero of Sending.
  No key → manual checklist + Resend docs link (demo-safe). Validate.

Step 3 — P0 harden Resend webhooks
  Tag outbound Resend sends with workspaceId + outreachId. Webhook resolves
  workspace from tags (fallback: latest sent by recipient email, cross-workspace
  lookup via repository). Update Outreach delivery UI copy so webhook-driven
  outcomes are clear; keep manual override. Validate.

Step 4 — P1 ADR only (STOP for human accept)
  Write docs/decisions/0010-mailbox-oauth-send.md (proposed): Google + Microsoft
  behind sendEmail(), scopes, caps, feature flag, non-goals (no in-house warmup).
  Do NOT implement OAuth until the ADR status is accepted.

Step 5 — P1 sequence templates (after ADR accepted OR as thin HITL polish)
  Real sequence templates still require approve→send per step. Prefer improving
  Day+3/+7 stubs + Outreach copy over auto-blast. If ADR not accepted yet, only
  polish stubs / docs — no new blast paths.

Step 6 — P2 document only
  Multi-inbox + partner warmup: backlog notes in ADR/roadmap only this pass.

Finish: update docs/session-handoff.md, LEARNINGS.md, and this roadmap’s
progress checklist. Commit only if the user asked.

Verify always:
  - Demo mode still simulates with no keys
  - Easy path never requires Pro
  - Pro path feature-flagged / coming-soon until built
```

### Progress (2026-07-15)

| Step | Status |
| --- | --- |
| 1 P0 dual-path Settings | done |
| 2 P0 live DNS + poll | done |
| 3 P0 webhook harden | done |
| 4 P1 ADR mailbox OAuth | **accepted** — Google E2E implemented (local); Microsoft next |
| 5 P1 sequence templates | deferred (Day+3/+7 stubs; full templates later) |
| 6 P2 multi-inbox / warmup | multi-inbox deferred; warmup = free DIY ramp (+ optional paid partner) |

---

## Agent tooling (not product scraping)

- **[gstack](https://github.com/garrytan/gstack) `/scrape`:** agent browser skill for
  *developers* extracting page data while coding. Useful for **QA / dogfood /
  agent workflows** — not a replacement for Firecrawl/Exa in production search.
- ~~Root `SKILL.md` (data-scraper-agent)~~ **deleted** — wrong stack for Lodestar.

---

## Verify
- Demo mode still sends simulated mail with no keys.
- Easy path: Resend key + verified domain → real send after approve.
- Pro path: never required for free/demo; feature-flagged when built.
