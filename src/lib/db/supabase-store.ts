import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/config";
import type { Lead, Outreach, Run } from "@/lib/types";
import type { LeadRepository } from "./index";

/**
 * Supabase (Postgres) implementation of LeadRepository.
 *
 * This is the commercialization backend selected by `getDb()` when Supabase env
 * vars are present (see config.ts::databaseProvider). It mirrors JsonStore's
 * observable behavior exactly so the swap is invisible to the UI/service layer:
 *  - listRuns  → newest first (JsonStore unshifts)
 *  - listLeads → highest fit score first
 *
 * Server-only: it uses the service-role key, which bypasses RLS. Phase 1 adds
 * auth + workspace scoping + RLS; until then this is single-tenant, matching the
 * JSON store it replaces.
 *
 * Columns are snake_case (Postgres idiom); the row<->model mappers below are the
 * single place that translates. Timestamps are stored as `timestamptz` and
 * normalized back to ISO strings so downstream code keeps seeing ISO strings.
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
  emails: string[];
  phones: string[];
  contact_name: string | null;
  location: string | null;
  about_blurb: string | null;
  tags: string[];
  fit_score: number;
  fit_reasons: string[];
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

const iso = (v: string | null): string | null => (v ? new Date(v).toISOString() : null);

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
    createdAt: iso(r.created_at) ?? r.created_at,
    completedAt: iso(r.completed_at),
  };
}

function runToRow(r: Run): RunRow {
  return {
    id: r.id,
    niche: r.niche,
    location: r.location,
    offer_notes: r.offerNotes,
    status: r.status,
    mode: r.mode,
    provider: r.provider,
    lead_count: r.leadCount,
    error: r.error,
    created_at: r.createdAt,
    completed_at: r.completedAt,
  };
}

function runPatchToRow(patch: Partial<Run>): Partial<RunRow> {
  const row: Partial<RunRow> = {};
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
  return row;
}

function rowToLead(r: LeadRow): Lead {
  return {
    id: r.id,
    runId: r.run_id,
    company: r.company,
    website: r.website,
    emails: r.emails ?? [],
    phones: r.phones ?? [],
    contactName: r.contact_name,
    location: r.location,
    aboutBlurb: r.about_blurb,
    tags: r.tags ?? [],
    fitScore: r.fit_score,
    fitReasons: r.fit_reasons ?? [],
    sourceUrl: r.source_url,
    status: r.status,
    createdAt: iso(r.created_at) ?? r.created_at,
  };
}

function leadToRow(l: Lead): LeadRow {
  return {
    id: l.id,
    run_id: l.runId,
    company: l.company,
    website: l.website,
    emails: l.emails,
    phones: l.phones,
    contact_name: l.contactName,
    location: l.location,
    about_blurb: l.aboutBlurb,
    tags: l.tags,
    fit_score: l.fitScore,
    fit_reasons: l.fitReasons,
    source_url: l.sourceUrl,
    status: l.status,
    created_at: l.createdAt,
  };
}

function leadPatchToRow(patch: Partial<Lead>): Partial<LeadRow> {
  const row: Partial<LeadRow> = {};
  if ("runId" in patch) row.run_id = patch.runId;
  if ("company" in patch) row.company = patch.company;
  if ("website" in patch) row.website = patch.website ?? null;
  if ("emails" in patch) row.emails = patch.emails;
  if ("phones" in patch) row.phones = patch.phones;
  if ("contactName" in patch) row.contact_name = patch.contactName ?? null;
  if ("location" in patch) row.location = patch.location ?? null;
  if ("aboutBlurb" in patch) row.about_blurb = patch.aboutBlurb ?? null;
  if ("tags" in patch) row.tags = patch.tags;
  if ("fitScore" in patch) row.fit_score = patch.fitScore;
  if ("fitReasons" in patch) row.fit_reasons = patch.fitReasons;
  if ("sourceUrl" in patch) row.source_url = patch.sourceUrl;
  if ("status" in patch) row.status = patch.status;
  if ("createdAt" in patch) row.created_at = patch.createdAt;
  return row;
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
    sentAt: iso(r.sent_at),
    error: r.error,
    createdAt: iso(r.created_at) ?? r.created_at,
    updatedAt: iso(r.updated_at) ?? r.updated_at,
  };
}

function outreachToRow(o: Outreach): OutreachRow {
  return {
    id: o.id,
    lead_id: o.leadId,
    run_id: o.runId,
    to_email: o.toEmail,
    subject: o.subject,
    body: o.body,
    status: o.status,
    sent_at: o.sentAt,
    error: o.error,
    created_at: o.createdAt,
    updated_at: o.updatedAt,
  };
}

function outreachPatchToRow(patch: Partial<Outreach>): Partial<OutreachRow> {
  const row: Partial<OutreachRow> = {};
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
  return row;
}

export class SupabaseStore implements LeadRepository {
  private readonly client: SupabaseClient;

  constructor() {
    const { url, serviceRoleKey } = env.supabase();
    if (!url || !serviceRoleKey) {
      // Guarded by databaseProvider(), but fail loudly if constructed wrongly.
      throw new Error("SupabaseStore requires SUPABASE_URL and a Supabase key");
    }
    this.client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  // ---- Runs ----
  async createRun(run: Run): Promise<Run> {
    const { data, error } = await this.client
      .from("runs")
      .insert(runToRow(run))
      .select()
      .single();
    if (error) throw new Error(`createRun failed: ${error.message}`);
    return rowToRun(data as RunRow);
  }

  async updateRun(id: string, patch: Partial<Run>): Promise<Run | null> {
    const { data, error } = await this.client
      .from("runs")
      .update(runPatchToRow(patch))
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw new Error(`updateRun failed: ${error.message}`);
    return data ? rowToRun(data as RunRow) : null;
  }

  async getRun(id: string): Promise<Run | null> {
    const { data, error } = await this.client
      .from("runs")
      .select()
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`getRun failed: ${error.message}`);
    return data ? rowToRun(data as RunRow) : null;
  }

  async listRuns(): Promise<Run[]> {
    const { data, error } = await this.client
      .from("runs")
      .select()
      .order("created_at", { ascending: false });
    if (error) throw new Error(`listRuns failed: ${error.message}`);
    return (data as RunRow[]).map(rowToRun);
  }

  // ---- Leads ----
  async createLeads(leads: Lead[]): Promise<Lead[]> {
    if (leads.length === 0) return [];
    const { data, error } = await this.client
      .from("leads")
      .insert(leads.map(leadToRow))
      .select();
    if (error) throw new Error(`createLeads failed: ${error.message}`);
    return (data as LeadRow[]).map(rowToLead);
  }

  async updateLead(id: string, patch: Partial<Lead>): Promise<Lead | null> {
    const { data, error } = await this.client
      .from("leads")
      .update(leadPatchToRow(patch))
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw new Error(`updateLead failed: ${error.message}`);
    return data ? rowToLead(data as LeadRow) : null;
  }

  async getLead(id: string): Promise<Lead | null> {
    const { data, error } = await this.client
      .from("leads")
      .select()
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`getLead failed: ${error.message}`);
    return data ? rowToLead(data as LeadRow) : null;
  }

  async listLeads(runId?: string): Promise<Lead[]> {
    let query = this.client.from("leads").select();
    if (runId) query = query.eq("run_id", runId);
    const { data, error } = await query.order("fit_score", { ascending: false });
    if (error) throw new Error(`listLeads failed: ${error.message}`);
    return (data as LeadRow[]).map(rowToLead);
  }

  // ---- Outreach ----
  async upsertOutreach(outreach: Outreach): Promise<Outreach> {
    const { data, error } = await this.client
      .from("outreach")
      .upsert(outreachToRow(outreach), { onConflict: "id" })
      .select()
      .single();
    if (error) throw new Error(`upsertOutreach failed: ${error.message}`);
    return rowToOutreach(data as OutreachRow);
  }

  async updateOutreach(
    id: string,
    patch: Partial<Outreach>,
  ): Promise<Outreach | null> {
    const { data, error } = await this.client
      .from("outreach")
      .update(outreachPatchToRow(patch))
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw new Error(`updateOutreach failed: ${error.message}`);
    return data ? rowToOutreach(data as OutreachRow) : null;
  }

  async getOutreach(id: string): Promise<Outreach | null> {
    const { data, error } = await this.client
      .from("outreach")
      .select()
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`getOutreach failed: ${error.message}`);
    return data ? rowToOutreach(data as OutreachRow) : null;
  }

  async getOutreachByLead(leadId: string): Promise<Outreach | null> {
    const { data, error } = await this.client
      .from("outreach")
      .select()
      .eq("lead_id", leadId)
      .maybeSingle();
    if (error) throw new Error(`getOutreachByLead failed: ${error.message}`);
    return data ? rowToOutreach(data as OutreachRow) : null;
  }

  async listOutreach(): Promise<Outreach[]> {
    const { data, error } = await this.client.from("outreach").select();
    if (error) throw new Error(`listOutreach failed: ${error.message}`);
    return (data as OutreachRow[]).map(rowToOutreach);
  }
}
