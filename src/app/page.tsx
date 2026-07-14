import Image from "next/image";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { ArrowIcon, SearchIcon, SparkIcon, MailIcon, CheckIcon, ShieldIcon } from "@/components/icons";

const DOMAIN_TIPS = [
  {
    title: "Use a dedicated sending domain",
    body: "Never send cold outreach from your main brand domain. Buy a close variant (e.g. getlodestar.com) so a reputation hit can't burn your primary domain's email.",
  },
  {
    title: "Set SPF + DKIM + DMARC",
    body: "These three DNS records prove you own the domain and prevent spoofing. Unauthenticated mail goes straight to spam — they're non-negotiable before the first send.",
  },
  {
    title: "Warm up gradually",
    body: "Start at 10–20 emails/day and ramp over 2–4 weeks. Inbox providers trust domain reputation built over time; a cold domain blasting hundreds of emails triggers filters.",
  },
  {
    title: "Verify before you send",
    body: "Bounce rate above ~3% gets you throttled or banned. Run discovered emails through a verification API (Maileroo includes one) to filter dead addresses before they hurt your score.",
  },
  {
    title: "Keep sends intentional",
    body: "Lodestar enforces per-lead approval and a per-minute rate limit by design. These aren't annoyances — they're the guardrails that keep your sending reputation intact.",
  },
  {
    title: "Skip transactional ESPs for cold email",
    body: "Postmark and pure-transactional providers will suspend you regardless of volume. Use Amazon SES with your own domain, or purpose-built cold infra (Instantly, Smartlead) at scale.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Search",
    body: "Describe your ideal customer — a niche, a city, an offer. Lodestar charts a search across the open web.",
    icon: SearchIcon,
  },
  {
    n: "02",
    title: "Enrich",
    body: "Each prospect is scraped for a website, emails, phones and an about blurb, then scored for fit — transparently.",
    icon: SparkIcon,
  },
  {
    n: "03",
    title: "Draft",
    body: "A personalized first email is written for every lead, using their profile and your offer notes.",
    icon: MailIcon,
  },
  {
    n: "04",
    title: "Approve & send",
    body: "Nothing leaves without you. Review, edit, approve per lead, then send — rate-limited and compliant.",
    icon: CheckIcon,
  },
];

