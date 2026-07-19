// Core domain models for HERMES mail.
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
  | "new" // freshly discovered — CRM New = needs human review
  | "queued" // outreach drafted (batch-approve helper); not shown as "In review"
  | "approved" // human approved the draft, ready to send
  | "sent" // email dispatched
  | "rejected" // verify cleanup / undeliverable (no UI "reject draft" action)
  | "failed"; // transport error after a send attempt

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
  | "not_interested"; // lost — prospect declined

const CRM_STAGES: readonly CrmStage[] = [
  "new",
  "contacted",
  "in_conversation",
  "closed",
  "not_interested",
] as const;

/** Coerce persisted/legacy stage strings (e.g. old `discarded`) into a valid CrmStage. */
export function normalizeCrmStage(raw: unknown): CrmStage {
  if (raw === "discarded") return "not_interested";
  if (typeof raw === "string" && (CRM_STAGES as readonly string[]).includes(raw)) {
    return raw as CrmStage;
  }
  return "new";
}

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
  /** Atomic send claim — in flight; heals back to approved if stuck. */
  | "sending"
  | "rejected" // verify undeliverable cleanup (not a human "reject draft")
  | "sent"
  | "failed"; // transport error — retry via Send (re-approves)

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

/** Easy-path transactional sender (Settings). Pro = mailbox OAuth. */
export type EasyEmailProvider = "resend" | "maileroo";

/** Spreadsheet / CSV row after client-side column mapping (import API). */
export interface ImportLeadRow {
  company: string;
  website?: string | null;
  emails?: string[];
  phones?: string[];
  contactName?: string | null;
  location?: string | null;
  /** Venue / business category (Pharmacy, SPA, …). */
  companyType?: string | null;
}

/**
 * A tenant. Every Run/Lead/Outreach belongs to exactly one workspace, which is
 * how multi-tenancy + plan/quota enforcement is scoped (constitution Art. II.2).
 * Local dev / demo mode uses a single implicit workspace with id "local".
 */
/** Pro mailbox connect (ADR 0010) — Google first; Microsoft later. */
export type MailboxProvider = "google" | "microsoft";
export type MailboxAgeBand = "new" | "weeks" | "months" | "established";
export type MailboxVolumeBand = "none" | "light" | "regular";

/**
 * Connected send mailbox. Refresh/access token ciphertext never leaves the
 * server (not included in client-safe snapshots).
 */
export interface ConnectedMailbox {
  provider: MailboxProvider;
  email: string;
  /** AES-GCM ciphertext of the OAuth refresh token. */
  refreshTokenEnc: string;
  accessTokenEnc: string | null;
  accessTokenExpiresAt: string | null;
  ageBand: MailboxAgeBand | null;
  volumeBand: MailboxVolumeBand | null;
  connectedAt: string;
}

/** Safe subset for Settings / board UI — no tokens. */
export interface MailboxPublicStatus {
  connected: boolean;
  provider: MailboxProvider | null;
  email: string | null;
  ageBand: MailboxAgeBand | null;
  volumeBand: MailboxVolumeBand | null;
  connectedAt: string | null;
  /** Platform Google OAuth client configured (Connect button enabled). */
  googleReady: boolean;
  /** Microsoft not shipped yet. */
  microsoftReady: boolean;
}

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
  /** Daily verify counter (plan verifiesPerDay); reset after `verifiesResetsAt`. */
  verifiesUsedToday: number;
  /** ISO timestamp of next UTC midnight when daily verifies reset. */
  verifiesResetsAt: string | null;
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
  /** Auto-registered Resend webhook id (delivery events → Hermes). */
  resendWebhookId: string | null;
  /** Svix signing secret for that webhook (never sent to the client). */
  resendWebhookSecret: string | null;
  /** Optional BYO Maileroo sending key (Easy peer to Resend — ADR 0011). */
  mailerooApiKey: string | null;
  /** Which Easy transactional provider the workspace prefers. */
  easyEmailProvider: EasyEmailProvider;
  /**
   * Which send path Settings last chose. When unset: Pro if a mailbox is
   * connected, otherwise Easy. Google send only runs when this is `"pro"`.
   */
  preferredSendPath: "easy" | "pro" | null;
  /**
   * When true (default) and the server has a Zeruh key, verify recipient
   * emails at send. Off skips the check (saves credits).
   */
  emailVerifyEnabled: boolean;
  /** Pro path: one connected mailbox (multi-inbox deferred — ADR 0010). */
  connectedMailbox: ConnectedMailbox | null;
}
/**
 * Named collection of leads within a workspace (ADR 0014).
 * Every workspace has exactly one `isDefault` board; new leads land there
 * unless the user picks another board at search/import time.
 */
