import { MarketingShell } from "@/components/MarketingShell";
import { CheckIcon } from "@/components/icons";

export const metadata = {
  title: "Ethics — HERMES mail",
  description: "Human approval, rate limits, and clear from-identity.",
};

const POINTS: [string, string][] = [
  [
    "Per-lead approval",
    "No message is ever auto-blasted. Every send needs an explicit approve.",
  ],
  [
    "Rate limited",
    "Outbound sends are throttled per minute to protect deliverability.",
  ],
  [
    "Natural copy",
    "Emails keep your draft as written — no STOP lines or auto mailing-address footers.",
  ],
  ["Public web only", "Enrichment never touches content behind a login."],
  [
    "Form-fill is a stub",
    "Contact-form automation is demo-only, off by default, and flagged for legal review.",
  ],
  [
    "You own the data",
    "Local demo uses a file DB you control; production is workspace-scoped.",
  ],
];

export default function EthicsPage() {
  return (
    <MarketingShell footerTagline="You are the human in the loop.">
      <section className="mx-auto max-w-7xl px-5 pb-24 pt-8 sm:px-8">
        <p className="text-xs uppercase tracking-widest text-aurora-300">Principles</p>
        <h1 className="mt-3 max-w-3xl font-display text-4xl font-semibold tracking-tight sm:text-5xl">
          Built to keep you compliant
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-mist-300">
          Cold outreach done wrong is spam. Hermes Mail is designed so a human
          approves every message, and the guardrails are on by default.
        </p>

        <ul className="mt-14 grid gap-0 border-t border-white/10 sm:grid-cols-2">
          {POINTS.map(([title, body]) => (
            <li
              key={title}
              className="flex gap-3 border-b border-white/10 px-0 py-6 sm:px-6 sm:odd:border-r sm:odd:pl-0 sm:even:pr-0"
            >
              <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-aurora-400" />
              <div>
                <p className="font-medium text-mist-100">{title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-mist-300">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </MarketingShell>
  );
}
