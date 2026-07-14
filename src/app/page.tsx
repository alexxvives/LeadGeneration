import Image from "next/image";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { BrandMark } from "@/components/BrandMark";
import { authRequired, env, getCapabilities } from "@/lib/config";
import {
  ArrowIcon,
  SearchIcon,
  SparkIcon,
  MailIcon,
  CheckIcon,
} from "@/components/icons";

const STEPS = [
  {
    title: "Search",
    body: "Describe a niche and city. Lodestar charts the open web for prospects.",
    icon: SearchIcon,
  },
  {
    title: "Enrich",
    body: "Websites, emails, phones, and a transparent fit score for each lead.",
    icon: SparkIcon,
  },
  {
    title: "Draft & approve",
    body: "A personalized email per lead — nothing sends until you say yes.",
    icon: MailIcon,
  },
];

const LINKS = [
  {
    href: "/how-it-works",
    title: "How it works",
    body: "The full search → enrich → draft → approve → send loop.",
  },
  {
    href: "/ethics",
    title: "Ethics",
    body: "Public web only, human approval, compliance on by default.",
  },
  {
    href: "/deliverability",
    title: "Deliverability",
    body: "Domains, SMTP, and keeping cold email out of spam.",
  },
];

export default function LandingPage() {
  const caps = getCapabilities();
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <Image
          src="/images/hero-aurora.jpg"
          alt="Aurora over a still lake at night"
          fill
          priority
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-ink-950/55 via-ink-950/75 to-ink-950" />
        <div className="absolute inset-0 aurora-glow opacity-50" />
      </div>

      <SiteNav
        authRequired={authRequired()}
        credentialsMode={!authRequired()}
        magicLink={caps.smtp || caps.resend}
        turnstileSiteKey={env.turnstileSiteKey() || null}
      />

      {/* Full-viewport hero — brand first, one CTA group */}
      <section className="mx-auto flex min-h-[calc(100vh-5.5rem)] max-w-7xl flex-col justify-center px-5 pb-16 pt-6 sm:px-8 sm:pb-20">
        <div className="max-w-3xl">
          <span className="animate-float-up inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-widest text-aurora-300">
            <span className="h-1.5 w-1.5 rounded-full bg-aurora-400 pulse-ring" />
            Human-in-the-loop lead generation
          </span>
          <h1 className="animate-float-up mt-5 font-display text-5xl font-semibold leading-[1.05] tracking-tight text-balance sm:text-7xl">
            Navigate to your
            <br />
            <span className="text-aurora-300">next customer</span>
          </h1>
          <p className="animate-float-up mt-5 max-w-xl text-lg leading-relaxed text-mist-300 sm:text-xl">
            Lodestar turns a plain-English niche into enriched, fit-scored prospects
            with outreach drafted for each one. You approve every send.
          </p>
          <div className="animate-float-up mt-8 flex flex-wrap items-center gap-4">
            <Link
              href="/app"
              className="group inline-flex items-center gap-2 rounded-full bg-aurora-400 px-7 py-3.5 font-medium text-ink-950 shadow-lg shadow-aurora-500/20 transition-transform hover:scale-105"
            >
              Open the studio
              <ArrowIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/how-it-works"
              className="glass inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium text-mist-100 transition-transform hover:scale-[1.02]"
            >
              How it works
            </Link>
          </div>
          <p className="animate-float-up mt-5 text-sm text-mist-500">
            Zero keys required — load demo data in the studio, or add Firecrawl for live search.
          </p>
        </div>
      </section>

      {/* Below-fold: short how-it-works teaser (full page at /how-it-works) */}
      <section className="relative border-t border-white/5 bg-ink-950/90 py-20 backdrop-blur">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <h2 className="font-display text-3xl font-semibold sm:text-4xl">How it works</h2>
          <p className="mt-3 max-w-2xl text-mist-300">
            Four steps. One steady hand. Lodestar does the busywork; you stay in control.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.title}>
                <s.icon className="h-6 w-6 text-aurora-300" />
                <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-mist-300">{s.body}</p>
              </div>
            ))}
          </div>
          <Link
            href="/how-it-works"
            className="group mt-10 inline-flex items-center gap-2 text-sm font-medium text-aurora-300 hover:text-aurora-200"
          >
            Read the full walkthrough
            <ArrowIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </section>

      <section className="border-t border-white/5 bg-ink-950 py-16">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <h2 className="font-display text-2xl font-semibold sm:text-3xl">Go deeper</h2>
          <p className="mt-2 max-w-xl text-mist-300">
            Standalone pages for the product story, ethics, and inbox placement.
          </p>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="group block border-t border-white/10 pt-5 transition-colors hover:border-aurora-400/40"
              >
                <h3 className="font-semibold text-mist-100 group-hover:text-aurora-300">
                  {l.title}
                </h3>
                <p className="mt-2 text-sm text-mist-300">{l.body}</p>
              </Link>
            ))}
          </div>
          <div className="mt-12 flex flex-wrap items-center gap-4">
            <CheckIcon className="h-5 w-5 text-aurora-300" />
            <p className="text-sm text-mist-300">
              Human approval on every send · Works with zero API keys · Compliance footer built in
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/5 bg-ink-950/80 py-6 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-5 text-sm text-mist-500 sm:flex-row sm:px-8">
          <BrandMark size="sm" />
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/ethics" className="hover:text-mist-200">
              Ethics
            </Link>
            <Link href="/deliverability" className="hover:text-mist-200">
              Deliverability
            </Link>
            <Link href="/pricing" className="hover:text-mist-200">
              Pricing
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