export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* Full-bleed hero background */}
      <div className="absolute inset-0 -z-10">
        <Image
          src="/images/hero-aurora.jpg"
          alt="Aurora over a still lake at night"
          fill
          priority
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-ink-950/70 via-ink-950/85 to-ink-950" />
        <div className="absolute inset-0 aurora-glow opacity-60" />
      </div>

      {/* Top nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <BrandMark />
        <nav className="flex items-center gap-6 text-sm text-mist-300">
          <a href="#how" className="hidden transition-colors hover:text-mist-100 sm:inline">
            How it works
          </a>
          <a href="#ethics" className="hidden transition-colors hover:text-mist-100 sm:inline">
            Ethics
          </a>
          <a href="#domain" className="hidden transition-colors hover:text-mist-100 sm:inline">
            Deliverability
          </a>
          <Link
            href="/app"
            className="rounded-full bg-aurora-400 px-4 py-2 font-medium text-ink-950 transition-transform hover:scale-105"
          >
            Open the studio
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-24 pt-16 sm:pt-28">
        <div className="max-w-3xl">
          <span className="animate-float-up inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-widest text-aurora-300">
            <span className="h-1.5 w-1.5 rounded-full bg-aurora-400 pulse-ring" />
            Human-in-the-loop lead generation
          </span>
          <h1 className="animate-float-up mt-6 font-display text-5xl font-semibold leading-[1.05] tracking-tight text-balance sm:text-7xl">
            Navigate to your
            <br />
            <span className="bg-gradient-to-r from-aurora-300 via-aurora-400 to-amber-300 bg-clip-text text-transparent">
              next customer.
            </span>
          </h1>
          <p className="animate-float-up mt-6 max-w-xl text-lg leading-relaxed text-mist-300">
            Lodestar turns a plain-English niche into a board of enriched,
            fit-scored prospects — with outreach drafted for each one. You stay
            at the helm: review, approve, and send on your terms.
          </p>
          <div className="animate-float-up mt-9 flex flex-wrap items-center gap-4">
            <Link
              href="/app"
              className="group inline-flex items-center gap-2 rounded-full bg-aurora-400 px-6 py-3.5 font-medium text-ink-950 shadow-lg shadow-aurora-500/20 transition-transform hover:scale-105"
            >
              Find leads now
              <ArrowIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <span className="text-sm text-mist-500">
              Works instantly with sample data — no API keys required.
            </span>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl px-6 pb-24">
        <div className="mb-10 flex items-end justify-between">
          <h2 className="font-display text-3xl font-semibold sm:text-4xl">
            Five steps, one steady hand
          </h2>
          <span className="hidden text-sm text-mist-500 sm:block">
            Search → Enrich → Draft → Approve → Send
          </span>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className="glass card-hover rounded-xl2 p-6"
            >
              <div className="flex items-center justify-between">
                <s.icon className="h-6 w-6 text-aurora-300" />
                <span className="font-display text-2xl text-mist-500">{s.n}</span>
              </div>
              <h3 className="mt-5 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-mist-300">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Ethics / compliance */}
      <section id="ethics" className="mx-auto max-w-6xl px-6 pb-28">
        <div className="glass rounded-xl2 p-8 sm:p-12">
          <h2 className="font-display text-3xl font-semibold">
            Built to keep you compliant
          </h2>
          <p className="mt-3 max-w-2xl text-mist-300">
            Cold outreach done wrong is spam. Lodestar is designed so a human
            approves every message, and the guardrails are on by default.
          </p>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            {[
              ["Per-lead approval", "No message is ever auto-blasted. Every send needs an explicit approve."],
              ["Rate limited", "Outbound sends are throttled per minute to protect deliverability."],
              ["Clear identity + opt-out", "Every draft carries a from-identity, mailing address, and unsubscribe placeholder."],
              ["Public web only", "Enrichment never touches content behind a login."],
              ["Form-fill is a stub", "Contact-form automation is demo-only, off by default, and flagged for legal review."],
              ["You own the data", "Everything is stored locally in a file DB you control."],
            ].map(([title, body]) => (
              <div key={title} className="flex gap-3">
                <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-aurora-400" />
                <div>
                  <p className="font-medium">{title}</p>
                  <p className="mt-1 text-sm text-mist-500">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Domain protection guide */}
      <section id="domain" className="mx-auto max-w-6xl px-6 pb-28">
        <div className="mb-3 flex items-center gap-3">
          <ShieldIcon className="h-6 w-6 text-amber-300" />
          <span className="text-xs font-medium uppercase tracking-widest text-amber-300">
            Deliverability guide
          </span>
        </div>
        <h2 className="font-display text-3xl font-semibold sm:text-4xl">
          How to not get your domain banned
        </h2>
        <p className="mt-3 max-w-2xl text-mist-300">
          Cold outreach is legal when done right. Bans and blocks come from poor
          sending hygiene — high bounce rates, spam complaints, unauthenticated
          mail. Follow these six steps before you send a single real email.
        </p>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {DOMAIN_TIPS.map((tip, i) => (
            <div
              key={tip.title}
              className="glass rounded-xl2 p-5 transition-colors hover:border-amber-400/20"
            >
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-400/10 text-xs font-bold text-amber-300">
                  {i + 1}
                </span>
              </div>
              <h3 className="font-semibold leading-snug">{tip.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-mist-300">{tip.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-xl border border-amber-400/15 bg-amber-400/5 px-6 py-4">
          <p className="text-sm text-amber-200/80">
            <span className="font-semibold text-amber-300">Bottom line:</span>{" "}
            Lodestar handles the rate limiting and approval guardrails. You handle the
            DNS setup and domain hygiene. Together, that&apos;s a responsible cold-outreach
            stack that won&apos;t get you banned.
          </p>
        </div>
      </section>

      <footer className="border-t border-white/5 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-mist-500 sm:flex-row">
          <BrandMark size="sm" />
          <p>Navigate responsibly. You are the human in the loop.</p>
        </div>
      </footer>
    </main>
  );
}
