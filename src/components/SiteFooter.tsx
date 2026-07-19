import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

const PRODUCT = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/deliverability", label: "Deliverability" },
];

const COMPANY = [
  { href: "/ethics", label: "Ethics" },
  { href: "/?signin=1", label: "Sign in" },
];

/**
 * Shared marketing footer — brand + link columns + short tagline.
 */
export function SiteFooter({
  tagline = "You approve every send.",
}: {
  tagline?: string;
}) {
  return (
    <footer className="border-t border-white/5 bg-ink-950/90">
      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          <div className="sm:col-span-2 lg:col-span-2">
            <Link href="/" className="inline-block transition-opacity hover:opacity-80">
              <BrandMark />
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-mist-300">
              Human-in-the-loop lead studio — search a niche, enrich prospects,
              draft outreach, then send only what you green-light.
            </p>
            <p className="mt-5 font-display text-lg text-aurora-300/90">{tagline}</p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-mist-500">
              Product
            </p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {PRODUCT.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-mist-300 transition-colors hover:text-mist-100"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-mist-500">
              Company
            </p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {COMPANY.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-mist-300 transition-colors hover:text-mist-100"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-white/5 pt-6 text-xs text-mist-500 sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} HERMES mail</p>
          <p className="text-mist-500/80">Navigate responsibly.</p>
        </div>
      </div>
    </footer>
  );
}
