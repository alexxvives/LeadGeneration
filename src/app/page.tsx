import Link from "next/link";
import { MarketingShell } from "@/components/MarketingShell";
import { LandingProductPreview } from "@/components/LandingProductPreview";
import { authRequired } from "@/lib/config";
import {
  ArrowIcon,
  SearchIcon,
  SparkIcon,
  MailIcon,
  CheckIcon,
  PipelineIcon,
  ShieldIcon,
  GlobeIcon,
} from "@/components/icons";

const FLOW = [
  {
    n: "01",
    title: "Search",
    body: "Niche + city. Real businesses from the open web.",
    icon: SearchIcon,
  },
  {
    n: "02",
    title: "Enrich",
    body: "Contacts, blurbs, and a transparent fit score.",
    icon: SparkIcon,
  },
  {
    n: "03",
    title: "Draft",
    body: "A personalized first email for every lead.",
    icon: MailIcon,
  },
  {
    n: "04",
    title: "Approve",
    body: "You say yes per lead — then it sends.",
    icon: CheckIcon,
  },
];

const CAPABILITIES = [
  {
    title: "Live web search",
    body: "Describe a niche and city. Prospects come back enriched with website, email, and phone when available.",
    icon: SearchIcon,
  },
  {
    title: "Map & pipeline",
    body: "See them on a map. Drag them through New → Contacted → In talk → Closed.",
    icon: PipelineIcon,
  },
  {
    title: "Fit scores you can trust",
    body: "Every score comes with reasons — so you spend time on the right leads, not noise.",
    icon: SparkIcon,
  },
  {
    title: "Approve before send",
    body: "Personalized drafts per lead. Nothing leaves until you approve that outreach.",
    icon: MailIcon,
  },
  {
    title: "Send hygiene on by default",
    body: "Rate limits and a clear from-identity on every outbound. No auto-blast, ever.",
    icon: ShieldIcon,
  },
  {
    title: "Your domain, your voice",
    body: "Send from your brand (Resend, Maileroo, or Gmail). Track delivery as replies come in.",
    icon: GlobeIcon,
  },
];

