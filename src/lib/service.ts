import type { LeadRepository } from "@/lib/db";
import { newId, nowIso } from "@/lib/id";
import { runSearch, SearchUnavailableError } from "@/lib/search";
import { generateDraft, complianceFooter, leadLooksLikeUsa } from "@/lib/outreach/draft";
import { sendEmail } from "@/lib/email/sender";
import { checkSendRate, recordSend } from "@/lib/email/rate-limit";
import { env } from "@/lib/config";
import { FREE_MAX_LEADS_PER_RUN, getPlan } from "@/lib/plans";
import { QuotaError } from "@/lib/errors";
import { ensureUsageWindow } from "@/lib/workspace";
import type {
  ContactMethod,
  CrmStage,
  CreateRunInput,
  DeliveryStatus,
  FollowUp,
  Lead,
  LeadWithOutreach,
  Outreach,
  PlanId,
  Run,
} from "@/lib/types";

/**
 * Application services. API routes stay thin and call into these functions,
 * which are the single place that coordinates the repository, search, drafting,
 * and sending. Keeping this framework-agnostic makes it reusable + testable.
 *
 * Every service function takes a `Ctx` describing the caller's workspace + the
 * (already workspace-scoped) repository. Plan/quota enforcement lives here and
 * ONLY here (constitution Art. II + commercialization hard-constraint 4).
 * `metered` is false for local dev / demo (JsonStore) → no quota checks,
 * keeping zero-key mode fully free and unmetered.
 */
export interface Ctx {
  db: LeadRepository;
  workspaceId: string;
  metered: boolean;
}

/**
 * Resolve how many leads this run may return, enforcing Free-tier per-run caps
 * and remaining monthly credits. Throws QuotaError when nothing is left.
 */
async function resolveRunLeadLimit(
  ctx: Ctx,
  requested?: number | null,
): Promise<number> {
  const hardCap = env.maxLeadsPerRun();
  let planCap = hardCap;
  let remaining = Number.POSITIVE_INFINITY;
  let planId: PlanId = "free";

  if (ctx.metered) {
    const ws = await ctx.db.getWorkspace(ctx.workspaceId);
    if (ws) {
      const fresh = await ensureUsageWindow(ctx.db, ws);
      const plan = getPlan(fresh.planId);
      planId = fresh.planId;
      planCap = plan.id === "free" ? Math.min(hardCap, FREE_MAX_LEADS_PER_RUN) : hardCap;
      remaining = plan.leadCreditsPerMonth - fresh.leadsUsedThisMonth;
      if (remaining <= 0) {
        throw new QuotaError({
          kind: "leads",
          planId: fresh.planId,
          limit: plan.leadCreditsPerMonth,
          used: fresh.leadsUsedThisMonth,
        });
      }
    }
  }

  const want = requested && requested > 0 ? Math.floor(requested) : Math.min(10, planCap);
  if (want > planCap) {
    throw new QuotaError({
      kind: "leads",
      planId,
      limit: planCap,
      used: 0,
      message: `Free plan allows up to ${planCap} leads per search. Upgrade to request more.`,
    });
  }

  return Math.max(1, Math.min(want, planCap, remaining, hardCap));
}

async function recordLeadUsage(ctx: Ctx, count: number): Promise<void> {
  // Track locally too so usage bars move in `npm run dev` (enforcement still
  // gated on ctx.metered in resolveRunLeadLimit).
  if (count <= 0) return;
  const ws = await ctx.db.getWorkspace(ctx.workspaceId);
  if (!ws) return;
  await ctx.db.updateWorkspace(ctx.workspaceId, {
    leadsUsedThisMonth: ws.leadsUsedThisMonth + count,
    updatedAt: nowIso(),
  });
}

/** TEMP developer helper — zero monthly lead/send counters for the workspace. */
export async function resetWorkspaceUsage(ctx: Ctx): Promise<void> {
  await ctx.db.updateWorkspace(ctx.workspaceId, {
    leadsUsedThisMonth: 0,
    sendsUsedThisMonth: 0,
    updatedAt: nowIso(),
  });
}

