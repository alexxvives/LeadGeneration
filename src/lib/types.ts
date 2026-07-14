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

/** A search + enrichment job kicked off from the search hero. */
export interface Run {
  id: string;
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

export interface CreateRunInput {
  niche: string;
  location?: string | null;
  offerNotes?: string | null;
  /** Search depth/strategy. Defaults to "standard" when omitted. */
  searchStrategy?: SearchStrategy;
}
