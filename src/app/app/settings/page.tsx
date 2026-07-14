import { env, getCapabilities } from "@/lib/config";
import { CheckIcon, XIcon } from "@/components/icons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Settings is intentionally read-only status + guidance. Secrets live in .env
// and are never rendered — only whether each capability is configured. This
// keeps keys out of the browser and the file DB.
export default function SettingsPage() {
  const caps = getCapabilities();

  const providers = [
    {
      name: "Firecrawl",
      envVar: "FIRECRAWL_API_KEY",
      on: caps.firecrawl,
      desc: "Live web search + full-page scrape for enrichment.",
    },
    {
      name: "Exa",
      envVar: "EXA_API_KEY",
      on: caps.exa,
      desc: "Alternative live search provider (used if Firecrawl is absent).",
    },
    {
      name: "Resend",
      envVar: "RESEND_API_KEY",
      on: caps.resend,
      desc: "Transactional email sending for approved outreach.",
    },
    {
      name: "SMTP (Nodemailer)",
      envVar: "SMTP_HOST + SMTP_USER",
      on: caps.smtp,
      desc: "Alternative email transport if you don't use Resend.",
    },
  ];

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="font-display text-3xl font-semibold sm:text-4xl">Settings</h1>
      <p className="mt-2 text-mist-300">
        Lodestar reads secrets from environment variables. Set them in a{" "}
        <code className="rounded bg-white/5 px-1.5 py-0.5 text-aurora-300">.env.local</code>{" "}
        file (see{" "}
        <code className="rounded bg-white/5 px-1.5 py-0.5 text-aurora-300">.env.example</code>)
        and restart the dev server. Nothing is stored in the browser.
      </p>

      {/* Providers */}
      <section className="mt-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-mist-500">
          Integrations
        </h2>
        <div className="overflow-hidden rounded-xl2 border border-white/10">
          {providers.map((p, i) => (
            <div
              key={p.name}
              className={`flex items-center gap-4 p-5 ${i > 0 ? "border-t border-white/5" : ""}`}
            >
              <StatusDot on={p.on} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{p.name}</p>
                <p className="text-sm text-mist-500">{p.desc}</p>
              </div>
              <code className="hidden rounded bg-white/5 px-2 py-1 text-xs text-mist-300 sm:block">
                {p.envVar}
              </code>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-mist-500">
          {caps.canSearchLive
            ? "Live search is active."
            : "No search key detected — searches use built-in demo leads."}{" "}
          {caps.canSendEmail
            ? "Email sending is active."
            : "No email provider — sends run in demo mode and are not delivered."}
        </p>
      </section>

      {/* Sending identity */}
      <section className="mt-10">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-mist-500">
          Sending identity &amp; compliance
        </h2>
        <div className="grid gap-3 rounded-xl2 border border-white/10 p-5 sm:grid-cols-2">
          <Detail label="From name" value={env.fromName()} envVar="OUTREACH_FROM_NAME" />
          <Detail label="From email" value={env.fromEmail()} envVar="OUTREACH_FROM_EMAIL" />
          <Detail label="Reply-to" value={env.replyTo() || "(from email)"} envVar="OUTREACH_REPLY_TO" />
          <Detail label="Send rate / min" value={String(env.sendRatePerMinute())} envVar="SEND_RATE_PER_MINUTE" />
          <Detail
            label="Physical address (CAN-SPAM)"
            value={env.physicalAddress()}
            envVar="OUTREACH_PHYSICAL_ADDRESS"
            full
          />
        </div>
        <p className="mt-3 text-sm text-mist-500">
          Every outbound email includes this from-identity, your physical mailing
          address, and an unsubscribe placeholder. Wire the unsubscribe link to a
          real opt-out handler before commercial sending, and review CAN-SPAM /
          GDPR / CASL as applicable.
        </p>
      </section>

      {/* Feature flags */}
      <section className="mt-10">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-mist-500">
          Feature flags
        </h2>
        <div className="rounded-xl2 border border-white/10 p-5">
          <div className="flex items-center gap-4">
            <StatusDot on={env.contactFormAutomationEnabled()} />
            <div className="flex-1">
              <p className="font-medium">Contact-form automation</p>
              <p className="text-sm text-mist-500">
                Demo-only stub. OFF by default. Even when enabled it only simulates a
                submission and never posts to a real site. Requires ToS / legal review
                before any real use.
              </p>
            </div>
            <code className="hidden rounded bg-white/5 px-2 py-1 text-xs text-mist-300 sm:block">
              ENABLE_CONTACT_FORM_AUTOMATION
            </code>
          </div>
        </div>
      </section>
    </main>
  );
}

function StatusDot({ on }: { on: boolean }) {
  return (
    <span
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
        on ? "bg-aurora-400/15 text-aurora-300" : "bg-white/5 text-mist-500"
      }`}
    >
      {on ? <CheckIcon className="h-4 w-4" /> : <XIcon className="h-4 w-4" />}
    </span>
  );
}

function Detail({
  label,
  value,
  envVar,
  full,
}: {
  label: string;
  value: string;
  envVar: string;
  full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <p className="text-xs font-medium text-mist-500">{label}</p>
      <p className="mt-0.5 break-words text-mist-100">{value}</p>
      <code className="text-[11px] text-mist-500">{envVar}</code>
    </div>
  );
}