export async function createAndRunSearch(
  ctx: Ctx,
  input: CreateRunInput,
): Promise<Run> {
  // Quota + per-run cap BEFORE creating the run, so an over-limit request
  // doesn't leave a stray failed run behind and can surface a clean 402.
  const maxLeads = await resolveRunLeadLimit(ctx, input.maxLeads);
  const searchInput: CreateRunInput = { ...input, maxLeads };

  const db = ctx.db;
  const run: Run = {
    id: newId("run"),
    workspaceId: ctx.workspaceId,
    niche: input.niche.trim(),
    location: input.location?.trim() || null,
    offerNotes: input.offerNotes?.trim() || null,
    senderName: input.senderName?.trim() || null,
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
    const outcome = await runSearch(searchInput);
    const leads: Lead[] = outcome.leads.map((l) => ({
      id: newId("lead"),
      workspaceId: ctx.workspaceId,
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
      crmStage: "new",
      contactMethod: null,
      notes: null,
      followUps: [],
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
      workspaceId: ctx.workspaceId,
      leadId: lead.id,
      runId: run.id,
      toEmail: lead.emails[0] ?? null,
      ...generateDraft(lead, run),
      status: "draft",
      deliveryStatus: "unknown",
      sentAt: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    }));
    await Promise.all(drafts.map((d) => db.upsertOutreach(d)));
    await Promise.all(leads.map((l) => db.updateLead(l.id, { status: "queued" })));

    // Enriched leads consume lead credits (1 credit = 1 lead — business-plan §6).
    await recordLeadUsage(ctx, leads.length);

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
    await db.updateRun(run.id, {
      status: "failed",
      error: message,
      completedAt: nowIso(),
    });
    // Surface "no provider / use Load demo" as a clean client error, not a
    // successful 201 with an empty board wiping the previous run.
    if (err instanceof SearchUnavailableError) throw err;
    throw err instanceof Error ? err : new Error(message);
  }
}

export async function clearBoard(ctx: Ctx): Promise<void> {
  await ctx.db.clearWorkspaceData();
}

export async function getRunWithLeads(
  ctx: Ctx,
  runId: string,
): Promise<{ run: Run; leads: LeadWithOutreach[] } | null> {
  const run = await ctx.db.getRun(runId);
  if (!run) return null;
  const leads = await ctx.db.listLeads(runId);
  const withOutreach = await attachOutreach(ctx.db, leads);
  return { run, leads: withOutreach };
}

export async function getLatestBoard(ctx: Ctx): Promise<{
  run: Run | null;
  leads: LeadWithOutreach[];
}> {
  const runs = await ctx.db.listRuns();
  // Prefer the latest completed run so a failed search doesn't blank the board.
  const run = runs.find((r) => r.status === "complete") ?? runs[0] ?? null;
  if (!run) return { run: null, leads: [] };
  const leads = await ctx.db.listLeads(run.id);
  return { run, leads: await attachOutreach(ctx.db, leads) };
}

async function attachOutreach(
  db: LeadRepository,
  leads: Lead[],
): Promise<LeadWithOutreach[]> {
  const all = await db.listOutreach();
  const byLead = new Map(all.map((o) => [o.leadId, o]));
  return leads.map((l) => ({ ...l, outreach: byLead.get(l.id) ?? null }));
}

/** Draft (or re-draft) outreach for a lead and move it into the approval queue. */
export async function draftOutreach(
  ctx: Ctx,
  leadId: string,
): Promise<Outreach | null> {
  const db = ctx.db;
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
        workspaceId: ctx.workspaceId,
        leadId,
        runId: lead.runId,
        toEmail: lead.emails[0] ?? null,
        subject,
        body,
        status: "draft",
        deliveryStatus: "unknown",
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
  ctx: Ctx,
  outreachId: string,
  patch: { subject?: string; body?: string; toEmail?: string | null },
): Promise<Outreach | null> {
  return ctx.db.updateOutreach(outreachId, { ...patch, updatedAt: nowIso() });
}