export default function LandingPage() {
  const studioHref = authRequired() ? "/login" : "/app";
  const studioLabel = authRequired() ? "Sign in" : "Open the studio";

  return (
    <MarketingShell glow="lg" footerTagline="You approve every send.">
      {/* Hero — brand + one promise + CTA + product plane */}
      <section className="mx-auto flex min-h-[calc(100vh-5.5rem)] max-w-7xl items-center px-5 pb-16 pt-6 sm:px-8 sm:pb-20">
        <div className="grid w-full items-center gap-12 lg:grid-cols-2 lg:gap-14 xl:gap-16">
          <div className="max-w-xl">
            <h1 className="animate-float-up font-display text-4xl font-semibold leading-[1.06] tracking-tight text-balance sm:text-5xl xl:text-6xl">
              Find leads.
              <br />
              Draft outreach.
              <br />
              <span className="text-aurora-300">You approve every send.</span>
            </h1>
            <p
              className="animate-float-up mt-6 text-lg leading-relaxed text-mist-300 sm:text-xl"
              style={{ animationDelay: "80ms" }}
            >
              A human-in-the-loop lead studio — search a niche, enrich on a live
              map, then send only what you green-light.
            </p>
            <div
              className="animate-float-up mt-9 flex flex-wrap items-center gap-4"
              style={{ animationDelay: "160ms" }}
            >
              <Link
                href={studioHref}
                className="group inline-flex items-center gap-2 rounded-full bg-aurora-400 px-7 py-3.5 font-medium text-on-accent shadow-lg shadow-aurora-500/25 transition-transform hover:scale-105"
              >
                {studioLabel}
                <ArrowIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                href="/how-it-works"
                className="glass inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium text-mist-100 transition-transform hover:scale-[1.02]"
              >
                See how it works
              </Link>
            </div>
            <p
              className="animate-float-up mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-mist-500"
              style={{ animationDelay: "220ms" }}
            >
              <span className="inline-flex items-center gap-1.5">
                <CheckIcon className="h-3.5 w-3.5 text-aurora-300" />
                No auto-blast
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckIcon className="h-3.5 w-3.5 text-aurora-300" />
                Per-lead approval
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckIcon className="h-3.5 w-3.5 text-aurora-300" />
                Start free
              </span>
            </p>
          </div>

          <div
            className="animate-float-up w-full lg:justify-self-end"
            style={{ animationDelay: "120ms" }}
          >
            <LandingProductPreview />
          </div>
        </div>
      </section>

      {/* Flow */}
      <section className="relative border-t border-white/5 bg-ink-950/50 backdrop-blur">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
          <p className="text-xs uppercase tracking-widest text-aurora-300">The loop</p>
          <h2 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">
            Four steps. One steady hand.
          </h2>
          <p className="mt-3 max-w-2xl text-mist-300">
            Hermes Mail does the busywork — search, enrich, draft. You stay in
            control of every message that leaves.
          </p>

          <ol className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0">
            {FLOW.map((step, i) => (
              <li
                key={step.n}
                className="relative lg:border-l lg:border-white/10 lg:pl-7 lg:first:border-l-0 lg:first:pl-0"
              >
                <div className="flex items-start gap-3">
                  <span className="font-display text-2xl text-mist-500/80">{step.n}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <step.icon className="h-5 w-5 text-aurora-300" />
                      <h3 className="text-lg font-semibold text-mist-100">{step.title}</h3>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-mist-300">{step.body}</p>
                  </div>
                </div>
                {i < FLOW.length - 1 ? (
                  <span
                    className="pointer-events-none absolute right-2 top-4 hidden h-px w-6 bg-gradient-to-r from-aurora-400/50 to-transparent lg:block"
                    aria-hidden
                  />
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Capabilities */}
      <section className="relative border-t border-white/5 py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <h2 className="font-display text-3xl font-semibold sm:text-4xl">
            Everything you need to act
          </h2>
          <p className="mt-3 max-w-2xl text-mist-300">
            From first search to a sent email — map, pipeline, and human approval
            in one place.
          </p>
          <div className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((c) => (
              <div key={c.title} className="border-t border-white/10 pt-5">
                <c.icon className="h-6 w-6 text-aurora-300" />
                <h3 className="mt-4 text-lg font-semibold text-mist-100">{c.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-mist-300">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why human-in-the-loop */}
      <section className="relative border-t border-white/5 bg-ink-950/50 py-20 backdrop-blur">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="text-xs uppercase tracking-widest text-amber-300">Built different</p>
            <h2 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">
              Automation that stops at your judgment
            </h2>
            <p className="mt-4 text-mist-300 leading-relaxed">
              Most tools optimize for volume. Hermes Mail optimizes for sends you
              stand behind — personalized drafts, transparent fit scores, and a
              hard gate before anything hits an inbox.
            </p>
          </div>
          <ul className="space-y-6">
            {[
              {
                title: "Per-lead approval",
                body: "Status must be approved before send. There is no “blast all.”",
              },
              {
                title: "Demo-safe by design",
                body: "Works fully with zero API keys — sample leads and simulated sends.",
              },
              {
                title: "Your sending identity",
                body: "Connect your domain or mailbox. Rate limits stay on by default.",
              },
            ].map((item) => (
              <li key={item.title} className="border-l-2 border-aurora-400/40 pl-5">
                <p className="font-semibold text-mist-100">{item.title}</p>
                <p className="mt-1 text-sm text-mist-300">{item.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA band */}
      <section className="border-t border-white/5 py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="relative overflow-hidden rounded-xl2 border border-white/10 px-8 py-14 sm:px-14 sm:py-16">
            <div className="pointer-events-none absolute inset-0 aurora-glow opacity-55" />
            <div className="relative flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-xl">
                <h2 className="font-display text-3xl font-semibold sm:text-4xl">
                  Ready when you are
                </h2>
                <p className="mt-3 text-mist-300">
                  Start free. Nothing sends without your say-so.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <Link
                  href={studioHref}
                  className="group inline-flex items-center gap-2 rounded-full bg-aurora-400 px-6 py-3 font-medium text-on-accent transition-transform hover:scale-[1.03]"
                >
                  {studioLabel}
                  <ArrowIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link
                  href="/pricing"
                  className="glass inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium text-mist-100 transition-transform hover:scale-[1.02]"
                >
                  See plans
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
