import { SiteNav } from "@/components/SiteNav";
import { BrandMark } from "@/components/BrandMark";
import { authRequired, env, getCapabilities } from "@/lib/config";
import { CheckIcon } from "@/components/icons";

export const metadata = {
  title: "Ethics — HERMES mail",
  description: "Human approval, rate limits, and clear from-identity.",
};

const POINTS: [string, string][] = [
  ["Per-lead approval", "No message is ever auto-blasted. Every send needs an explicit approve."],
  ["Rate limited", "Outbound sends are throttled per minute to protect deliverability."],
  [
    "Natural copy",
    "Emails keep your draft as written — no STOP lines or auto mailing-address footers.",
  ],
  ["Public web only", "Enrichment never touches content behind a login."],
  [
    "Form-fill is a stub",
    "Contact-form automation is demo-only, off by default, and flagged for legal review.",
  ],
  ["You own the data", "Local demo uses a file DB you control; production is workspace-scoped."],
];

export default function EthicsPage() {
  const caps = getCapabilities();
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 aurora-glow opacity-40" />
      <SiteNav
        authRequired={authRequired()}
        credentialsMode={!authRequired()}
        magicLink={caps.smtp || caps.resend}
        turnstileSiteKey={env.turnstileSiteKey() || null}
      />
      <section className="mx-auto max-w-7xl px-5 pb-24 pt-10 sm:px-8">
        <p className="text-xs uppercase tracking-widest text-aurora-300">Principles</p>
        <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">
          Built to keep you compliant
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-mist-300">
          Cold outreach done wrong is spam. Hermes Mail is designed so a human approves every
          message, and the guardrails are on by default.
        </p>
        <div className="glass mt-12 rounded-xl2 p-8 sm:p-12">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {POINTS.map(([title, body]) => (
              <div key={title} className="flex gap-3">
                <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-aurora-400" />
                <div>
                  <p className="font-medium">{title}</p>
                  <p className="mt-1 text-sm text-mist-500">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <footer className="border-t border-white/5 py-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 text-sm text-mist-500 sm:px-8">
          <BrandMark size="sm" />
          <p>You are the human in the loop.</p>
        </div>
      </footer>
    </main>
  );
}
