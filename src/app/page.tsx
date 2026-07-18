import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { BrandMark } from "@/components/BrandMark";
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

const CAPABILITIES = [
  {
    title: "Live web search",
    body: "Describe a niche and city. HERMES mail finds real businesses and enriches contact details.",
    icon: SearchIcon,
  },
  {
    title: "Map & pipeline",
    body: "See prospects on a map and drag them through your funnel — New to Closed.",
    icon: PipelineIcon,
  },
  {
    title: "Fit scores you can trust",
    body: "Transparent reasons for every score, so you spend time on the right leads.",
    icon: SparkIcon,
  },
  {
    title: "Approve before send",
    body: "Personalized drafts per lead. Email only goes out when you say yes.",
    icon: MailIcon,
  },
  {
    title: "Compliance built in",
    body: "Rate limits, clear from-identity, and a physical address on every outbound.",
    icon: ShieldIcon,
  },
  {
    title: "Your domain, your voice",
    body: "Send from your brand. Track replies and bounce status as conversations grow.",
    icon: GlobeIcon,
  },
];

export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 aurora-glow opacity-70" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_transparent_0%,_#060a12_70%)]" />

      <SiteNav authRequired={authRequired()} />

      {/* Hero — copy left, live map preview right */}
      <section className="mx-auto flex min-h-[calc(100vh-5.5rem)] max-w-7xl items-center px-5 pb-16 pt-8 sm:px-8 sm:pb-20">
        <div className="grid w-full items-center gap-10 lg:grid-cols-2 lg:gap-12 xl:gap-16">
          <div className="max-w-xl">
            <p className="animate-float-up font-brand text-3xl font-semibold tracking-[0.06em] text-mist-100 sm:text-4xl">
              HERMES{" "}
              <span className="font-medium tracking-[0.14em] text-aurora-300">mail</span>
            </p>
            <h1 className="animate-float-up mt-4 font-display text-4xl font-semibold leading-[1.08] tracking-tight text-balance sm:text-5xl xl:text-6xl">
              Find, draft,
              <br />
              <span className="text-aurora-300">deliver</span>
            </h1>
            <p className="animate-float-up mt-5 text-lg leading-relaxed text-mist-300 sm:text-xl">
              Search a niche, enrich prospects on a live map, draft outreach, and
              approve every send — a lead studio built for founders who stay in control.
            </p>
            <div className="animate-float-up mt-8 flex flex-wrap items-center gap-4">
              <Link
                href={authRequired() ? "/login" : "/app"}
                className="group inline-flex items-center gap-2 rounded-full bg-aurora-400 px-7 py-3.5 font-medium text-ink-950 shadow-lg shadow-aurora-500/25 transition-transform hover:scale-105"
              >
                {authRequired() ? "Sign in to the studio" : "Open the studio"}
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

          <div className="animate-float-up w-full lg:justify-self-end">
            <LandingProductPreview />
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section className="relative border-t border-white/5 bg-ink-950/80 py-20 backdrop-blur">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <h2 className="font-display text-3xl font-semibold sm:text-4xl">
            Everything you need to act
          </h2>
          <p className="mt-3 max-w-2xl text-mist-300">
            From first search to a sent email — search, map, pipeline, and human approval
            in one place.
          </p>
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
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

      {/* CTA band */}
      <section className="border-t border-white/5 py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="relative overflow-hidden rounded-xl2 border border-white/10 px-8 py-12 sm:px-12">
            <div className="pointer-events-none absolute inset-0 aurora-glow opacity-60" />
            <div className="relative max-w-xl">
              <h2 className="font-display text-3xl font-semibold sm:text-4xl">
                Find leads. Approve. Send.
              </h2>
              <p className="mt-3 text-mist-300">
                Start free. Nothing sends without your say-so.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  href={authRequired() ? "/login" : "/app"}
                  className="group inline-flex items-center gap-2 rounded-full bg-aurora-400 px-6 py-3 font-medium text-ink-950 transition-transform hover:scale-[1.03]"
                >
                  Get started
                  <ArrowIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
                <span className="flex items-center gap-2 text-sm text-mist-500">
                  <CheckIcon className="h-4 w-4 text-aurora-300" />
                  Human approval on every send
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/5 bg-ink-950/80 py-6 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-5 text-sm text-mist-500 sm:flex-row sm:px-8">
          <BrandMark size="sm" />
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/how-it-works" className="hover:text-mist-200">
              How it works
            </Link>
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
