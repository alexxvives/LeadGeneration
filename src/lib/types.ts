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

export type OutreachStatus =
  | "draft"
  | "approved"
  | "rejected"
  | "sent"
  | "failed";

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
}

/** A search + enrichment job kicked off from the search hero. */
export interface Run {
  id: string;
  workspaceId: string; // owning tenant (see Workspace)
  niche: string; // ICP, e.g. "dentist clinics"
  location: string | null; // optional, e.g. "Austin, TX"
  offerNotes: string | null; // optional pitch / offer context used in drafts
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
  /** Search depth/strategy. Defaults to "standard" when omitted. */
  searchStrategy?: SearchStrategy;
}
