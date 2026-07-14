import { getDb } from "@/lib/db";
import { newId, nowIso } from "@/lib/id";
import { runSearch } from "@/lib/search";
import { generateDraft } from "@/lib/outreach/draft";
import { sendEmail } from "@/lib/email/sender";
import { checkSendRate, recordSend } from "@/lib/email/rate-limit";
import type {
  CreateRunInput,
  Lead,
  LeadWithOutreach,
  Outreach,
  Run,
} from "@/lib/types";

/**
 * Application services. API routes stay thin and call into these functions,
 * which are the single place that coordinates the repository, search, drafting,
 * and sending. Keeping this framework-agnostic makes it reusable + testable.
 */

export async function createAndRunSearch(input: CreateRunInput): Promise<Run> {
  const db = getDb();
  const run: Run = {
    id: newId("run"),
    niche: input.niche.trim(),
    location: input.location?.trim() || null,
    offerNotes: input.offerNotes?.trim() || null,
    status: "running",
    mode: "demo",
    provider: "pending",
    leadCount: 0,
    error: null,
    createdAt: nowIso(),
    completedAt: null,
  };
  await db.createRun(run);

  try {
    const outcome = await runSearch(input);
    const leads: Lead[] = outcome.leads.map((l) => ({
      id: newId("lead"),
      runId: run.id,
      company: l.company,
      website: l.website,
      emails: l.emails,
      phones: l.phones,
      contactName: l.contactName,
      location: l.location,
      aboutBlurb: l.aboutBlurb,
      tags: l.tags,
      fitScore: l.fitScore,
      fitReasons: l.fitReasons,
      sourceUrl: l.sourceUrl,
      status: "new",
      createdAt: nowIso(),
    }));
    await db.createLeads(leads);

    // Auto-draft outreach for every lead up front, so the human's job is simply
    // "review + approve + send" rather than "generate, then review". Drafting is
    // local + template-based (no external calls), so this stays fast. Nothing is
    // ever sent here — leads land in the approval queue as "queued".
    const now = nowIso();
    const drafts: Outreach[] = leads.map((lead) => ({
      id: newId("out"),
      leadId: lead.id,
      runId: run.id,
      toEmail: lead.emails[0] ?? null,
      ...generateDraft(lead, run),
      status: "draft",
      sentAt: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    }));
    await Promise.all(drafts.map((d) => db.upsertOutreach(d)));
    await Promise.all(leads.map((l) => db.updateLead(l.id, { status: "queued" })));

    const updated = await db.updateRun(run.id, {
      status: "complete",
      mode: outcome.mode,
      provider: outcome.provider,
      leadCount: leads.length,
      completedAt: nowIso(),
    });
    return updated ?? run;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const updated = await db.updateRun(run.id, {
      status: "failed",
      error: message,
      completedAt: nowIso(),
    });
    return updated ?? run;
  }
}

export async function getRunWithLeads(
  runId: string,
): Promise<{ run: Run; leads: LeadWithOutreach[] } | null> {
  const db = getDb();
  const run = await db.getRun(runId);
  if (!run) return null;
  const leads = await db.listLeads(runId);
  const withOutreach = await attachOutreach(leads);
  return { run, leads: withOutreach };
}

export async function getLatestBoard(): Promise<{
  run: Run | null;
  leads: LeadWithOutreach[];
}> {
  const db = getDb();
  const runs = await db.listRuns();
  const run = runs[0] ?? null;
  if (!run) return { run: null, leads: [] };
  const leads = await db.listLeads(run.id);
  return { run, leads: await attachOutreach(leads) };
}

async function attachOutreach(leads: Lead[]): Promise<LeadWithOutreach[]> {
  const db = getDb();
  const all = await db.listOutreach();
  const byLead = new Map(all.map((o) => [o.leadId, o]));
  return leads.map((l) => ({ ...l, outreach: byLead.get(l.id) ?? null }));
}

/** Draft (or re-draft) outreach for a lead and move it into the approval queue. */
export async function draftOutreach(leadId: string): Promise<Outreach | null> {
  const db = getDb();
  const lead = await db.getLead(leadId);
  if (!lead) return null;
  const run = await db.getRun(lead.runId);
  if (!run) return null;

  const { subject, body } = generateDraft(lead, run);
  const existing = await db.getOutreachByLead(leadId);
  const now = nowIso();

  const outreach: Outreach = existing
    ? { ...existing, subject, body, status: "draft", error: null, updatedAt: now }
    : {
        id: newId("out"),
        leadId,
        runId: lead.runId,
        toEmail: lead.emails[0] ?? null,
        subject,
        body,
        status: "draft",
        sentAt: null,
        error: null,
        createdAt: now,
        updatedAt: now,
      };

  await db.upsertOutreach(outreach);
  await db.updateLead(leadId, { status: "queued" });
  return outreach;
}

export async function editOutreach(
  outreachId: string,
  patch: { subject?: string; body?: string; toEmail?: string | null },
): Promise<Outreach | null> {
  const db = getDb();
  return db.updateOutreach(outreachId, { ...patch, updatedAt: nowIso() });
}

export async function setOutreachDecision(
  outreachId: string,
  decision: "approved" | "rejected",
): Promise<Outreach | null> {
  const db = getDb();
  const outreach = await db.updateOutreach(outreachId, {
    status: decision,
    updatedAt: nowIso(),
  });
  if (outreach) {
    await db.updateLead(outreach.leadId, {
      status: decision === "approved" ? "approved" : "rejected",
    });
  }
  return outreach;
}

export interface SendOutcome {
  ok: boolean;
  outreach?: Outreach;
  error?: string;
  rateLimited?: boolean;
  retryAfterMs?: number;
}

/**
 * Send a single APPROVED outreach. Enforces:
 *  - explicit per-lead approval (status must be "approved")
 *  - a valid recipient
 *  - rate limiting
 * This is the only path that actually dispatches email.
 */
export async function sendApprovedOutreach(outreachId: string): Promise<SendOutcome> {
  const db = getDb();
  const outreach = await db.getOutreach(outreachId);
  if (!outreach) return { ok: false, error: "Outreach not found" };

  if (outreach.status !== "approved") {
    return { ok: false, error: "Outreach must be approved before sending" };
  }
  if (!outreach.toEmail) {
    return { ok: false, error: "No recipient email on this lead" };
  }

  const rate = checkSendRate();
  if (!rate.allowed) {
    return {
      ok: false,
      rateLimited: true,
      retryAfterMs: rate.retryAfterMs,
      error: `Rate limit reached (${rate.limit}/min). Try again shortly.`,
    };
  }

  const result = await sendEmail({
    to: outreach.toEmail,
    subject: outreach.subject,
    body: outreach.body,
  });

  if (result.ok) {
    recordSend();
    const updated = await db.updateOutreach(outreachId, {
      status: "sent",
      sentAt: nowIso(),
      error: null,
      updatedAt: nowIso(),
    });
    await db.updateLead(outreach.leadId, { status: "sent" });
    return { ok: true, outreach: updated ?? undefined };
  }

  const updated = await db.updateOutreach(outreachId, {
    status: "failed",
    error: result.error ?? "Unknown send error",
    updatedAt: nowIso(),
  });
  await db.updateLead(outreach.leadId, { status: "failed" });
  return { ok: false, outreach: updated ?? undefined, error: result.error };
}
