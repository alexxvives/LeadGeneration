/**
 * Central env access + capability detection.
 *
 * The whole app is designed to run with ZERO keys (demo mode). Each capability
 * is reported independently so the UI can show exactly what is live vs mocked.
 */

export interface Capabilities {
  firecrawl: boolean;
  exa: boolean;
  resend: boolean;
  smtp: boolean;
  canSearchLive: boolean; // firecrawl or exa present
  canSendEmail: boolean; // resend or smtp configured
}

function has(v: string | undefined | null): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

export function getCapabilities(): Capabilities {
  const firecrawl = has(process.env.FIRECRAWL_API_KEY);
  const exa = has(process.env.EXA_API_KEY);
  const resend = has(process.env.RESEND_API_KEY);
  const smtp = has(process.env.SMTP_HOST) && has(process.env.SMTP_USER);
  return {
    firecrawl,
    exa,
    resend,
    smtp,
    canSearchLive: firecrawl || exa,
    canSendEmail: resend || smtp,
  };
}

export const env = {
  firecrawlKey: () => process.env.FIRECRAWL_API_KEY?.trim() ?? "",
  exaKey: () => process.env.EXA_API_KEY?.trim() ?? "",
  resendKey: () => process.env.RESEND_API_KEY?.trim() ?? "",
  fromEmail: () => process.env.OUTREACH_FROM_EMAIL?.trim() || "you@example.com",
  fromName: () => process.env.OUTREACH_FROM_NAME?.trim() || "Lodestar Outreach",
  replyTo: () => process.env.OUTREACH_REPLY_TO?.trim() || "",
  physicalAddress: () =>
    process.env.OUTREACH_PHYSICAL_ADDRESS?.trim() ||
    "123 Placeholder St, Your City, ST 00000",
  // Compliance: how many sends allowed per rolling minute.
  sendRatePerMinute: () => {
    const n = Number(process.env.SEND_RATE_PER_MINUTE);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 5;
  },
  smtp: () => ({
    host: process.env.SMTP_HOST?.trim() ?? "",
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER?.trim() ?? "",
    pass: process.env.SMTP_PASS?.trim() ?? "",
  }),
  // Feature flag: contact-form automation. OFF by default and demo-only.
  contactFormAutomationEnabled: () =>
    process.env.ENABLE_CONTACT_FORM_AUTOMATION === "true",
  maxLeadsPerRun: () => {
    const n = Number(process.env.MAX_LEADS_PER_RUN);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 12;
  },
};
