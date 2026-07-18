import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { BrandMark } from "@/components/BrandMark";
import { authRequired } from "@/lib/config";
import { SearchIcon, SparkIcon, MailIcon, CheckIcon, ArrowIcon } from "@/components/icons";

export const metadata = {
  title: "How it works — HERMES mail",
  description: "Search, enrich, draft, approve, send — human-in-the-loop lead generation.",
};

const STEPS = [
  {
    n: "01",
    title: "Search",
    body: "Describe your ideal customer — a niche, a city, an offer. Hermes Mail charts a search across the open web.",
    icon: SearchIcon,
  },
  {
    n: "02",
    title: "Enrich",
    body: "Each prospect is scraped for a website, emails, phones, and an about blurb, then scored for fit — transparently.",
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

export default function HowItWorksPage() {
  const studioHref = authRequired() ? "/login" : "/app";
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 aurora-glow opacity-40" />
      <SiteNav authRequired={authRequired()} />
      <section className="mx-auto max-w-7xl px-5 pb-24 pt-10 sm:px-8">
        <p className="text-xs uppercase tracking-widest text-aurora-300">Product</p>
        <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">
          Four steps, one steady hand
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-mist-300">
          Search → Enrich → Draft → Approve → Send. Hermes Mail does the busywork; you stay
          in control of every message that leaves.
        </p>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.n} className="glass card-hover rounded-xl2 p-6">
              <div className="flex items-center justify-between">
                <s.icon className="h-6 w-6 text-aurora-300" />
                <span className="font-display text-2xl text-mist-500">{s.n}</span>
              </div>
              <h2 className="mt-5 text-lg font-semibold">{s.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-mist-300">{s.body}</p>
            </div>
          ))}
        </div>
        <Link
          href={studioHref}
          className="group mt-12 inline-flex items-center gap-2 rounded-full bg-aurora-400 px-6 py-3 font-medium text-ink-950 transition-transform hover:scale-105"
        >
          {authRequired() ? "Sign in" : "Open the studio"}
          <ArrowIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </section>
      <footer className="border-t border-white/5 py-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 text-sm text-mist-500 sm:px-8">
          <BrandMark size="sm" />
          <p>Navigate responsibly.</p>
        </div>
      </footer>
    </main>
  );
}