export interface Board {
  id: string;
  workspaceId: string;
  name: string;
  /** Exactly one default board per workspace — catch-all for unassigned leads. */
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Access role for a board (owner workspace or invited member). */
export type BoardMemberRole = "owner" | "editor";

/** Soft presence lock — blocks edits while another user holds the board. */
export interface BoardLock {
  boardId: string;
  userId: string;
  userName: string | null;
  lockedAt: string;
  expiresAt: string;
}

export interface BoardInvite {
  id: string;
  boardId: string;
  boardName: string;
  email: string;
  role: BoardMemberRole;
  invitedByUserId: string;
  status: "pending" | "accepted" | "revoked";
  createdAt: string;
  expiresAt: string;
}

export interface BoardMember {
  boardId: string;
  userId: string;
  email: string | null;
  role: BoardMemberRole;
  createdAt: string;
}

/** Client-safe board row with aggregate counts for sidebar / Boards view. */
export interface BoardSummary extends Board {
  leadCount: number;
  contactedCount: number;
  sentCount: number;
  closedCount: number;
  /** How the current user accesses this board. */
  access: BoardMemberRole;
  /** True when board.workspaceId !== caller's workspace. */
  shared: boolean;
  /** Active soft lock held by someone else (if any). */
  lock: BoardLock | null;
}

/** Aggregate workspace stats for the Dashboard view. */
export interface DashboardStats {
  totalLeads: number;
  byCrmStage: Record<CrmStage, number>;
  byStatus: Record<string, number>;
  sentCount: number;
  draftedCount: number;
  boards: BoardSummary[];
  recentRuns: Run[];
  avgFitScore: number;
  /** When set, stats are scoped to this board; null = all boards. */
  activeBoardId: string | null;
}

/** Platform-wide admin overview (admin email only). */
export interface AdminPlatformStats {
  workspaceCount: number;
  userCount: number;
  totalLeads: number;
  totalSendsLifetime: number;
  totalRuns: number;
  leadsUsedThisMonth: number;
  sendsUsedThisMonth: number;
  verifiesUsedToday: number;
  byPlan: Record<PlanId, number>;
  paidWorkspaceCount: number;
  withStripeCustomer: number;
  withMailbox: number;
  withEasySendKey: number;
  recentSignups: AdminUserRow[];
}

/** One tenant row for the admin Users table. */
export interface AdminUserRow {
  workspaceId: string;
  workspaceName: string;
  ownerUserId: string | null;
  ownerEmail: string | null;
  ownerName: string | null;
  planId: PlanId;
  leadsUsedThisMonth: number;
  leadsLimit: number;
  sendsUsedThisMonth: number;
  sendsLimit: number;
  verifiesUsedToday: number;
  verifiesLimit: number;
  leadCount: number;
  sentCount: number;
  runCount: number;
  stripeCustomerId: string | null;
  hasMailbox: boolean;
  hasEasySendKey: boolean;
  emailVerifyEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A search + enrichment job kicked off from the search hero. */
export interface Run {
  id: string;
  workspaceId: string; // owning tenant (see Workspace)
  /** Board that receives leads from this run. */
  boardId: string;
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
  /** Owning board (defaults to the workspace default board). */
  boardId: string;
  company: string;
  website: string | null;
  emails: string[]; // contact hints discovered during enrichment
  phones: string[];
  contactName: string | null;
  location: string | null; // full scraped address when available (street + city)
  aboutBlurb: string | null; // short summary used for personalization
  /** Business category (Pharmacy, Aesthetic Clinic, …) — Excel or suggested. */
  companyType: string | null;
  tags: string[];
  fitScore: number; // 0-100 heuristic fit score
  fitReasons: string[]; // human-readable "why this scored" notes
  sourceUrl: string; // where we found them (audit trail; not shown in fit UI)
  status: LeadStatus;
  // CRM fields — user-managed relationship tracking
  crmStage: CrmStage;
  contactMethod: ContactMethod | null; // set when first contacted
  notes: string | null; // legacy freeform; prefer dated followUps journal
  followUps: FollowUp[]; // dated notes / follow-up journal entries
  /** User-defined table column values (column id → string). */
  customFields: Record<string, string>;
  createdAt: string;
}

/** Custom lead-table column (defs live in the browser; values on Lead.customFields). */
export type LeadColumnType = "text" | "number" | "select";

export interface LeadColumnDef {
  id: string;
  name: string;
  type: LeadColumnType;
  /** Options when type === "select". */
  options?: string[];
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
  /** Daily email verifies used (plan-tiered). */
  verifiesUsed: number;
  /** Daily verify limit for the current plan. */
  verifiesLimit: number;
  /** When daily verifies reset (next UTC midnight). */
  verifiesResetsAt: string | null;
  /** Workspace wants email verify at send (requires server key). */
  emailVerifyEnabled: boolean;
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
  /** Optional subject template from the selected outreach profile. */
  subjectTemplate?: string | null;
  /**
   * When false, skip auto-drafting (search without an outreach profile).
   * Leads land in Review without a draft. Default true.
   */
  autoDraft?: boolean;
  /** @deprecated Prefer aiPersonalize. Pitch-only drafts when true. */
  staticBody?: boolean;
  /** When true, AI rewrites each draft so wording varies per lead. */
  aiPersonalize?: boolean;
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
  /** Board to assign new leads to. Defaults to the workspace default board. */
  boardId?: string | null;
}
