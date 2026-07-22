import type {
  Board,
  BoardInvite,
  BoardLock,
  BoardMember,
  BoardMemberRole,
  Lead,
  Outreach,
  Run,
  Workspace,
  PlanId,
  FollowUp,
  DeliveryStatus,
} from "@/lib/types";
import { normalizeCrmStage } from "@/lib/types";
import {
  parseContactMethods,
  serializeContactMethods,
} from "@/lib/contact-methods";
import type { LeadListFilter, LeadRepository } from "./index";
import { LOCAL_WORKSPACE_ID } from "./index";

/**
 * Minimal D1 type stubs — keeps this file type-safe without adding
 * @cloudflare/workers-types globally (which conflicts with Next.js DOM libs).
 * The real bindings are injected by the Workers runtime at deploy time.
 */
interface D1Result<T> {
  results: T[];
}
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<D1Result<T>>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

/**
 * Cloudflare D1 (SQLite) implementation of LeadRepository.
 *
 * Selected by getDb() when a D1Database binding is passed in — which happens
 * in the Workers runtime via getRequestContext().env.DB (OpenNext). In local
 * dev / demo mode, getDb() receives no binding and falls back to JsonStore.
 *
 * SQLite differences from the Postgres/Supabase store:
 *  - Arrays (emails, phones, tags, fit_reasons) serialised as JSON strings in
 *    TEXT columns. The arr() / str() helpers handle this.
 *  - Timestamps stored as ISO text; no conversion needed.
 *  - UPDATE does not return the mutated row — we do a SELECT after each write.
 *  - Batch inserts use db.batch() for a single round-trip.
 *  - UPSERT uses SQLite's ON CONFLICT DO UPDATE syntax.
 *
 * Workspace isolation: the store is constructed with a `workspaceId` and every
 * runs/leads/outreach query is filtered by `workspace_id = ?`. Writes stamp the
 * same id. Workspace + auth tables are global (not scoped). SQLite has no RLS;
 * this service-layer scoping is the isolation mechanism (ADR 0006).
 */

type WorkspaceRow = {
  id: string;
  name: string;
  owner_user_id: string | null;
  plan_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  leads_used_this_month: number | null;
  sends_used_this_month: number | null;
  resets_at: string | null;
  created_at: string;
  updated_at: string;
  // Email settings (migration 0006)
  from_name: string | null;
  from_email: string | null;
  reply_to: string | null;
  physical_address: string | null;
  resend_api_key: string | null;
  resend_webhook_id: string | null;
  resend_webhook_secret: string | null;
  maileroo_api_key: string | null;
  easy_email_provider: string | null;
  preferred_send_path: string | null;
  // Connected mailbox JSON (migration 0008)
  connected_mailbox_json: string | null;
  /** Migration 0014 — 0/1; null treated as enabled. */
  email_verify_enabled: number | null;
  /** Migration 0025 — 0/1; null treated as enabled. */
  find_leads_enabled: number | null;
  /** Migration 0015 — daily verify counters. */
  verifies_used_today: number | null;
  verifies_resets_at: string | null;
  /** Migration 0024 — JSON ProfileStore. */
  outreach_profiles_json: string | null;
};

type BoardRow = {
  id: string;
  workspace_id: string;
  name: string;
  is_default: number;
  created_at: string;
  updated_at: string;
};

type RunRow = {
  id: string;
  workspace_id: string;
  board_id: string | null;
  niche: string;
  location: string | null;
  offer_notes: string | null;
  sender_name: string | null;
  status: Run["status"];
  mode: Run["mode"];
  provider: string;
  lead_count: number;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

type LeadRow = {
  id: string;
  workspace_id: string;
  run_id: string;
  board_id: string | null;
  company: string;
  website: string | null;
  emails: string; // JSON-encoded string[]
  phones: string;
  contact_name: string | null;
  location: string | null;
  about_blurb: string | null;
  company_type: string | null;
  tags: string;
  fit_score: number;
  fit_reasons: string;
  source_url: string;
  status: Lead["status"];
  crm_stage: string | null;
  contact_method: string | null;
  notes: string | null;
  follow_ups: string | null; // JSON-encoded FollowUp[]
  custom_fields: string | null; // JSON-encoded Record<string, string>
  created_at: string;
};

type OutreachRow = {
  id: string;
  workspace_id: string;
  lead_id: string;
  run_id: string;
  to_email: string | null;
  subject: string;
  body: string;
  status: Outreach["status"];
  delivery_status: string | null;
  sent_at: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

const str = (arr: string[]): string => JSON.stringify(arr);
const arr = (s: string | null | undefined): string[] => {
  try {
    return JSON.parse(s ?? "[]");
  } catch {
    return [];
  }
};

function parseConnectedMailbox(
  raw: string | null | undefined,
): Workspace["connectedMailbox"] {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Workspace["connectedMailbox"];
  } catch {
    return null;
  }
}

function rowToWorkspace(r: WorkspaceRow): Workspace {
  return {
    id: r.id,
    name: r.name,
    ownerUserId: r.owner_user_id,
    planId: (r.plan_id as PlanId) ?? "free",
    stripeCustomerId: r.stripe_customer_id,
    stripeSubscriptionId: r.stripe_subscription_id,
    stripePriceId: r.stripe_price_id,
    leadsUsedThisMonth: r.leads_used_this_month ?? 0,
    sendsUsedThisMonth: r.sends_used_this_month ?? 0,
    resetsAt: r.resets_at,
    verifiesUsedToday: r.verifies_used_today ?? 0,
    verifiesResetsAt: r.verifies_resets_at ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    fromName: r.from_name ?? null,
    fromEmail: r.from_email ?? null,
    replyTo: r.reply_to ?? null,
    physicalAddress: r.physical_address ?? null,
    resendApiKey: r.resend_api_key ?? null,
    resendWebhookId: r.resend_webhook_id ?? null,
    resendWebhookSecret: r.resend_webhook_secret ?? null,
    mailerooApiKey: r.maileroo_api_key ?? null,
    easyEmailProvider: r.easy_email_provider === "maileroo" ? "maileroo" : "resend",
    preferredSendPath:
      r.preferred_send_path === "pro" || r.preferred_send_path === "easy"
        ? r.preferred_send_path
        : null,
    emailVerifyEnabled: r.email_verify_enabled === 0 ? false : true,
    findLeadsEnabled: r.find_leads_enabled === 0 ? false : true,
    connectedMailbox: parseConnectedMailbox(r.connected_mailbox_json),
    outreachProfilesJson: r.outreach_profiles_json ?? null,
  };
}

function rowToBoard(r: BoardRow): Board {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    isDefault: !!r.is_default,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToRun(r: RunRow): Run {
  return {
    id: r.id,
    workspaceId: r.workspace_id ?? LOCAL_WORKSPACE_ID,
    boardId: r.board_id ?? "",
    niche: r.niche,
    location: r.location,
    offerNotes: r.offer_notes,
    senderName: r.sender_name ?? null,
    status: r.status,
    mode: r.mode,
    provider: r.provider,
    leadCount: r.lead_count,
    error: r.error,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  };
}

const parseFollowUps = (s: string | null | undefined): FollowUp[] => {
  try { return JSON.parse(s ?? "[]"); } catch { return []; }
};

const parseCustomFields = (s: string | null | undefined): Record<string, string> => {
  try {
    const v = JSON.parse(s ?? "{}") as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === "string") out[k] = val;
      else if (val != null) out[k] = String(val);
    }
    return out;
  } catch {
    return {};
  }
};

