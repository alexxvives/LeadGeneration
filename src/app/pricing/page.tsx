import { SiteNav } from "@/components/SiteNav";
import { authRequired } from "@/lib/config";
import { PricingCards } from "./PricingCards";

export const metadata = {
  title: "Pricing — HERMES mail",
  description:
    "Simple, flat pricing for human-in-the-loop lead generation. Start free, upgrade when you grow.",
};

export default function PricingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 aurora-glow opacity-40" />

      <SiteNav authRequired={authRequired()} />

      <section className="mx-auto max-w-7xl px-5 pb-24 pt-10 text-center sm:px-8">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-widest text-aurora-300">
          Pricing
        </span>
        <h1 className="mt-6 font-display text-4xl font-semibold sm:text-5xl">
          Quality outreach, priced for humans
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-mist-300">
          Flat plans, not per-seat. Every tier keeps the guardrails — per-lead
          approval, rate limits, and full demo mode. Start free.
        </p>

        <PricingCards />

        <p className="mt-10 text-sm text-mist-500">
          Prices in USD. Cancel anytime from the billing portal. Annual billing
          saves ~20%.
        </p>
      </section>
    </main>
  );
}
