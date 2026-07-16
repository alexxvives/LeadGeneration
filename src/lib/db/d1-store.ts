import type { Board, Lead, Outreach, Run, Workspace, PlanId, CrmStage, ContactMethod, FollowUp, DeliveryStatus } from "@/lib/types";
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
  maileroo_api_key: string | null;
  easy_email_provider: string | null;
  preferred_send_path: string | null;
  // Connected mailbox JSON (migration 0008)
  connected_mailbox_json: string | null;
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
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    fromName: r.from_name ?? null,
    fromEmail: r.from_email ?? null,
    replyTo: r.reply_to ?? null,
    physicalAddress: r.physical_address ?? null,
    resendApiKey: r.resend_api_key ?? null,
    mailerooApiKey: r.maileroo_api_key ?? null,
    easyEmailProvider: r.easy_email_provider === "maileroo" ? "maileroo" : "resend",
    preferredSendPath:
      r.preferred_send_path === "pro" || r.preferred_send_path === "easy"
        ? r.preferred_send_path
        : null,
    connectedMailbox: parseConnectedMailbox(r.connected_mailbox_json),
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
    tags: arr(r.tags),
    fitScore: r.fit_score,
    fitReasons: arr(r.fit_reasons),
    sourceUrl: r.source_url,
    status: r.status,
    crmStage: (r.crm_stage as CrmStage) ?? "new",
    contactMethod: (r.contact_method as ContactMethod) ?? null,
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
    return w;
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
    if ("createdAt" in patch) row.created_at = patch.createdAt;
    if ("updatedAt" in patch) row.updated_at = patch.updatedAt;
    if ("fromName" in patch) row.from_name = patch.fromName ?? null;
    if ("fromEmail" in patch) row.from_email = patch.fromEmail ?? null;
    if ("replyTo" in patch) row.reply_to = patch.replyTo ?? null;
    if ("physicalAddress" in patch) row.physical_address = patch.physicalAddress ?? null;
    if ("resendApiKey" in patch) row.resend_api_key = patch.resendApiKey ?? null;
    if ("mailerooApiKey" in patch) row.maileroo_api_key = patch.mailerooApiKey ?? null;
    if ("easyEmailProvider" in patch) row.easy_email_provider = patch.easyEmailProvider ?? "resend";
    if ("preferredSendPath" in patch) {
      row.preferred_send_path = patch.preferredSendPath ?? null;
    }
    if ("connectedMailbox" in patch) {
      row.connected_mailbox_json = patch.connectedMailbox
        ? JSON.stringify(patch.connectedMailbox)
        : null;
    }

    if (Object.keys(row).length === 0) return this.getWorkspace(id);
    const { clause, values } = buildSet(row);
    await this.db
      .prepare(`UPDATE workspaces SET ${clause} WHERE id = ?`)
      .bind(...values, id)
      .run();
    return this.getWorkspace(id);
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
    return result.meta.changes > 0;
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
            location, about_blurb, tags, fit_score, fit_reasons, source_url,
            status, crm_stage, contact_method, notes, follow_ups, custom_fields, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          str(l.tags),
          l.fitScore,
          str(l.fitReasons),
          l.sourceUrl,
          l.status,
          l.crmStage ?? "new",
          l.contactMethod ?? null,
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
    if ("tags" in patch) row.tags = str(patch.tags!);
    if ("fitScore" in patch) row.fit_score = patch.fitScore;
    if ("fitReasons" in patch) row.fit_reasons = str(patch.fitReasons!);
    if ("sourceUrl" in patch) row.source_url = patch.sourceUrl;
    if ("status" in patch) row.status = patch.status;
    if ("crmStage" in patch) row.crm_stage = patch.crmStage;
    if ("contactMethod" in patch) row.contact_method = patch.contactMethod ?? null;
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

  async listLeads(filter?: LeadListFilter): Promise<Lead[]> {
    if (filter?.runId && filter?.boardId) {
      const { results } = await this.db
        .prepare(
          `SELECT * FROM leads WHERE workspace_id = ? AND run_id = ? AND board_id = ?
           ORDER BY fit_score DESC`,
        )
        .bind(this.workspaceId, filter.runId, filter.boardId)
        .all<LeadRow>();
      return results.map(rowToLead);
    }
    if (filter?.runId) {
      const { results } = await this.db
        .prepare(
          `SELECT * FROM leads WHERE workspace_id = ? AND run_id = ? ORDER BY fit_score DESC`,
        )
        .bind(this.workspaceId, filter.runId)
        .all<LeadRow>();
      return results.map(rowToLead);
    }
    if (filter?.boardId) {
      const { results } = await this.db
        .prepare(
          `SELECT * FROM leads WHERE workspace_id = ? AND board_id = ? ORDER BY fit_score DESC`,
        )
        .bind(this.workspaceId, filter.boardId)
        .all<LeadRow>();
      return results.map(rowToLead);
    }
    const { results } = await this.db
      .prepare(`SELECT * FROM leads WHERE workspace_id = ? ORDER BY fit_score DESC`)
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

  async findLatestSentByEmail(email: string): Promise<Outreach | null> {
    const needle = email.trim().toLowerCase();
    if (!needle) return null;
    // Unscoped on purpose — Resend webhooks are not session-bound.
    const row = await this.db
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

  async clearWorkspaceData(): Promise<void> {
    await this.db
      .prepare(`DELETE FROM outreach WHERE workspace_id = ?`)
      .bind(this.workspaceId)
      .run();
    await this.db
      .prepare(`DELETE FROM leads WHERE workspace_id = ?`)
      .bind(this.workspaceId)
      .run();
    await this.db
      .prepare(`DELETE FROM runs WHERE workspace_id = ?`)
      .bind(this.workspaceId)
      .run();
    await this.db
      .prepare(`DELETE FROM boards WHERE workspace_id = ?`)
      .bind(this.workspaceId)
      .run();
  }
}