export async function setOutreachDecision(
  ctx: Ctx,
  outreachId: string,
  decision: "approved" | "rejected",
): Promise<Outreach | null> {
  const db = ctx.db;
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
 * Send a single APPROVED outreach. Enforces (in order):
 *  - explicit per-lead approval (status must be "approved") — Art. I.1
 *  - a valid recipient
 *  - monthly send quota (metered workspaces only) — throws QuotaError → 402
 *  - rate limiting
 * This is the only path that actually dispatches email. The quota check is an
 * ADDITIONAL gate; it never bypasses the approval requirement.
 */
export async function sendApprovedOutreach(
  ctx: Ctx,
  outreachId: string,
): Promise<SendOutcome> {
  const db = ctx.db;
  const outreach = await db.getOutreach(outreachId);
  if (!outreach) return { ok: false, error: "Outreach not found" };

  if (outreach.status !== "approved") {
    return { ok: false, error: "Outreach must be approved before sending" };
  }
  if (!outreach.toEmail) {
    return { ok: false, error: "No recipient email on this lead" };
  }

  // Send quota (metered only). Throws QuotaError → the route returns 402.
  if (ctx.metered) {
    const ws = await db.getWorkspace(ctx.workspaceId);
    if (ws) {
      const fresh = await ensureUsageWindow(db, ws);
      const plan = getPlan(fresh.planId);
      if (fresh.sendsUsedThisMonth >= plan.sendsPerMonth) {
        throw new QuotaError({
          kind: "sends",
          planId: fresh.planId,
          limit: plan.sendsPerMonth,
          used: fresh.sendsUsedThisMonth,
        });
      }
    }
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

  // Pass workspace email identity overrides so each tenant's outreach uses
  // their own from-name, from-email etc. (configured in Settings → Sending).
  const wsForEmail = ctx.metered ? await db.getWorkspace(ctx.workspaceId) : null;
  const leadForLocale = await db.getLead(outreach.leadId);
  const result = await sendEmail(
    {
      to: outreach.toEmail,
      subject: outreach.subject,
      body:
        outreach.body +
        complianceFooter({
          physicalAddress: wsForEmail?.physicalAddress,
          includeAddress: leadForLocale ? leadLooksLikeUsa(leadForLocale) : false,
        }),
    },
    wsForEmail
      ? {
          fromName: wsForEmail.fromName,
          fromEmail: wsForEmail.fromEmail,
          replyTo: wsForEmail.replyTo,
          physicalAddress: wsForEmail.physicalAddress,
          resendApiKey: wsForEmail.resendApiKey,
        }
      : undefined,
  );

  if (result.ok) {
    recordSend();
    const updated = await db.updateOutreach(outreachId, {
      status: "sent",
      deliveryStatus: "sent",
      sentAt: nowIso(),
      error: null,
      updatedAt: nowIso(),
    });
    // Auto-advance CRM stage to "contacted" via email on first send.
    const lead = await db.getLead(outreach.leadId);
    const crmPatch: Partial<Lead> = { status: "sent" };
    if (lead && lead.crmStage === "new") {
      crmPatch.crmStage = "contacted";
      crmPatch.contactMethod = "email";
    }
    await db.updateLead(outreach.leadId, crmPatch);
    // Track sends locally too (bars); quota enforcement stays metered-only above.
    const ws = await db.getWorkspace(ctx.workspaceId);
    if (ws) {
      await db.updateWorkspace(ctx.workspaceId, {
        sendsUsedThisMonth: ws.sendsUsedThisMonth + 1,
        updatedAt: nowIso(),
      });
    }
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

/** Manual delivery outcome stub (bounce / reply). Webhooks can call the same path later. */
export async function setOutreachDeliveryStatus(
  ctx: Ctx,
  outreachId: string,
  deliveryStatus: DeliveryStatus,
): Promise<Outreach | null> {
  const outreach = await ctx.db.updateOutreach(outreachId, {
    deliveryStatus,
    updatedAt: nowIso(),
  });
  if (!outreach) return null;

  // Convenience: marking replied advances CRM into conversation when still early.
  if (deliveryStatus === "replied") {
    const lead = await ctx.db.getLead(outreach.leadId);
    if (lead && (lead.crmStage === "new" || lead.crmStage === "contacted")) {
      await ctx.db.updateLead(outreach.leadId, { crmStage: "in_conversation" });
    }
  }
  return outreach;
}

/** Update per-workspace email sending identity (from name, email, reply-to, etc.). */
export async function updateWorkspaceEmailSettings(
  ctx: Ctx,
  patch: {
    fromName?: string | null;
    fromEmail?: string | null;
    replyTo?: string | null;
    physicalAddress?: string | null;
    resendApiKey?: string | null;
  },
): Promise<void> {
  await ctx.db.updateWorkspace(ctx.workspaceId, { ...patch, updatedAt: nowIso() });
}

/** Update user-managed CRM fields on a lead (stage, contact method, notes, follow-ups). */
export async function updateLeadCrm(
  ctx: Ctx,
  leadId: string,
  patch: {
    crmStage?: CrmStage;
    contactMethod?: ContactMethod | null;
    notes?: string | null;
    followUps?: FollowUp[];
  },
): Promise<Lead | null> {
  return ctx.db.updateLead(leadId, patch);
}
