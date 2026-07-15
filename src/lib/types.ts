// Core domain models for Lodestar.
// These types are storage-agnostic on purpose: the JSON file DB today and a
// future Supabase/Postgres backend both implement the same repository shapes
// (see src/lib/db/index.ts), so swapping persistence should not touch the UI.

export type RunMode = "demo" | "live";

/**
 * How aggressively to search. `standard` runs one naive query (fast, cheap);
 * `smart` and `local` expand the ICP into several query variants that are run
 * and merged for higher recall (more provider calls / credits). All strategies
 * degrade to demo data when no key is present.
 */
export type SearchStrategy = "standard" | "smart" | "local";

export type RunStatus = "pending" | "running" | "complete" | "failed";

export type LeadStatus =
  | "new" // freshly discovered / enriched
  | "queued" // outreach drafted, awaiting human approval
  | "approved" // human approved the draft, ready to send
  | "sent" // email dispatched
  | "rejected" // human rejected the draft
  | "failed"; // send attempt failed

/**
 * CRM relationship stage — separate from the email-workflow status above.
 * The Pipeline Kanban is driven by this field so users can track the real
 * sales relationship regardless of which outreach method was used.
 */
export type CrmStage =
  | "new"            // just found, no contact yet
  | "contacted"      // first outreach sent
  | "in_conversation" // they replied / active dialogue
  | "closed"         // won — became a client
  | "not_interested"; // lost — explicitly declined

/** How a prospect was first reached. Set when crmStage → "contacted". */
export type ContactMethod = "email" | "phone" | "contact_form";

/** A single follow-up reminder on a lead. */
export interface FollowUp {
  id: string;
  date: string;      // ISO date string, e.g. "2026-08-01"
  note: string;
  done: boolean;
}

export type OutreachStatus =
  | "draft"
  | "approved"
  | "rejected"
  | "sent"
  | "failed";

/**
 * Post-send delivery outcome. Manual stub today; Resend/SMTP webhooks can write
 * the same field later without a schema change.
 */
export type DeliveryStatus = "unknown" | "sent" | "bounced" | "replied";

/** Saved search template (niche + location + offer). Client-local in demo. */
export interface SavedIcp {
  id: string;
  name: string;
  niche: string;
  location: string;
  offerNotes: string;
  createdAt: string;
}

/** Billing plan identifiers. Definitions/quotas/prices live in src/lib/plans.ts. */
export type PlanId = "free" | "starter" | "pro" | "agency";

/**
 * A tenant. Every Run/Lead/Outreach belongs to exactly one workspace, which is
 * how multi-tenancy + plan/quota enforcement is scoped (constitution Art. II.2).
 * Local dev / demo mode uses a single implicit workspace with id "local".
 */
export interface Workspace {
  id: string;
  name: string;
  ownerUserId: string | null; // Auth.js user id; null for the local workspace
  planId: PlanId;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  // Usage counters (reset lazily on the first read after `resetsAt`).
  leadsUsedThisMonth: number;
  sendsUsedThisMonth: number;
  resetsAt: string | null; // ISO timestamp of the first of the next month
  createdAt: string;
  updatedAt: string;
  // Per-workspace email sending identity (all nullable → fall back to env vars).
  // Users edit these in Settings so they never touch .env.
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  physicalAddress: string | null;
  // Optional per-workspace Resend API key (user's own account → custom domain).
  // Stored as plain text for now; encrypt at rest before GA.
  resendApiKey: string | null;
}

/** A search + enrichment job kicked off from the search hero. */
export interface Run {
  id: string;
  workspaceId: string; // owning tenant (see Workspace)
  niche: string; // ICP, e.g. "dentist clinics"
  location: string | null; // optional, e.g. "Austin, TX"
  offerNotes: string | null; // optional pitch / offer context used in drafts
  // Sender display name used to sign outreach drafts. Supplied by the client
  // from the browser-only sender profile so the server never reads localStorage
  // (constitution Art. III.5). Falls back to OUTREACH_FROM_NAME when null.
  senderName: string | null;
  status: RunStatus;
  mode: RunMode; // "demo" when keys missing, "live" when a provider ran
  provider: string; // "firecrawl" | "exa" | "demo"
  leadCount: number;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

/** A single discovered + enriched company/prospect. */
export interface Lead {
  id: string;
  workspaceId: string;
  runId: string;
  company: string;
  website: string | null;
  emails: string[]; // contact hints discovered during enrichment
  phones: string[];
  contactName: string | null;
  location: string | null;
  aboutBlurb: string | null; // short summary used for personalization
  tags: string[];
  fitScore: number; // 0-100 heuristic fit score
  fitReasons: string[]; // human-readable "why this scored" notes
  sourceUrl: string; // where we found them (audit trail)
  status: LeadStatus;
  // CRM fields — user-managed relationship tracking
  crmStage: CrmStage;
  contactMethod: ContactMethod | null; // set when first contacted
  notes: string | null;              // freeform notes per lead
  followUps: FollowUp[];             // scheduled follow-up reminders
  createdAt: string;
}

/** A personalized outreach email attached to a lead. */
export interface Outreach {
  id: string;
  workspaceId: string;
  leadId: string;
  runId: string;
  toEmail: string | null;
  subject: string;
  body: string;
  status: OutreachStatus;
  /** Post-send outcome (stub until provider webhooks). */
  deliveryStatus: DeliveryStatus;
  sentAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Convenience view model returned to the client. */
export interface LeadWithOutreach extends Lead {
  outreach: Outreach | null;
}

/**
 * Non-secret snapshot of a workspace's plan + usage, safe to send to the client
 * for rendering usage bars and upgrade prompts. Never includes Stripe IDs.
 */
export interface WorkspaceSummary {
  workspaceId: string;
  planId: PlanId;
  metered: boolean; // false in demo/local mode (unmetered)
  leadsUsed: number;
  leadsLimit: number;
  sendsUsed: number;
  sendsLimit: number;
  resetsAt: string | null;
}

export interface CreateRunInput {
  niche: string;
  location?: string | null;
  offerNotes?: string | null;
  /**
   * Sender display name for signing drafts, passed from the browser-only sender
   * profile (never read from localStorage on the server). Optional; drafts fall
   * back to OUTREACH_FROM_NAME when absent.
   */
  senderName?: string | null;
  /** Search depth/strategy. Defaults to "standard" when omitted. */
  searchStrategy?: SearchStrategy;
  /**
   * How many leads to return for this run (capped by plan + remaining credits +
   * MAX_LEADS_PER_RUN). Optional — defaults to a sensible mid value.
   */
  maxLeads?: number;
  /**
   * When true, load canned demo leads instead of calling search providers.
   * Demo data is NEVER used as a silent fallback — only via this explicit flag
   * (constitution Art. I.2: zero-key mode still works via the Load demo button).
   */
  demo?: boolean;
}
