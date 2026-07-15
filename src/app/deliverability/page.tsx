import { SiteNav } from "@/components/SiteNav";
import { BrandMark } from "@/components/BrandMark";
import { authRequired, env, getCapabilities } from "@/lib/config";
import { ShieldIcon } from "@/components/icons";

export const metadata = {
  title: "Deliverability — Leadify",
  description: "How to send cold outreach without getting your domain banned.",
};

const DOMAIN_TIPS = [
  {
    title: "Use a dedicated sending domain",
    body: "Never send cold outreach from your main brand domain. Buy a close variant so a reputation hit can't burn your primary domain's email.",
  },
  {
    title: "Set SPF + DKIM + DMARC",
    body: "These three DNS records prove you own the domain and prevent spoofing. Unauthenticated mail goes straight to spam.",
  },
  {
    title: "Warm up gradually",
    body: "Start at 10–20 emails/day and ramp over 2–4 weeks. Inbox providers trust reputation built over time.",
  },
  {
    title: "Verify before you send",
    body: "Bounce rate above ~3% gets you throttled. Run discovered emails through a verification API (Maileroo includes one).",
  },
  {
    title: "Keep sends intentional",
    body: "Leadify enforces per-lead approval and a per-minute rate limit by design — guardrails for your sending reputation.",
  },
  {
    title: "Skip transactional ESPs for cold email",
    body: "Postmark and pure-transactional providers will suspend you. Prefer Maileroo/SES with your own domain.",
  },
];

export default function DeliverabilityPage() {
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
        <div className="mb-3 flex items-center gap-3">
          <ShieldIcon className="h-6 w-6 text-amber-300" />
          <span className="text-xs font-medium uppercase tracking-widest text-amber-300">
            Deliverability guide
          </span>
        </div>
        <h1 className="font-display text-4xl font-semibold sm:text-5xl">
          How to not get your domain banned
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-mist-300">
          Cold outreach is legal when done right. Bans come from poor hygiene — high
          bounce rates, spam complaints, unauthenticated mail.
        </p>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {DOMAIN_TIPS.map((tip, i) => (
            <div
              key={tip.title}
              className="glass rounded-xl2 p-5 transition-colors hover:border-amber-400/20"
            >
              <span className="mb-3 flex h-6 w-6 items-center justify-center rounded-full bg-amber-400/10 text-xs font-bold text-amber-300">
                {i + 1}
              </span>
              <h2 className="font-semibold leading-snug">{tip.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-mist-300">{tip.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 rounded-xl border border-amber-400/15 bg-amber-400/5 px-6 py-4">
          <p className="text-sm text-amber-200/80">
            <span className="font-semibold text-amber-300">Bottom line:</span> Leadify
            handles rate limiting and approval. You handle DNS and domain hygiene.
          </p>
        </div>
      </section>
      <footer className="border-t border-white/5 py-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 text-sm text-mist-500 sm:px-8">
          <BrandMark size="sm" />
          <p>Warm the domain. Then send.</p>
        </div>
      </footer>
    </main>
  );
}
