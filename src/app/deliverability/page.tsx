import { MarketingShell } from "@/components/MarketingShell";
import { ShieldIcon } from "@/components/icons";

export const metadata = {
  title: "Deliverability — HERMES mail",
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
    body: "Hermes Mail enforces per-lead approval and a per-minute rate limit by design — guardrails for your sending reputation.",
  },
  {
    title: "Skip transactional ESPs for cold email",
    body: "Postmark and pure-transactional providers will suspend you. Prefer Maileroo/SES with your own domain.",
  },
];

export default function DeliverabilityPage() {
  return (
    <MarketingShell footerTagline="Warm the domain. Then send.">
      <section className="mx-auto max-w-7xl px-5 pb-24 pt-8 sm:px-8">
        <div className="mb-3 flex items-center gap-3">
          <ShieldIcon className="h-5 w-5 text-amber-300" />
          <span className="text-xs font-medium uppercase tracking-widest text-amber-300">
            Deliverability guide
          </span>
        </div>
        <h1 className="max-w-3xl font-display text-4xl font-semibold tracking-tight sm:text-5xl">
          How to not get your domain banned
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-mist-300">
          Cold outreach is legal when done right. Bans come from poor hygiene —
          high bounce rates, spam complaints, unauthenticated mail.
        </p>

        <ol className="mt-14 space-y-0 border-t border-white/10">
          {DOMAIN_TIPS.map((tip, i) => (
            <li
              key={tip.title}
              className="grid gap-3 border-b border-white/10 py-7 sm:grid-cols-[3rem_1fr] sm:gap-6"
            >
              <span className="font-display text-2xl text-amber-300/70">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h2 className="text-lg font-semibold text-mist-100">{tip.title}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mist-300">
                  {tip.body}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-12 rounded-xl border border-amber-400/15 bg-amber-400/5 px-6 py-5">
          <p className="text-sm leading-relaxed text-amber-200/80">
            <span className="font-semibold text-amber-300">Bottom line:</span>{" "}
            Hermes Mail handles rate limiting and approval. You handle DNS and
            domain hygiene.
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}