function rowToLead(r: LeadRow): Lead {
  return {
    id: r.id,
    workspaceId: r.workspace_id ?? LOCAL_WORKSPACE_ID,
    runId: r.run_id,
    boardId: r.board_id ?? "",
    company: r.company,
    website: r.website,
    emails: arr(r.emails),
    phones: arr(r.phones),
    contactName: r.contact_name,
    location: r.location,
    aboutBlurb: r.about_blurb,
    companyType: r.company_type ?? null,
    tags: arr(r.tags),
    fitScore: r.fit_score,
    fitReasons: arr(r.fit_reasons),
    sourceUrl: r.source_url,
    status: r.status,
    crmStage: normalizeCrmStage(r.crm_stage),
    contactMethods: parseContactMethods(r.contact_method),
    notes: r.notes ?? null,
    followUps: parseFollowUps(r.follow_ups),
    customFields: parseCustomFields(r.custom_fields),
    createdAt: r.created_at,
  };
}

function rowToOutreach(r: OutreachRow): Outreach {
  return {
    id: r.id,
    workspaceId: r.workspace_id ?? LOCAL_WORKSPACE_ID,
    leadId: r.lead_id,
    runId: r.run_id,
    toEmail: r.to_email,
    subject: r.subject,
    body: r.body,
    status: r.status,
    deliveryStatus: (r.delivery_status as DeliveryStatus) ?? "unknown",
    sentAt: r.sent_at,
    error: r.error,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * Converts a snake_case patch object into a SET clause + bound values for a
 * prepared statement, skipping undefined entries. The caller is responsible
 * for mapping camelCase→snake_case before calling this.
 */
function buildSet(
  patch: Record<string, unknown>,
): { clause: string; values: unknown[] } {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  return {
    clause: entries.map(([k]) => `${k} = ?`).join(", "),
    values: entries.map(([, v]) => v),
  };
}

export class D1Store implements LeadRepository {
  constructor(
    private readonly db: D1Database,
    private readonly workspaceId: string = LOCAL_WORKSPACE_ID,
  ) {}

  // ---- Workspaces (global, not scoped) ----

  async getWorkspace(id: string): Promise<Workspace | null> {
    const row = await this.db
      .prepare(`SELECT * FROM workspaces WHERE id = ?`)
      .bind(id)
      .first<WorkspaceRow>();
    return row ? rowToWorkspace(row) : null;
  }

  async getWorkspaceByOwner(ownerUserId: string): Promise<Workspace | null> {
    const row = await this.db
      .prepare(`SELECT * FROM workspaces WHERE owner_user_id = ? LIMIT 1`)
      .bind(ownerUserId)
      .first<WorkspaceRow>();
    return row ? rowToWorkspace(row) : null;
  }

  async getWorkspaceByStripeCustomer(customerId: string): Promise<Workspace | null> {
    const row = await this.db
      .prepare(`SELECT * FROM workspaces WHERE stripe_customer_id = ? LIMIT 1`)
      .bind(customerId)
      .first<WorkspaceRow>();
    return row ? rowToWorkspace(row) : null;
  }

  async createWorkspace(w: Workspace): Promise<Workspace> {
    try {
      await this.db
        .prepare(
          `INSERT INTO workspaces
           (id, name, owner_user_id, plan_id, stripe_customer_id,
            stripe_subscription_id, stripe_price_id, leads_used_this_month,
            sends_used_this_month, resets_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO NOTHING`,
        )
        .bind(
          w.id,
          w.name,
          w.ownerUserId,
          w.planId,
          w.stripeCustomerId,
          w.stripeSubscriptionId,
          w.stripePriceId,
          w.leadsUsedThisMonth,
          w.sendsUsedThisMonth,
          w.resetsAt,
          w.createdAt,
          w.updatedAt,
        )
        .run();
    } catch {
      // Unique owner_user_id (workspaces_owner_unique) or transient D1 error.
    }
    // Race: another isolate may have created the owner row first.
    if (w.ownerUserId) {
      const byOwner = await this.getWorkspaceByOwner(w.ownerUserId);
      if (byOwner) return byOwner;
    }
    return (await this.getWorkspace(w.id)) ?? w;
  }

  async incrementWorkspaceUsage(
    id: string,
    patch: { leads?: number; sends?: number; verifies?: number },
  ): Promise<void> {
    const leads = Math.max(0, Math.floor(patch.leads ?? 0));
    const sends = Math.max(0, Math.floor(patch.sends ?? 0));
    const verifies = Math.max(0, Math.floor(patch.verifies ?? 0));
    if (leads === 0 && sends === 0 && verifies === 0) return;
    await this.db
      .prepare(
        `UPDATE workspaces SET
           leads_used_this_month = leads_used_this_month + ?,
           sends_used_this_month = sends_used_this_month + ?,
           verifies_used_today = COALESCE(verifies_used_today, 0) + ?,
           updated_at = ?
         WHERE id = ?`,
      )
      .bind(leads, sends, verifies, new Date().toISOString(), id)
      .run();
  }

  async updateWorkspace(id: string, patch: Partial<Workspace>): Promise<Workspace | null> {
    const row: Record<string, unknown> = {};
    if ("name" in patch) row.name = patch.name;
    if ("ownerUserId" in patch) row.owner_user_id = patch.ownerUserId ?? null;
    if ("planId" in patch) row.plan_id = patch.planId;
    if ("stripeCustomerId" in patch) row.stripe_customer_id = patch.stripeCustomerId ?? null;
    if ("stripeSubscriptionId" in patch)
      row.stripe_subscription_id = patch.stripeSubscriptionId ?? null;
    if ("stripePriceId" in patch) row.stripe_price_id = patch.stripePriceId ?? null;
    if ("leadsUsedThisMonth" in patch) row.leads_used_this_month = patch.leadsUsedThisMonth;
    if ("sendsUsedThisMonth" in patch) row.sends_used_this_month = patch.sendsUsedThisMonth;
    if ("resetsAt" in patch) row.resets_at = patch.resetsAt ?? null;
    if ("verifiesUsedToday" in patch) row.verifies_used_today = patch.verifiesUsedToday;
    if ("verifiesResetsAt" in patch) row.verifies_resets_at = patch.verifiesResetsAt ?? null;
    if ("createdAt" in patch) row.created_at = patch.createdAt;
    if ("updatedAt" in patch) row.updated_at = patch.updatedAt;
    if ("fromName" in patch) row.from_name = patch.fromName ?? null;
    if ("fromEmail" in patch) row.from_email = patch.fromEmail ?? null;
    if ("replyTo" in patch) row.reply_to = patch.replyTo ?? null;
    if ("physicalAddress" in patch) row.physical_address = patch.physicalAddress ?? null;
    if ("resendApiKey" in patch) row.resend_api_key = patch.resendApiKey ?? null;
    if ("resendWebhookId" in patch) row.resend_webhook_id = patch.resendWebhookId ?? null;
    if ("resendWebhookSecret" in patch) {
      row.resend_webhook_secret = patch.resendWebhookSecret ?? null;
    }
    if ("mailerooApiKey" in patch) row.maileroo_api_key = patch.mailerooApiKey ?? null;
    if ("easyEmailProvider" in patch) row.easy_email_provider = patch.easyEmailProvider ?? "resend";
    if ("preferredSendPath" in patch) {
      row.preferred_send_path = patch.preferredSendPath ?? null;
    }
    if ("emailVerifyEnabled" in patch) {
      row.email_verify_enabled = patch.emailVerifyEnabled === false ? 0 : 1;
    }
    if ("findLeadsEnabled" in patch) {
      row.find_leads_enabled = patch.findLeadsEnabled === false ? 0 : 1;
    }
    if ("connectedMailbox" in patch) {
      row.connected_mailbox_json = patch.connectedMailbox
        ? JSON.stringify(patch.connectedMailbox)
        : null;
    }
    if ("outreachProfilesJson" in patch) {
      row.outreach_profiles_json = patch.outreachProfilesJson ?? null;
    }

    if (Object.keys(row).length === 0) return this.getWorkspace(id);
    const { clause, values } = buildSet(row);
    await this.db
      .prepare(`UPDATE workspaces SET ${clause} WHERE id = ?`)
      .bind(...values, id)
      .run();
    return this.getWorkspace(id);
  }

  async listWorkspaces(): Promise<Workspace[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM workspaces ORDER BY created_at DESC`)
      .all<WorkspaceRow>();
    return (results ?? []).map(rowToWorkspace);
  }

  async adminCountByWorkspace(): Promise<{
    leads: Record<string, number>;
    sent: Record<string, number>;
    runs: Record<string, number>;
  }> {
    const toMap = (rows: Array<{ workspace_id: string; n: number }> | null | undefined) => {
      const out: Record<string, number> = {};
      for (const r of rows ?? []) out[r.workspace_id] = Number(r.n ?? 0);
      return out;
    };
    const [leads, sent, runs] = await Promise.all([
      this.db
        .prepare(`SELECT workspace_id, COUNT(*) AS n FROM leads GROUP BY workspace_id`)
        .all<{ workspace_id: string; n: number }>(),
      this.db
        .prepare(
          `SELECT workspace_id, COUNT(*) AS n FROM outreach WHERE status = 'sent' GROUP BY workspace_id`,
        )
        .all<{ workspace_id: string; n: number }>(),
      this.db
        .prepare(`SELECT workspace_id, COUNT(*) AS n FROM runs GROUP BY workspace_id`)
        .all<{ workspace_id: string; n: number }>(),
    ]);
    return {
      leads: toMap(leads.results),
      sent: toMap(sent.results),
      runs: toMap(runs.results),
    };
  }

  async listAuthUsers(): Promise<
    Array<{
      id: string;
      email: string | null;
      name: string | null;
      isAdmin: boolean;
    }>
  > {
    try {
      const { results } = await this.db
        .prepare(
          `SELECT id, email, name, is_admin AS isAdmin
           FROM users ORDER BY email ASC`,
        )
        .all<{
          id: string;
          email: string | null;
          name: string | null;
          isAdmin: number | null;
        }>();
      return (results ?? []).map((r) => ({
        id: r.id,
        email: r.email,
        name: r.name,
        isAdmin: Boolean(r.isAdmin),
      }));
    } catch {
      // Migration 0018 not applied yet.
      const { results } = await this.db
        .prepare(`SELECT id, email, name FROM users ORDER BY email ASC`)
        .all<{ id: string; email: string | null; name: string | null }>();
      return (results ?? []).map((r) => ({ ...r, isAdmin: false }));
    }
  }

  // ---- Boards ----

  async createBoard(board: Board): Promise<Board> {
    await this.db
      .prepare(
        `INSERT INTO boards (id, workspace_id, name, is_default, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        board.id,
        this.workspaceId,
        board.name,
        board.isDefault ? 1 : 0,
        board.createdAt,
        board.updatedAt,
      )
      .run();
    return board;
  }

  async updateBoard(id: string, patch: Partial<Board>): Promise<Board | null> {
    const row: Record<string, unknown> = {};
    if ("name" in patch) row.name = patch.name;
    if ("isDefault" in patch) row.is_default = patch.isDefault ? 1 : 0;
    if ("updatedAt" in patch) row.updated_at = patch.updatedAt;
    if (Object.keys(row).length === 0) return this.getBoard(id);
    const { clause, values } = buildSet(row);
    await this.db
      .prepare(`UPDATE boards SET ${clause} WHERE id = ? AND workspace_id = ?`)
      .bind(...values, id, this.workspaceId)
      .run();
    return this.getBoard(id);
  }

  async getBoard(id: string): Promise<Board | null> {
    const row = await this.db
      .prepare(`SELECT * FROM boards WHERE id = ? AND workspace_id = ?`)
      .bind(id, this.workspaceId)
      .first<BoardRow>();
    return row ? rowToBoard(row) : null;
  }

  async getBoardAnywhere(id: string): Promise<Board | null> {
    const row = await this.db
      .prepare(`SELECT * FROM boards WHERE id = ?`)
      .bind(id)
      .first<BoardRow>();
    return row ? rowToBoard(row) : null;
  }

  async listBoards(): Promise<Board[]> {
    const { results } = await this.db
      .prepare(
        `SELECT * FROM boards WHERE workspace_id = ?
         ORDER BY is_default DESC, name ASC`,
      )
      .bind(this.workspaceId)
      .all<BoardRow>();
    return results.map(rowToBoard);
  }

  async deleteBoard(id: string): Promise<boolean> {
    const result = await this.db
      .prepare(`DELETE FROM boards WHERE id = ? AND workspace_id = ? AND is_default = 0`)
      .bind(id, this.workspaceId)
      .run();
    if (result.meta.changes > 0) {
      await this.db.batch([
        this.db.prepare(`DELETE FROM board_members WHERE board_id = ?`).bind(id),
        this.db.prepare(`DELETE FROM board_invites WHERE board_id = ?`).bind(id),
        this.db.prepare(`DELETE FROM board_locks WHERE board_id = ?`).bind(id),
      ]);
    }
    return result.meta.changes > 0;
  }

  async listBoardMembers(boardId: string): Promise<BoardMember[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM board_members WHERE board_id = ?`)
      .bind(boardId)
      .all<{
        board_id: string;
        user_id: string;
        email: string | null;
        role: string;
        created_at: string;
      }>();
    return (results ?? []).map((r) => ({
      boardId: r.board_id,
      userId: r.user_id,
      email: r.email,
      role: r.role as BoardMemberRole,
      createdAt: r.created_at,
    }));
  }

  async upsertBoardMember(member: BoardMember): Promise<BoardMember> {
    await this.db
      .prepare(
        `INSERT INTO board_members (board_id, user_id, email, role, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(board_id, user_id) DO UPDATE SET
           email = excluded.email,
           role = excluded.role`,
      )
      .bind(
        member.boardId,
        member.userId,
        member.email,
        member.role,
        member.createdAt,
      )
      .run();
    return member;
  }

  async removeBoardMember(boardId: string, userId: string): Promise<boolean> {
    const result = await this.db
      .prepare(`DELETE FROM board_members WHERE board_id = ? AND user_id = ?`)
      .bind(boardId, userId)
      .run();
    return result.meta.changes > 0;
  }

  async listBoardIdsForMember(userId: string): Promise<string[]> {
    const { results } = await this.db
      .prepare(`SELECT board_id FROM board_members WHERE user_id = ?`)
      .bind(userId)
      .all<{ board_id: string }>();
    return (results ?? []).map((r) => r.board_id);
  }

  async createBoardInvite(invite: BoardInvite): Promise<BoardInvite> {
    await this.db
      .prepare(
        `INSERT INTO board_invites
         (id, board_id, email, role, invited_by_user_id, status, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        invite.id,
        invite.boardId,
        invite.email,
        invite.role,
        invite.invitedByUserId,
        invite.status,
        invite.createdAt,
        invite.expiresAt,
      )
      .run();
    return invite;
  }

  async updateBoardInvite(
    id: string,
    patch: Partial<BoardInvite>,
  ): Promise<BoardInvite | null> {
    const row: Record<string, unknown> = {};
    if ("status" in patch) row.status = patch.status;
    if ("role" in patch) row.role = patch.role;
    if ("expiresAt" in patch) row.expires_at = patch.expiresAt;
    if (Object.keys(row).length === 0) return this.getBoardInvite(id);
    const { clause, values } = buildSet(row);
    await this.db
      .prepare(`UPDATE board_invites SET ${clause} WHERE id = ?`)
      .bind(...values, id)
      .run();
    return this.getBoardInvite(id);
  }

  async getBoardInvite(id: string): Promise<BoardInvite | null> {
    const r = await this.db
      .prepare(`SELECT * FROM board_invites WHERE id = ?`)
      .bind(id)
      .first<{
        id: string;
        board_id: string;
        email: string;
        role: string;
        invited_by_user_id: string;
        status: string;
        created_at: string;
        expires_at: string;
      }>();
    if (!r) return null;
    const board = await this.getBoardAnywhere(r.board_id);
    return {
      id: r.id,
      boardId: r.board_id,
      boardName: board?.name ?? "Board",
      email: r.email,
      role: r.role as BoardMemberRole,
      invitedByUserId: r.invited_by_user_id,
      status: r.status as BoardInvite["status"],
      createdAt: r.created_at,
      expiresAt: r.expires_at,
    };
  }

  async listPendingInvitesForEmail(email: string): Promise<BoardInvite[]> {
    const key = email.trim().toLowerCase();
    const now = new Date().toISOString();
    const { results } = await this.db
      .prepare(
        `SELECT * FROM board_invites
         WHERE lower(email) = ? AND status = 'pending' AND expires_at > ?`,
      )
      .bind(key, now)
      .all<{
        id: string;
        board_id: string;
        email: string;
        role: string;
        invited_by_user_id: string;
        status: string;
        created_at: string;
        expires_at: string;
      }>();
    const out: BoardInvite[] = [];
    for (const r of results ?? []) {
      const board = await this.getBoardAnywhere(r.board_id);
      out.push({
        id: r.id,
        boardId: r.board_id,
        boardName: board?.name ?? "Board",
        email: r.email,
        role: r.role as BoardMemberRole,
        invitedByUserId: r.invited_by_user_id,
        status: r.status as BoardInvite["status"],
        createdAt: r.created_at,
        expiresAt: r.expires_at,
      });
    }
    return out;
  }

  async listPendingInvitesForBoard(boardId: string): Promise<BoardInvite[]> {
    const { results } = await this.db
      .prepare(
        `SELECT * FROM board_invites WHERE board_id = ? AND status = 'pending'`,
      )
      .bind(boardId)
      .all<{
        id: string;
        board_id: string;
        email: string;
        role: string;
        invited_by_user_id: string;
        status: string;
        created_at: string;
        expires_at: string;
      }>();
    const board = await this.getBoardAnywhere(boardId);
    return (results ?? []).map((r) => ({
      id: r.id,
      boardId: r.board_id,
      boardName: board?.name ?? "Board",
      email: r.email,
      role: r.role as BoardMemberRole,
      invitedByUserId: r.invited_by_user_id,
      status: r.status as BoardInvite["status"],
      createdAt: r.created_at,
      expiresAt: r.expires_at,
    }));
  }

  async getBoardLock(boardId: string): Promise<BoardLock | null> {
    const r = await this.db
      .prepare(`SELECT * FROM board_locks WHERE board_id = ?`)
      .bind(boardId)
      .first<{
        board_id: string;
        user_id: string;
        user_name: string | null;
        locked_at: string;
        expires_at: string;
      }>();
    if (!r) return null;
    if (r.expires_at <= new Date().toISOString()) {
      await this.clearBoardLock(boardId);
      return null;
    }
    return {
      boardId: r.board_id,
      userId: r.user_id,
      userName: r.user_name,
      lockedAt: r.locked_at,
      expiresAt: r.expires_at,
    };
  }

  async listBoardLocks(boardIds: string[]): Promise<BoardLock[]> {
    const ids = [...new Set(boardIds.filter(Boolean))];
    if (ids.length === 0) return [];
    const now = new Date().toISOString();
    const out: BoardLock[] = [];
    const CHUNK = 50;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const placeholders = chunk.map(() => "?").join(",");
      const { results } = await this.db
        .prepare(
          `SELECT * FROM board_locks
           WHERE board_id IN (${placeholders}) AND expires_at > ?`,
        )
        .bind(...chunk, now)
        .all<{
          board_id: string;
          user_id: string;
          user_name: string | null;
          locked_at: string;
          expires_at: string;
        }>();
      for (const r of results) {
        out.push({
          boardId: r.board_id,
          userId: r.user_id,
          userName: r.user_name,
          lockedAt: r.locked_at,
          expiresAt: r.expires_at,
        });
      }
    }
    return out;
  }

  async countLeadsByBoard(): Promise<
    Record<
      string,
      { total: number; contacted: number; sent: number; closed: number }
    >
  > {
    const { results } = await this.db
      .prepare(
        `SELECT board_id AS boardId,
                COUNT(*) AS total,
                SUM(CASE WHEN crm_stage IN ('contacted','in_conversation','closed') THEN 1 ELSE 0 END) AS contacted,
                SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
                SUM(CASE WHEN crm_stage = 'closed' THEN 1 ELSE 0 END) AS closed
         FROM leads
         WHERE workspace_id = ? AND board_id IS NOT NULL
         GROUP BY board_id`,
      )
      .bind(this.workspaceId)
      .all<{
        boardId: string;
        total: number;
        contacted: number;
        sent: number;
        closed: number;
      }>();
    const map: Record<
      string,
      { total: number; contacted: number; sent: number; closed: number }
    > = {};
    for (const r of results) {
      if (!r.boardId) continue;
      map[r.boardId] = {
        total: Number(r.total) || 0,
        contacted: Number(r.contacted) || 0,
        sent: Number(r.sent) || 0,
        closed: Number(r.closed) || 0,
      };
    }
    return map;
  }

  async upsertBoardLock(lock: BoardLock): Promise<BoardLock> {
    await this.db
      .prepare(
        `INSERT INTO board_locks (board_id, user_id, user_name, locked_at, expires_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(board_id) DO UPDATE SET
           user_id = excluded.user_id,
           user_name = excluded.user_name,
           locked_at = excluded.locked_at,
           expires_at = excluded.expires_at`,
      )
      .bind(
        lock.boardId,
        lock.userId,
        lock.userName,
        lock.lockedAt,
        lock.expiresAt,
      )
      .run();
    return lock;
  }

  async clearBoardLock(boardId: string, userId?: string): Promise<boolean> {
    const result = userId
      ? await this.db
          .prepare(
            `DELETE FROM board_locks WHERE board_id = ? AND user_id = ?`,
          )
          .bind(boardId, userId)
          .run()
      : await this.db
          .prepare(`DELETE FROM board_locks WHERE board_id = ?`)
          .bind(boardId)
          .run();
    return result.meta.changes > 0;
  }

  async getMemberRole(
    boardId: string,
    userId: string,
  ): Promise<BoardMemberRole | null> {
    const r = await this.db
      .prepare(
        `SELECT role FROM board_members WHERE board_id = ? AND user_id = ?`,
      )
      .bind(boardId, userId)
      .first<{ role: string }>();
    return (r?.role as BoardMemberRole) ?? null;
  }

  // ---- Runs ----

  async createRun(run: Run): Promise<Run> {
    await this.db
      .prepare(
        `INSERT INTO runs
         (id, workspace_id, board_id, niche, location, offer_notes, sender_name, status, mode, provider,
          lead_count, error, created_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        run.id,
        this.workspaceId,
        run.boardId,
        run.niche,
        run.location,
        run.offerNotes,
        run.senderName,
        run.status,
        run.mode,
        run.provider,
        run.leadCount,
        run.error,
        run.createdAt,
        run.completedAt,
      )
      .run();
    return run;
  }

  async updateRun(id: string, patch: Partial<Run>): Promise<Run | null> {
    const row: Record<string, unknown> = {};
    if ("boardId" in patch) row.board_id = patch.boardId;
    if ("niche" in patch) row.niche = patch.niche;
    if ("location" in patch) row.location = patch.location ?? null;
    if ("offerNotes" in patch) row.offer_notes = patch.offerNotes ?? null;
    if ("senderName" in patch) row.sender_name = patch.senderName ?? null;
    if ("status" in patch) row.status = patch.status;
    if ("mode" in patch) row.mode = patch.mode;
    if ("provider" in patch) row.provider = patch.provider;
    if ("leadCount" in patch) row.lead_count = patch.leadCount;
    if ("error" in patch) row.error = patch.error ?? null;
    if ("createdAt" in patch) row.created_at = patch.createdAt;
    if ("completedAt" in patch) row.completed_at = patch.completedAt ?? null;

    if (Object.keys(row).length === 0) return this.getRun(id);
    const { clause, values } = buildSet(row);
    await this.db
      .prepare(`UPDATE runs SET ${clause} WHERE id = ? AND workspace_id = ?`)
      .bind(...values, id, this.workspaceId)
      .run();
    return this.getRun(id);
  }

  async getRun(id: string): Promise<Run | null> {
    const row = await this.db
      .prepare(`SELECT * FROM runs WHERE id = ? AND workspace_id = ?`)
      .bind(id, this.workspaceId)
      .first<RunRow>();
    return row ? rowToRun(row) : null;
  }

  async listRuns(): Promise<Run[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM runs WHERE workspace_id = ? ORDER BY created_at DESC`)
      .bind(this.workspaceId)
      .all<RunRow>();
    return results.map(rowToRun);
  }

  // ---- Leads ----

  async createLeads(leads: Lead[]): Promise<Lead[]> {
    if (leads.length === 0) return [];
    const stmts = leads.map((l) =>
      this.db
        .prepare(
          `INSERT INTO leads
           (id, workspace_id, run_id, board_id, company, website, emails, phones, contact_name,
            location, about_blurb, company_type, tags, fit_score, fit_reasons, source_url,
            status, crm_stage, contact_method, notes, follow_ups, custom_fields, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          l.id,
          this.workspaceId,
          l.runId,
          l.boardId,
          l.company,
          l.website,
          str(l.emails),
          str(l.phones),
          l.contactName,
          l.location,
          l.aboutBlurb,
          l.companyType ?? null,
          str(l.tags),
          l.fitScore,
          str(l.fitReasons),
          l.sourceUrl,
          l.status,
          l.crmStage ?? "new",
          serializeContactMethods(l.contactMethods),
          l.notes ?? null,
          JSON.stringify(l.followUps ?? []),
          JSON.stringify(l.customFields ?? {}),
          l.createdAt,
        ),
    );
    await this.db.batch(stmts);
    return leads;
  }

  private leadPatchToRow(patch: Partial<Lead>): Record<string, unknown> {
    const row: Record<string, unknown> = {};
    if ("runId" in patch) row.run_id = patch.runId;
    if ("boardId" in patch) row.board_id = patch.boardId;
    if ("company" in patch) row.company = patch.company;
    if ("website" in patch) row.website = patch.website ?? null;
    if ("emails" in patch) row.emails = str(patch.emails!);
    if ("phones" in patch) row.phones = str(patch.phones!);
    if ("contactName" in patch) row.contact_name = patch.contactName ?? null;
    if ("location" in patch) row.location = patch.location ?? null;
    if ("aboutBlurb" in patch) row.about_blurb = patch.aboutBlurb ?? null;
    if ("companyType" in patch) row.company_type = patch.companyType ?? null;
    if ("tags" in patch) row.tags = str(patch.tags!);
    if ("fitScore" in patch) row.fit_score = patch.fitScore;
    if ("fitReasons" in patch) row.fit_reasons = str(patch.fitReasons!);
    if ("sourceUrl" in patch) row.source_url = patch.sourceUrl;
    if ("status" in patch) row.status = patch.status;
    if ("crmStage" in patch) row.crm_stage = patch.crmStage;
    if ("contactMethods" in patch) {
      row.contact_method = serializeContactMethods(patch.contactMethods);
    }
    if ("notes" in patch) row.notes = patch.notes ?? null;
    if ("followUps" in patch) row.follow_ups = JSON.stringify(patch.followUps ?? []);
    if ("customFields" in patch) row.custom_fields = JSON.stringify(patch.customFields ?? {});
    if ("createdAt" in patch) row.created_at = patch.createdAt;
    return row;
  }

  async updateLead(id: string, patch: Partial<Lead>): Promise<Lead | null> {
    const row = this.leadPatchToRow(patch);
    if (Object.keys(row).length === 0) return this.getLead(id);
    const { clause, values } = buildSet(row);
    await this.db
      .prepare(`UPDATE leads SET ${clause} WHERE id = ? AND workspace_id = ?`)
      .bind(...values, id, this.workspaceId)
      .run();
    return this.getLead(id);
  }

  async updateLeads(
    patches: Array<{ id: string; patch: Partial<Lead> }>,
  ): Promise<number> {
    if (patches.length === 0) return 0;
    const stmts = [];
    for (const { id, patch } of patches) {
      const row = this.leadPatchToRow(patch);
      if (Object.keys(row).length === 0) continue;
      const { clause, values } = buildSet(row);
      stmts.push(
        this.db
          .prepare(`UPDATE leads SET ${clause} WHERE id = ? AND workspace_id = ?`)
          .bind(...values, id, this.workspaceId),
      );
    }
    if (stmts.length === 0) return 0;
    await this.db.batch(stmts);
    return stmts.length;
  }

  async getLead(id: string): Promise<Lead | null> {
    const row = await this.db
      .prepare(`SELECT * FROM leads WHERE id = ? AND workspace_id = ?`)
      .bind(id, this.workspaceId)
      .first<LeadRow>();
    return row ? rowToLead(row) : null;
  }

  async deleteLead(id: string): Promise<boolean> {
    await this.db
      .prepare(`DELETE FROM outreach WHERE lead_id = ? AND workspace_id = ?`)
      .bind(id, this.workspaceId)
      .run();
    const result = await this.db
      .prepare(`DELETE FROM leads WHERE id = ? AND workspace_id = ?`)
      .bind(id, this.workspaceId)
      .run();
    return (result.meta?.changes ?? 0) > 0;
  }

  async deleteLeads(ids: string[]): Promise<number> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return 0;
    let deleted = 0;
    // D1 batch limit — chunk deletes.
    const CHUNK = 40;
    for (let i = 0; i < unique.length; i += CHUNK) {
      const chunk = unique.slice(i, i + CHUNK);
      const placeholders = chunk.map(() => "?").join(",");
      await this.db
        .prepare(
          `DELETE FROM outreach WHERE workspace_id = ? AND lead_id IN (${placeholders})`,
        )
        .bind(this.workspaceId, ...chunk)
        .run();
      const result = await this.db
        .prepare(
          `DELETE FROM leads WHERE workspace_id = ? AND id IN (${placeholders})`,
        )
        .bind(this.workspaceId, ...chunk)
        .run();
      deleted += result.meta?.changes ?? 0;
    }
    return deleted;
  }

  async deleteLeadsByBoard(boardId: string): Promise<number> {
    if (!boardId) return 0;
    // Prefer set-based deletes so we never ship thousands of ids over the wire.
    await this.db
      .prepare(
        `DELETE FROM outreach WHERE workspace_id = ? AND lead_id IN (
           SELECT id FROM leads WHERE workspace_id = ? AND board_id = ?
         )`,
      )
      .bind(this.workspaceId, this.workspaceId, boardId)
      .run();
    const result = await this.db
      .prepare(`DELETE FROM leads WHERE workspace_id = ? AND board_id = ?`)
      .bind(this.workspaceId, boardId)
      .run();
    return result.meta?.changes ?? 0;
  }

  async listLeads(filter?: LeadListFilter): Promise<Lead[]> {
    if (filter?.runId && filter?.boardId) {
      const { results } = await this.db
        .prepare(
          `SELECT * FROM leads WHERE workspace_id = ? AND run_id = ? AND board_id = ?
           ORDER BY created_at ASC`,
        )
        .bind(this.workspaceId, filter.runId, filter.boardId)
        .all<LeadRow>();
      return results.map(rowToLead);
    }
    if (filter?.runId) {
      const { results } = await this.db
        .prepare(
          `SELECT * FROM leads WHERE workspace_id = ? AND run_id = ? ORDER BY created_at ASC`,
        )
        .bind(this.workspaceId, filter.runId)
        .all<LeadRow>();
      return results.map(rowToLead);
    }
    if (filter?.boardId) {
      const { results } = await this.db
        .prepare(
          `SELECT * FROM leads WHERE workspace_id = ? AND board_id = ? ORDER BY created_at ASC`,
        )
        .bind(this.workspaceId, filter.boardId)
        .all<LeadRow>();
      return results.map(rowToLead);
    }
    const { results } = await this.db
      .prepare(`SELECT * FROM leads WHERE workspace_id = ? ORDER BY created_at ASC`)
      .bind(this.workspaceId)
      .all<LeadRow>();
    return results.map(rowToLead);
  }

  async countLeads(filter?: LeadListFilter): Promise<number> {
    if (filter?.runId && filter?.boardId) {
      const row = await this.db
        .prepare(
          `SELECT COUNT(*) AS n FROM leads WHERE workspace_id = ? AND run_id = ? AND board_id = ?`,
        )
        .bind(this.workspaceId, filter.runId, filter.boardId)
        .first<{ n: number }>();
      return Number(row?.n ?? 0);
    }
    if (filter?.runId) {
      const row = await this.db
        .prepare(`SELECT COUNT(*) AS n FROM leads WHERE workspace_id = ? AND run_id = ?`)
        .bind(this.workspaceId, filter.runId)
        .first<{ n: number }>();
      return Number(row?.n ?? 0);
    }
    if (filter?.boardId) {
      const row = await this.db
        .prepare(`SELECT COUNT(*) AS n FROM leads WHERE workspace_id = ? AND board_id = ?`)
        .bind(this.workspaceId, filter.boardId)
        .first<{ n: number }>();
      return Number(row?.n ?? 0);
    }
    const row = await this.db
      .prepare(`SELECT COUNT(*) AS n FROM leads WHERE workspace_id = ?`)
      .bind(this.workspaceId)
      .first<{ n: number }>();
    return Number(row?.n ?? 0);
  }

  async summarizeLeads(filter?: LeadListFilter): Promise<{
    total: number;
    byCrmStage: Record<string, number>;
    byStatus: Record<string, number>;
    avgFitScore: number;
  }> {
    const where =
      filter?.boardId != null
        ? `WHERE workspace_id = ? AND board_id = ?`
        : `WHERE workspace_id = ?`;
    const binds =
      filter?.boardId != null
        ? [this.workspaceId, filter.boardId]
        : [this.workspaceId];

    const [stageRows, statusRows, agg] = await Promise.all([
      this.db
        .prepare(
          `SELECT COALESCE(crm_stage, 'new') AS k, COUNT(*) AS n FROM leads ${where} GROUP BY COALESCE(crm_stage, 'new')`,
        )
        .bind(...binds)
        .all<{ k: string; n: number }>(),
      this.db
        .prepare(
          `SELECT status AS k, COUNT(*) AS n FROM leads ${where} GROUP BY status`,
        )
        .bind(...binds)
        .all<{ k: string; n: number }>(),
      this.db
        .prepare(
          `SELECT COUNT(*) AS total, COALESCE(AVG(fit_score), 0) AS avgFit FROM leads ${where}`,
        )
        .bind(...binds)
        .first<{ total: number; avgFit: number }>(),
    ]);

    const byCrmStage: Record<string, number> = {};
    for (const r of stageRows.results ?? []) {
      byCrmStage[r.k] = Number(r.n) || 0;
    }
    const byStatus: Record<string, number> = {};
    for (const r of statusRows.results ?? []) {
      byStatus[r.k] = Number(r.n) || 0;
    }
    return {
      total: Number(agg?.total ?? 0),
      byCrmStage,
      byStatus,
      avgFitScore: Math.round(Number(agg?.avgFit ?? 0)),
    };
  }

  async summarizeOutreach(boardId?: string | null): Promise<{
    sentCount: number;
    draftedCount: number;
  }> {
    if (boardId) {
      const row = await this.db
        .prepare(
          `SELECT
             SUM(CASE WHEN o.status = 'sent' THEN 1 ELSE 0 END) AS sentCount,
             SUM(CASE WHEN o.status IN ('draft', 'approved') THEN 1 ELSE 0 END) AS draftedCount
           FROM outreach o
           INNER JOIN leads l ON l.id = o.lead_id
           WHERE o.workspace_id = ? AND l.board_id = ?`,
        )
        .bind(this.workspaceId, boardId)
        .first<{ sentCount: number; draftedCount: number }>();
      return {
        sentCount: Number(row?.sentCount ?? 0),
        draftedCount: Number(row?.draftedCount ?? 0),
      };
    }
    const row = await this.db
      .prepare(
        `SELECT
           SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sentCount,
           SUM(CASE WHEN status IN ('draft', 'approved') THEN 1 ELSE 0 END) AS draftedCount
         FROM outreach WHERE workspace_id = ?`,
      )
      .bind(this.workspaceId)
      .first<{ sentCount: number; draftedCount: number }>();
    return {
      sentCount: Number(row?.sentCount ?? 0),
      draftedCount: Number(row?.draftedCount ?? 0),
    };
  }

  // ---- Outreach ----

  async upsertOutreach(outreach: Outreach): Promise<Outreach> {
    await this.db
      .prepare(
        `INSERT INTO outreach
         (id, workspace_id, lead_id, run_id, to_email, subject, body, status,
          delivery_status, sent_at, error, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           lead_id          = excluded.lead_id,
           run_id           = excluded.run_id,
           to_email         = excluded.to_email,
           subject          = excluded.subject,
           body             = excluded.body,
           status           = excluded.status,
           delivery_status  = excluded.delivery_status,
           sent_at          = excluded.sent_at,
           error            = excluded.error,
           updated_at       = excluded.updated_at`,
      )
      .bind(
        outreach.id,
        this.workspaceId,
        outreach.leadId,
        outreach.runId,
        outreach.toEmail,
        outreach.subject,
        outreach.body,
        outreach.status,
        outreach.deliveryStatus ?? "unknown",
        outreach.sentAt,
        outreach.error,
        outreach.createdAt,
        outreach.updatedAt,
      )
      .run();
    return outreach;
  }

  async updateOutreach(
    id: string,
    patch: Partial<Outreach>,
  ): Promise<Outreach | null> {
    const row: Record<string, unknown> = {};
    if ("leadId" in patch) row.lead_id = patch.leadId;
    if ("runId" in patch) row.run_id = patch.runId;
    if ("toEmail" in patch) row.to_email = patch.toEmail ?? null;
    if ("subject" in patch) row.subject = patch.subject;
    if ("body" in patch) row.body = patch.body;
    if ("status" in patch) row.status = patch.status;
    if ("deliveryStatus" in patch) row.delivery_status = patch.deliveryStatus ?? "unknown";
    if ("sentAt" in patch) row.sent_at = patch.sentAt ?? null;
    if ("error" in patch) row.error = patch.error ?? null;
    if ("createdAt" in patch) row.created_at = patch.createdAt;
    if ("updatedAt" in patch) row.updated_at = patch.updatedAt;

    if (Object.keys(row).length === 0) return this.getOutreach(id);
    const { clause, values } = buildSet(row);
    await this.db
      .prepare(`UPDATE outreach SET ${clause} WHERE id = ? AND workspace_id = ?`)
      .bind(...values, id, this.workspaceId)
      .run();
    return this.getOutreach(id);
  }

  async claimOutreachForSend(id: string): Promise<Outreach | null> {
    const now = new Date().toISOString();
    const stuckBefore = new Date(Date.now() - 2 * 60_000).toISOString();
    const result = await this.db
      .prepare(
        `UPDATE outreach
         SET status = 'sending', error = NULL, updated_at = ?
         WHERE id = ? AND workspace_id = ?
           AND (
             status = 'approved'
             OR (status = 'sending' AND updated_at < ?)
           )`,
      )
      .bind(now, id, this.workspaceId, stuckBefore)
      .run();
    const changed = (result as { meta?: { changes?: number } }).meta?.changes ?? 0;
    if (!changed) return null;
    return this.getOutreach(id);
  }

  async getOutreach(id: string): Promise<Outreach | null> {
    const row = await this.db
      .prepare(`SELECT * FROM outreach WHERE id = ? AND workspace_id = ?`)
      .bind(id, this.workspaceId)
      .first<OutreachRow>();
    return row ? rowToOutreach(row) : null;
  }

  async getOutreachByLead(leadId: string): Promise<Outreach | null> {
    const row = await this.db
      .prepare(`SELECT * FROM outreach WHERE lead_id = ? AND workspace_id = ?`)
      .bind(leadId, this.workspaceId)
      .first<OutreachRow>();
    return row ? rowToOutreach(row) : null;
  }

  async listOutreach(): Promise<Outreach[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM outreach WHERE workspace_id = ?`)
      .bind(this.workspaceId)
      .all<OutreachRow>();
    return results.map(rowToOutreach);
  }

  async listOutreachByLeadIds(leadIds: string[]): Promise<Outreach[]> {
    const ids = [...new Set(leadIds.filter(Boolean))];
    if (ids.length === 0) return [];
    const out: Outreach[] = [];
    const CHUNK = 50;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const placeholders = chunk.map(() => "?").join(",");
      const { results } = await this.db
        .prepare(
          `SELECT * FROM outreach
           WHERE workspace_id = ? AND lead_id IN (${placeholders})`,
        )
        .bind(this.workspaceId, ...chunk)
        .all<OutreachRow>();
      out.push(...results.map(rowToOutreach));
    }
    return out;
  }

  async findLatestSentByEmail(
    email: string,
    workspaceId?: string,
  ): Promise<Outreach | null> {
    const needle = email.trim().toLowerCase();
    if (!needle) return null;
    // Unscoped only for platform webhook secrets; BYO secrets must pass workspaceId.
    const row = workspaceId
      ? await this.db
          .prepare(
            `SELECT * FROM outreach
             WHERE workspace_id = ?
               AND status = 'sent' AND lower(to_email) = ?
             ORDER BY sent_at DESC
             LIMIT 1`,
          )
          .bind(workspaceId, needle)
          .first<OutreachRow>()
      : await this.db
          .prepare(
            `SELECT * FROM outreach
             WHERE status = 'sent' AND lower(to_email) = ?
             ORDER BY sent_at DESC
             LIMIT 1`,
          )
          .bind(needle)
          .first<OutreachRow>();
    return row ? rowToOutreach(row) : null;
  }

  async countRecentSendActivity(
    sinceIso: string,
    excludeId?: string,
  ): Promise<number> {
    const row = excludeId
      ? await this.db
          .prepare(
            `SELECT COUNT(*) AS n FROM outreach
             WHERE workspace_id = ?
               AND id != ?
               AND (
                 (status = 'sent' AND sent_at IS NOT NULL AND sent_at >= ?)
                 OR (status = 'sending' AND updated_at >= ?)
               )`,
          )
          .bind(this.workspaceId, excludeId, sinceIso, sinceIso)
          .first<{ n: number }>()
      : await this.db
          .prepare(
            `SELECT COUNT(*) AS n FROM outreach
             WHERE workspace_id = ?
               AND (
                 (status = 'sent' AND sent_at IS NOT NULL AND sent_at >= ?)
                 OR (status = 'sending' AND updated_at >= ?)
               )`,
          )
          .bind(this.workspaceId, sinceIso, sinceIso)
          .first<{ n: number }>();
    return Number(row?.n ?? 0);
  }

  async clearWorkspaceData(): Promise<void> {
    const boards = await this.db
      .prepare(`SELECT id FROM boards WHERE workspace_id = ?`)
      .bind(this.workspaceId)
      .all<{ id: string }>();
    const boardIds = (boards.results ?? []).map((b) => b.id);
    const stmts = [];
    for (const boardId of boardIds) {
      stmts.push(
        this.db
          .prepare(`DELETE FROM board_members WHERE board_id = ?`)
          .bind(boardId),
      );
      stmts.push(
        this.db
          .prepare(`DELETE FROM board_invites WHERE board_id = ?`)
          .bind(boardId),
      );
      stmts.push(
        this.db
          .prepare(`DELETE FROM board_locks WHERE board_id = ?`)
          .bind(boardId),
      );
    }
    stmts.push(
      this.db
        .prepare(`DELETE FROM outreach WHERE workspace_id = ?`)
        .bind(this.workspaceId),
    );
    stmts.push(
      this.db
        .prepare(`DELETE FROM leads WHERE workspace_id = ?`)
        .bind(this.workspaceId),
    );
    stmts.push(
      this.db
        .prepare(`DELETE FROM runs WHERE workspace_id = ?`)
        .bind(this.workspaceId),
    );
    stmts.push(
      this.db
        .prepare(`DELETE FROM boards WHERE workspace_id = ?`)
        .bind(this.workspaceId),
    );
    if (stmts.length > 0) {
      await this.db.batch(stmts);
    }
  }

  async deleteWorkspace(id: string): Promise<boolean> {
    const r = await this.db
      .prepare(`DELETE FROM workspaces WHERE id = ?`)
      .bind(id)
      .run();
    return (r.meta?.changes ?? 0) > 0;
  }

  async deleteAuthUser(userId: string): Promise<boolean> {
    const user = await this.db
      .prepare(`SELECT email FROM users WHERE id = ?`)
      .bind(userId)
      .first<{ email: string | null }>();
    const email = user?.email?.trim().toLowerCase() ?? null;

    const stmts = [
      this.db.prepare(`DELETE FROM accounts WHERE "userId" = ?`).bind(userId),
      this.db.prepare(`DELETE FROM sessions WHERE "userId" = ?`).bind(userId),
      this.db.prepare(`DELETE FROM board_members WHERE user_id = ?`).bind(userId),
      this.db.prepare(`DELETE FROM board_locks WHERE user_id = ?`).bind(userId),
    ];
    if (email) {
      stmts.push(
        this.db
          .prepare(`DELETE FROM verification_tokens WHERE lower(identifier) = ?`)
          .bind(email),
      );
      stmts.push(
        this.db
          .prepare(`DELETE FROM board_invites WHERE lower(email) = ?`)
          .bind(email),
      );
    }
    stmts.push(this.db.prepare(`DELETE FROM users WHERE id = ?`).bind(userId));
    await this.db.batch(stmts);
    return true;
  }
}
