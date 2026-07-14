import type { Lead, Outreach, Run } from "@/lib/types";
import type { LeadRepository } from "./index";

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
 * No workspace_id / RLS yet — that arrives in Phase 1 (Auth + workspaces).
 */

type RunRow = {
  id: string;
  niche: string;
  location: string | null;
  offer_notes: string | null;
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
  run_id: string;
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
  created_at: string;
};

type OutreachRow = {
  id: string;
  lead_id: string;
  run_id: string;
  to_email: string | null;
  subject: string;
  body: string;
  status: Outreach["status"];
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

function rowToRun(r: RunRow): Run {
  return {
    id: r.id,
    niche: r.niche,
    location: r.location,
    offerNotes: r.offer_notes,
    status: r.status,
    mode: r.mode,
    provider: r.provider,
    leadCount: r.lead_count,
    error: r.error,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  };
}

function rowToLead(r: LeadRow): Lead {
  return {
    id: r.id,
    runId: r.run_id,
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
    createdAt: r.created_at,
  };
}

function rowToOutreach(r: OutreachRow): Outreach {
  return {
    id: r.id,
    leadId: r.lead_id,
    runId: r.run_id,
    toEmail: r.to_email,
    subject: r.subject,
    body: r.body,
    status: r.status,
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
  constructor(private readonly db: D1Database) {}

  // ---- Runs ----

  async createRun(run: Run): Promise<Run> {
    await this.db
      .prepare(
        `INSERT INTO runs
         (id, niche, location, offer_notes, status, mode, provider,
          lead_count, error, created_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        run.id,
        run.niche,
        run.location,
        run.offerNotes,
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
    if ("niche" in patch) row.niche = patch.niche;
    if ("location" in patch) row.location = patch.location ?? null;
    if ("offerNotes" in patch) row.offer_notes = patch.offerNotes ?? null;
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
      .prepare(`UPDATE runs SET ${clause} WHERE id = ?`)
      .bind(...values, id)
      .run();
    return this.getRun(id);
  }

  async getRun(id: string): Promise<Run | null> {
    const row = await this.db
      .prepare(`SELECT * FROM runs WHERE id = ?`)
      .bind(id)
      .first<RunRow>();
    return row ? rowToRun(row) : null;
  }

  async listRuns(): Promise<Run[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM runs ORDER BY created_at DESC`)
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
           (id, run_id, company, website, emails, phones, contact_name,
            location, about_blurb, tags, fit_score, fit_reasons, source_url,
            status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          l.id,
          l.runId,
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
          l.createdAt,
        ),
    );
    await this.db.batch(stmts);
    return leads;
  }

  async updateLead(id: string, patch: Partial<Lead>): Promise<Lead | null> {
    const row: Record<string, unknown> = {};
    if ("runId" in patch) row.run_id = patch.runId;
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
    if ("createdAt" in patch) row.created_at = patch.createdAt;

    if (Object.keys(row).length === 0) return this.getLead(id);
    const { clause, values } = buildSet(row);
    await this.db
      .prepare(`UPDATE leads SET ${clause} WHERE id = ?`)
      .bind(...values, id)
      .run();
    return this.getLead(id);
  }

  async getLead(id: string): Promise<Lead | null> {
    const row = await this.db
      .prepare(`SELECT * FROM leads WHERE id = ?`)
      .bind(id)
      .first<LeadRow>();
    return row ? rowToLead(row) : null;
  }

  async listLeads(runId?: string): Promise<Lead[]> {
    const { results } = runId
      ? await this.db
          .prepare(`SELECT * FROM leads WHERE run_id = ? ORDER BY fit_score DESC`)
          .bind(runId)
          .all<LeadRow>()
      : await this.db
          .prepare(`SELECT * FROM leads ORDER BY fit_score DESC`)
          .all<LeadRow>();
    return results.map(rowToLead);
  }

  // ---- Outreach ----

  async upsertOutreach(outreach: Outreach): Promise<Outreach> {
    await this.db
      .prepare(
        `INSERT INTO outreach
         (id, lead_id, run_id, to_email, subject, body, status,
          sent_at, error, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           lead_id    = excluded.lead_id,
           run_id     = excluded.run_id,
           to_email   = excluded.to_email,
           subject    = excluded.subject,
           body       = excluded.body,
           status     = excluded.status,
           sent_at    = excluded.sent_at,
           error      = excluded.error,
           updated_at = excluded.updated_at`,
      )
      .bind(
        outreach.id,
        outreach.leadId,
        outreach.runId,
        outreach.toEmail,
        outreach.subject,
        outreach.body,
        outreach.status,
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
    if ("sentAt" in patch) row.sent_at = patch.sentAt ?? null;
    if ("error" in patch) row.error = patch.error ?? null;
    if ("createdAt" in patch) row.created_at = patch.createdAt;
    if ("updatedAt" in patch) row.updated_at = patch.updatedAt;

    if (Object.keys(row).length === 0) return this.getOutreach(id);
    const { clause, values } = buildSet(row);
    await this.db
      .prepare(`UPDATE outreach SET ${clause} WHERE id = ?`)
      .bind(...values, id)
      .run();
    return this.getOutreach(id);
  }

  async getOutreach(id: string): Promise<Outreach | null> {
    const row = await this.db
      .prepare(`SELECT * FROM outreach WHERE id = ?`)
      .bind(id)
      .first<OutreachRow>();
    return row ? rowToOutreach(row) : null;
  }

  async getOutreachByLead(leadId: string): Promise<Outreach | null> {
    const row = await this.db
      .prepare(`SELECT * FROM outreach WHERE lead_id = ?`)
      .bind(leadId)
      .first<OutreachRow>();
    return row ? rowToOutreach(row) : null;
  }

  async listOutreach(): Promise<Outreach[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM outreach`)
      .all<OutreachRow>();
    return results.map(rowToOutreach);
  }
}
