import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { PricingCards } from "./PricingCards";

export const metadata = {
  title: "Pricing — Lodestar",
  description:
    "Simple, flat pricing for human-in-the-loop lead generation. Start free, upgrade when you grow.",
};

export default function PricingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 aurora-glow opacity-40" />

      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/">
          <BrandMark />
        </Link>
        <nav className="flex items-center gap-6 text-sm text-mist-300">
          <Link href="/" className="transition-colors hover:text-mist-100">
            Home
          </Link>
          <Link
            href="/app"
            className="rounded-full bg-aurora-400 px-4 py-2 font-medium text-ink-950 transition-transform hover:scale-105"
          >
            Open the studio
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-24 pt-10 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-widest text-aurora-300">
          Pricing
        </span>
        <h1 className="mt-6 font-display text-4xl font-semibold sm:text-5xl">
          Quality outreach, priced for humans
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-mist-300">
          Flat plans, not per-seat. Every tier keeps the guardrails — per-lead
          approval, compliance-by-default, and full demo mode. Start free.
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
