import { MarketingShell } from "@/components/MarketingShell";
import { PricingCards } from "./PricingCards";

export const metadata = {
  title: "Pricing — HERMES mail",
  description:
    "Simple, flat pricing for human-in-the-loop lead generation. Start free, upgrade when you grow.",
};

export default function PricingPage() {
  return (
    <MarketingShell footerTagline="Quality outreach, priced for humans.">
      <section className="mx-auto max-w-7xl px-5 pb-20 pt-8 text-center sm:px-8">
        <p className="text-xs uppercase tracking-widest text-aurora-300">Pricing</p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
          Quality outreach, priced for humans
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-mist-300">
          Flat plans, not per-seat. Every tier keeps the guardrails — per-lead
          approval, rate limits, and full demo mode. Start free.
        </p>

        <PricingCards />

        <p className="mt-12 text-sm text-mist-500">
          Prices in USD. Cancel anytime from the billing portal. Annual billing
          saves ~20%.
        </p>
      </section>
    </MarketingShell>
  );
}
