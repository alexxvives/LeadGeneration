import Link from "next/link";
import { MarketingShell } from "@/components/MarketingShell";
import { SignInCta } from "@/components/MarketingSignIn";
import { authRequired } from "@/lib/config";
import {
  SearchIcon,
  SparkIcon,
  MailIcon,
  CheckIcon,
  ArrowIcon,
} from "@/components/icons";

export const metadata = {
  title: "How it works — HERMES mail",
  description:
    "Search, enrich, draft, approve, send — human-in-the-loop lead generation.",
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
  const required = authRequired();
  return (
    <MarketingShell footerTagline="Four steps. One steady hand.">
      <section className="mx-auto max-w-3xl px-5 pb-24 pt-8 sm:max-w-4xl sm:px-8 lg:max-w-5xl">
        <p className="text-xs font-medium uppercase tracking-widest text-aurora-300">
          Product
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-mist-100 sm:text-5xl">
          Four steps, one steady hand
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-mist-200 sm:text-xl">
          Search → Enrich → Draft → Approve → Send. Hermes Mail does the
          busywork; you stay in control of every message that leaves.
        </p>

        <ol className="mt-14 space-y-0 border-t border-white/15">
          {STEPS.map((s, i) => (
            <li
              key={s.n}
              className="grid gap-4 border-b border-white/15 py-9 sm:grid-cols-[5rem_1fr] sm:gap-8 sm:py-11"
            >
              <span className="font-display text-3xl font-semibold text-aurora-300/90">
                {s.n}
              </span>
              <div>
                <div className="flex items-center gap-3">
                  <s.icon className="h-5 w-5 shrink-0 text-aurora-300" />
                  <h2 className="text-xl font-semibold text-mist-100 sm:text-2xl">
                    {s.title}
                  </h2>
                </div>
                <p className="mt-3 max-w-2xl text-base leading-relaxed text-mist-200">
                  {s.body}
                </p>
                {i < STEPS.length - 1 ? (
                  <span className="mt-6 hidden text-xs uppercase tracking-widest text-mist-500 sm:inline-block">
                    Then →
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-14 flex flex-wrap items-center gap-4">
          <SignInCta
            authRequired={required}
            className="group inline-flex items-center gap-2 rounded-full bg-aurora-400 px-6 py-3 font-medium text-on-accent transition-transform hover:scale-105"
          >
            {required ? "Sign in" : "Open the studio"}
            <ArrowIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </SignInCta>
          <Link
            href="/pricing"
            className="glass inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium text-mist-100 transition-transform hover:scale-[1.02]"
          >
            See plans
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
