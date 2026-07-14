# Lodestar

**Navigate to your next customer.** A human-in-the-loop lead generation studio.
Describe an ideal customer in plain English → Lodestar searches the web,
enriches each prospect, scores fit, drafts a personalized outreach email, and
puts every message in an approval queue. **Nothing is sent without your explicit
per-lead approval.**

Built with Next.js (App Router) + TypeScript + Tailwind. Runs fully offline in
demo mode — no API keys required to explore the whole flow.

---

## Quick start

```bash
npm install
npm run seed      # optional: pre-fill the board with demo leads
npm run dev       # http://localhost:3000
```

Open <http://localhost:3000> for the landing page, or go straight to
<http://localhost:3000/app> for the studio.

> No keys? You're in **demo mode**: searches return realistic sample leads and
> "sends" are simulated (never actually delivered). The entire UI works.

---

## The flow

**Search → Enrich → Draft → Approve → Send**

1. **Search** — Enter a niche/ICP (e.g. "dentist clinics"), optional location and
   offer notes on the studio's search hero.
2. **Enrich** — Each result is scraped for website, emails, phones, and an about
   blurb, then given a transparent 0–100 **fit score** (every point is explained).
3. **Draft** — A personalized first email is **auto-generated for every lead** as
   part of the run, so prospects land already drafted and "in review". Open any
   lead to edit or **Regenerate** the draft.
4. **Approve** — Review and edit the draft, then **Approve** or **Reject** per lead.
   Switch the board between **Cards** and **Table** views.
5. **Send** — Approved emails send via your provider, rate-limited, with a
   compliance footer. Status is tracked: `draft → approved → sent / failed`.

The **Approval queue** tab groups everything awaiting a decision and lets you
send all approved emails in one rate-limited pass.

---

## Environment variables

Copy `.env.example` → `.env.local` and fill in what you have. All are optional.

| Variable | Purpose | Without it |
| --- | --- | --- |
| `FIRECRAWL_API_KEY` | Live web search + page scrape (preferred) | Demo leads |
| `EXA_API_KEY` | Alternative live search provider | Demo leads |
| `MAX_LEADS_PER_RUN` | Leads discovered per search (default 12) | 12 |
| `RESEND_API_KEY` | Email sending via Resend (recommended) | Demo/simulated send |
| `SMTP_HOST/PORT/USER/PASS` | Email via SMTP (Nodemailer) | Demo/simulated send |
| `OUTREACH_FROM_NAME` / `OUTREACH_FROM_EMAIL` | Sender identity | Placeholder identity |
| `OUTREACH_REPLY_TO` | Reply-to address | Falls back to from email |
| `OUTREACH_PHYSICAL_ADDRESS` | CAN-SPAM mailing address in footer | Placeholder |
| `SEND_RATE_PER_MINUTE` | Outbound rate limit (default 5) | 5 |
| `ENABLE_CONTACT_FORM_AUTOMATION` | Feature flag (see below) | `false` (off) |

Check the **Settings** page in-app to see exactly which capabilities are live.

### What works without keys vs. with keys

| Capability | No keys (demo) | With keys (live) |
| --- | --- | --- |
| Search & enrichment | Realistic sample leads | Real web results via Firecrawl/Exa |
| Fit scoring, drafting, editing | ✅ Full | ✅ Full |
| Approve / reject queue | ✅ Full | ✅ Full |
| Email send | Simulated (logged, not delivered) | Delivered via Resend/SMTP |

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run seed` | Pre-fill the local DB with demo leads |
| `npm run lint` | Lint |
| `npm run smoke` | Headless smoke test of the core flow (needs dev server running) |

---

## Project structure

```
src/
  app/
    page.tsx                 Landing (full-bleed hero)
    app/                     The studio (app shell)
      page.tsx               Lead board + drawer + queue
      settings/page.tsx      Capability status & compliance settings
    api/                     Thin route handlers → services
      runs/  board/  outreach/  send/  settings/  contact-form/
  components/                UI (brand, icons, studio/*)
  lib/
    types.ts                 Typed models: Run / Lead / Outreach
    config.ts                Env + capability detection
    fit-score.ts             Transparent heuristic scoring
    service.ts               App services (the coordination layer)
    db/                      Repository abstraction + JSON file store
    search/                  Firecrawl + Exa providers, enrichment, demo data
    outreach/                Draft generation + compliance footer
    email/                   Rate-limited sender (Resend / SMTP / demo)
data/                        Local JSON DB (git-ignored)
scripts/                     seed + smoke test
```

### Documentation

Deeper docs live in [`docs/`](docs/), indexed by [`AGENTS.md`](AGENTS.md):

- [`docs/how-it-works.md`](docs/how-it-works.md) — product + flow + architecture
- [`docs/constitution.md`](docs/constitution.md) — the principles all code follows
- [`docs/search-and-enrichment.md`](docs/search-and-enrichment.md) — how search works + roadmap
- [`docs/email-providers.md`](docs/email-providers.md) — Resend vs Maileroo vs SES
- [`docs/business-plan.md`](docs/business-plan.md) / [`docs/commercialization.md`](docs/commercialization.md)
- [`docs/decisions/`](docs/decisions/) — ADRs + learnings log

### Swapping the database (→ Supabase later)

The app only talks to the `LeadRepository` interface in `src/lib/db/index.ts`.
Today it's backed by a JSON file (`JsonStore`). To move to Supabase/Postgres,
implement the same interface with the Supabase client and change the one-line
factory in `getDb()`. No UI or API-route changes required.

---

## Compliance & responsible use (please read)

Lodestar is designed to keep you on the right side of anti-spam law and platform
Terms of Service. The guardrails are **on by default**:

- **Human-in-the-loop by design.** No email is sent without explicit per-lead
  approval. There is no "auto-blast".
- **Rate limiting.** Outbound sends are throttled per minute (`SEND_RATE_PER_MINUTE`)
  to protect deliverability and behave responsibly.
- **Clear identity + unsubscribe.** Every draft includes your from-identity, a
  physical mailing address, and an unsubscribe placeholder. **Wire the
  unsubscribe link to a real one-click opt-out before commercial sending.**
- **Public web only.** Enrichment never authenticates into or scrapes content
  behind a login.
- **Contact-form automation is a demo-only stub.** It is gated behind
  `ENABLE_CONTACT_FORM_AUTOMATION` (off by default) and, even when enabled, only
  *simulates* a submission — it never posts to a real site. Auto-submitting
  contact forms can violate ToS and computer-misuse / anti-spam laws. The code is
  clearly commented where **legal review is required before commercializing**.

You are responsible for complying with CAN-SPAM (US), CASL (Canada), GDPR/ePrivacy
(EU/UK), and any platform Terms of Service that apply to how you use this tool.

---

## Notes

- Local persistence is a JSON file at `data/db.json` (git-ignored). Delete it to
  reset. It's structured behind a repository interface for an easy Supabase swap.
- Outreach drafting is template-based (no LLM key needed). Swap in an LLM inside
  `src/lib/outreach/draft.ts` without touching the approval/send flow.
