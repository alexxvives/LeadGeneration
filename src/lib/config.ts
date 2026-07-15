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
  canSendEmail: boolean; // resend or smtp configured (mailbox connect is workspace-scoped)
  /** Platform Google OAuth client present — Pro → Connect Google enabled. */
  gmailOAuth: boolean;
  /**
   * Whether authentication is ENFORCED. True only when AUTH_SECRET is set
   * (production / Wrangler secret). When false — local dev / demo with zero
   * keys — the studio is open, no login is required, and usage is unmetered
   * (constitution Art. I.2). This is the switch that keeps zero-key demo mode
   * fully usable while still locking down production.
   */
  authRequired: boolean;
  billing: boolean; // Stripe secret key present
  turnstile: boolean; // Turnstile configured (signup bot check)
  /** Zeruh / Maileroo email verification API key present. */
  emailVerify: boolean;
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
    gmailOAuth: has(process.env.GMAIL_OAUTH_CLIENT_ID) && has(process.env.GMAIL_OAUTH_CLIENT_SECRET),
    authRequired: has(process.env.AUTH_SECRET),
    billing: has(process.env.STRIPE_SECRET_KEY),
    turnstile: has(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) && has(process.env.TURNSTILE_SECRET_KEY),
    emailVerify: has(process.env.MAILEROO_VERIFY_API_KEY) || has(process.env.ZERUH_API_KEY),
  };
}

/** True when auth is enforced (production). See Capabilities.authRequired. */
export function authRequired(): boolean {
  return has(process.env.AUTH_SECRET);
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
  /**
   * From-address for Auth.js magic links. Resend rejects unverified domains —
   * placeholder OUTREACH_FROM_EMAIL values must NOT be used here or sign-in
   * mail silently fails. Falls back to Resend's onboarding sender until a real
   * domain is configured.
   */
  authFromEmail: () => {
    const raw = process.env.OUTREACH_FROM_EMAIL?.trim() || "";
    const lower = raw.toLowerCase();
    if (
      !raw ||
      lower === "you@example.com" ||
      lower === "you@yourdomain.com" ||
      lower.endsWith("@example.com")
    ) {
      return "Lodestar <onboarding@resend.dev>";
    }
    const name = process.env.OUTREACH_FROM_NAME?.trim() || "Lodestar";
    return `${name} <${raw}>`;
  },
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
  /**
   * Zeruh (Maileroo Verify) API key. Prefer MAILEROO_VERIFY_API_KEY; ZERUH_API_KEY
   * accepted as alias. See docs/decisions/0009-resend-send-maileroo-verify.md.
   */
  emailVerifyKey: () =>
    process.env.MAILEROO_VERIFY_API_KEY?.trim() ||
    process.env.ZERUH_API_KEY?.trim() ||
    "",
  // Feature flag: contact-form automation. OFF by default and demo-only.
  contactFormAutomationEnabled: () =>
    process.env.ENABLE_CONTACT_FORM_AUTOMATION === "true",
  maxLeadsPerRun: () => {
    const n = Number(process.env.MAX_LEADS_PER_RUN);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 25;
  },

  // ── Auth (Auth.js) ──
  // A dev fallback keeps `npm run dev` working with zero keys; it is NEVER
  // used in production because AUTH_SECRET is always set there (a Wrangler
  // secret). authRequired() distinguishes the two.
  authSecret: () =>
    process.env.AUTH_SECRET?.trim() ||
    "lodestar-dev-insecure-secret-change-me-in-production",
  authResendKey: () => process.env.RESEND_API_KEY?.trim() || "",
  appUrl: () =>
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    "http://localhost:3000",

  /**
   * Gmail send OAuth (ADR 0010) — separate from Auth.js login Google.
   * When unset, Pro → Connect Google stays disabled (Easy Resend still works).
   */
  gmailOAuthClientId: () => process.env.GMAIL_OAUTH_CLIENT_ID?.trim() || "",
  gmailOAuthClientSecret: () => process.env.GMAIL_OAUTH_CLIENT_SECRET?.trim() || "",
  gmailOAuthConfigured: () =>
    !!(
      process.env.GMAIL_OAUTH_CLIENT_ID?.trim() &&
      process.env.GMAIL_OAUTH_CLIENT_SECRET?.trim()
    ),

  // ── Billing (Stripe) ──
  stripeSecretKey: () => process.env.STRIPE_SECRET_KEY?.trim() ?? "",
  stripeWebhookSecret: () => process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "",
  /** Map of planId → Stripe monthly Price ID, read from env (never hard-coded). */
  stripePriceIds: () => ({
    starter: process.env.STRIPE_STARTER_PRICE_ID?.trim() || undefined,
    pro: process.env.STRIPE_PRO_PRICE_ID?.trim() || undefined,
    agency: process.env.STRIPE_AGENCY_PRICE_ID?.trim() || undefined,
  }),

  // ── Turnstile (Cloudflare bot check, production signup only) ──
  turnstileSiteKey: () => process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "",
  turnstileSecretKey: () => process.env.TURNSTILE_SECRET_KEY?.trim() ?? "",

  // ── Smoke test bypass ──
  // When set, requests carrying `x-smoke-key: <value>` skip auth enforcement so
  // the headless smoke test can exercise the API even with auth enabled.
  smokeApiKey: () => process.env.SMOKE_API_KEY?.trim() ?? "",
};
