import type { LeadRepository } from "@/lib/db";
import { newId, nowIso } from "@/lib/id";
import { runSearch, SearchUnavailableError } from "@/lib/search";
import { generateDraft, complianceFooter, leadLooksLikeUsa, stripLegacyCompliance } from "@/lib/outreach/draft";
import { sendEmail } from "@/lib/email/sender";
import { checkSendRate, recordSend } from "@/lib/email/rate-limit";
import { env } from "@/lib/config";
import { verifyEmail } from "@/lib/email/verify";
import { FREE_MAX_LEADS_PER_RUN, getPlan } from "@/lib/plans";
import { NotFoundError, QuotaError } from "@/lib/errors";
import { ensureUsageWindow } from "@/lib/workspace";
import type {
  ContactMethod,
  ConnectedMailbox,
  CrmStage,
  EasyEmailProvider,
  CreateRunInput,
  DeliveryStatus,
  FollowUp,
  Lead,
  LeadWithOutreach,
  MailboxAgeBand,
  MailboxPublicStatus,
  MailboxVolumeBand,
  Outreach,
  PlanId,
  Run,
  ImportLeadRow,
} from "@/lib/types";
import { mailboxPublicStatus } from "@/lib/email/mailbox";

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

/** TEMP developer helper — force a plan without Stripe (local / testing only). */
export async function setWorkspacePlanDev(ctx: Ctx, planId: PlanId): Promise<void> {
  await ctx.db.updateWorkspace(ctx.workspaceId, {
    planId,
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

    // Cross-run dedupe: skip domains (and emails) already in this workspace.
    const prior = await db.listLeads();
    const knownDomains = new Set(
      prior
        .map((l) => domainKey(l.website))
        .filter((d): d is string => !!d),
    );
    const knownEmails = new Set(
      prior.flatMap((l) => l.emails.map((e) => e.toLowerCase())),
    );
    const fresh = outcome.leads.filter((l) => {
      const d = domainKey(l.website);
      if (d && knownDomains.has(d)) return false;
      if (l.emails.some((e) => knownEmails.has(e.toLowerCase()))) return false;
      return true;
    });
    const dropped = outcome.leads.length - fresh.length;

    const leads: Lead[] = fresh.map((l) => ({
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
      error:
        dropped > 0
          ? `Skipped ${dropped} duplicate domain/email already in workspace`
          : null,
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
  overrides?: { signOff?: string | null; offerNotes?: string | null },
): Promise<Outreach | null> {
  const db = ctx.db;
  const lead = await db.getLead(leadId);
  if (!lead) return null;
  const run = await db.getRun(lead.runId);
  if (!run) return null;

  const { subject, body } = generateDraft(lead, run, overrides);
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
  /** Transport that delivered (or would have, for local demo). */
  provider?: "google" | "resend" | "maileroo" | "smtp" | "demo";
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

  // List hygiene — block hard undeliverables when a verify key is configured.
  const verified = await verifyEmail(outreach.toEmail);
  if (!verified.okToSend) {
    return {
      ok: false,
      error: `Email looks undeliverable (${verified.reason ?? verified.status}). Pick another address or discard this lead.`,
    };
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
  // Always load workspace (local JSON too) so Pro mailbox + BYO Resend work in demo.
  const wsForEmail = await db.getWorkspace(ctx.workspaceId);
  const leadForLocale = await db.getLead(outreach.leadId);
  const cleanBody = stripLegacyCompliance(outreach.body);
  const result = await sendEmail(
    {
      to: outreach.toEmail,
      subject: outreach.subject,
      body:
        cleanBody +
        complianceFooter({
          physicalAddress: wsForEmail?.physicalAddress,
          includeAddress: leadForLocale ? leadLooksLikeUsa(leadForLocale) : false,
        }),
      tags: [
        { name: "lodestar_ws", value: ctx.workspaceId.slice(0, 256) },
        { name: "lodestar_outreach", value: outreachId.slice(0, 256) },
      ],
    },
    wsForEmail
      ? {
          fromName: wsForEmail.fromName,
          fromEmail: wsForEmail.fromEmail,
          replyTo: wsForEmail.replyTo,
          physicalAddress: wsForEmail.physicalAddress,
          resendApiKey: wsForEmail.resendApiKey,
          mailerooApiKey: wsForEmail.mailerooApiKey,
          easyEmailProvider: wsForEmail.easyEmailProvider,
          preferredSendPath: wsForEmail.preferredSendPath,
          connectedMailbox: wsForEmail.connectedMailbox,
        }
      : undefined,
  );

  // Production (metered): never treat demo/no-transport as a real send.
  if (result.ok && result.provider === "demo" && ctx.metered) {
    const updated = await db.updateOutreach(outreachId, {
      status: "approved",
      error:
        "No email transport configured. Add a Resend/Maileroo key in Settings → Easy, or Connect Google on Pro.",
      updatedAt: nowIso(),
    });
    return {
      ok: false,
      outreach: updated ?? undefined,
      error:
        "No email transport configured. Add a Resend/Maileroo key in Settings → Easy, or Connect Google on Pro.",
      provider: "demo",
    };
  }

  if (result.ok) {
    recordSend();
    if (result.connectedMailbox) {
      await db.updateWorkspace(ctx.workspaceId, {
        connectedMailbox: result.connectedMailbox,
        updatedAt: nowIso(),
      });
    }
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
    if (lead) {
      const existing = lead.followUps ?? [];
      const today = nowIso().slice(0, 10);
      const hasEmailSentNote = existing.some(
        (f) => f.note.trim().toLowerCase() === "email sent" && f.date === today,
      );
      let followUps = existing;
      if (!hasEmailSentNote) {
        followUps = [
          { id: newId("fu"), date: today, note: "Email sent", done: false },
          ...followUps,
        ];
      }
      // HITL sequence stubs — Day +3 / Day +7 reminders (still require approve→send).
      const hasSeq = followUps.some((f) => f.note.startsWith("Sequence ·"));
      if (!hasSeq) {
        followUps = [...followUps, sequenceFollowUp(3, 2), sequenceFollowUp(7, 3)];
      }
      crmPatch.followUps = followUps;
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
    return { ok: true, outreach: updated ?? undefined, provider: result.provider };
  }

  // Keep status "approved" so the user can fix setup and retry without re-approving.
  // Persist the provider error for the Outreach UI.
  const updated = await db.updateOutreach(outreachId, {
    status: "approved",
    error: result.error ?? "Unknown send error",
    updatedAt: nowIso(),
  });
  return {
    ok: false,
    outreach: updated ?? undefined,
    error: result.error,
    provider: result.provider,
  };
}

function domainKey(website: string | null | undefined): string | null {
  if (!website) return null;
  try {
    const host = new URL(
      website.startsWith("http") ? website : `https://${website}`,
    ).hostname
      .replace(/^www\./, "")
      .toLowerCase();
    return host || null;
  } catch {
    return website.replace(/^https?:\/\//i, "").replace(/^www\./, "").split("/")[0]?.toLowerCase() || null;
  }
}

function sequenceFollowUp(daysFromNow: number, step: number): FollowUp {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  const iso = d.toISOString().slice(0, 10);
  return {
    id: newId("fu"),
    date: iso,
    note: `Sequence · Follow-up #${step} (day +${daysFromNow}) — draft & approve in Outreach before sending`,
    done: false,
  };
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
    mailerooApiKey?: string | null;
    easyEmailProvider?: EasyEmailProvider;
    preferredSendPath?: "easy" | "pro" | null;
  },
): Promise<void> {
  const updated = await ctx.db.updateWorkspace(ctx.workspaceId, {
    ...patch,
    updatedAt: nowIso(),
  });
  if (!updated) {
    throw new NotFoundError(
      "Workspace not found — sign in again, then re-save Settings.",
    );
  }
}

/** Public mailbox status for Settings (no tokens). */
export async function getMailboxStatus(ctx: Ctx): Promise<MailboxPublicStatus> {
  const ws = await ctx.db.getWorkspace(ctx.workspaceId);
  return mailboxPublicStatus(ws);
}

/** Persist a newly connected mailbox after OAuth callback. */
export async function connectMailbox(
  ctx: Ctx,
  mailbox: ConnectedMailbox,
): Promise<void> {
  const existing = await ctx.db.getWorkspace(ctx.workspaceId);
  await ctx.db.updateWorkspace(ctx.workspaceId, {
    connectedMailbox: mailbox,
    // Prefer mailbox email as From only when user hasn't set one yet.
    ...(existing?.fromEmail?.trim() ? {} : { fromEmail: mailbox.email }),
    preferredSendPath: "pro",
    updatedAt: nowIso(),
  });
}

/** Disconnect Pro mailbox (tokens wiped). Easy Resend path unchanged. */
export async function disconnectMailbox(ctx: Ctx): Promise<void> {
  await ctx.db.updateWorkspace(ctx.workspaceId, {
    connectedMailbox: null,
    updatedAt: nowIso(),
  });
}

/** Soft warmup self-report on an already-connected mailbox. */
export async function updateMailboxWarmupProfile(
  ctx: Ctx,
  patch: { ageBand?: MailboxAgeBand | null; volumeBand?: MailboxVolumeBand | null },
): Promise<MailboxPublicStatus> {
  const ws = await ctx.db.getWorkspace(ctx.workspaceId);
  if (!ws?.connectedMailbox) {
    return mailboxPublicStatus(ws);
  }
  const next: ConnectedMailbox = {
    ...ws.connectedMailbox,
    ageBand: patch.ageBand !== undefined ? patch.ageBand : ws.connectedMailbox.ageBand,
    volumeBand:
      patch.volumeBand !== undefined ? patch.volumeBand : ws.connectedMailbox.volumeBand,
  };
  await ctx.db.updateWorkspace(ctx.workspaceId, {
    connectedMailbox: next,
    updatedAt: nowIso(),
  });
  return mailboxPublicStatus({ ...ws, connectedMailbox: next });
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

/** Row shape for CSV/Excel import (flexible mapping happens client-side). */
export type { ImportLeadRow };

/**
 * Import leads from a spreadsheet (no web search). Creates an "import" run,
 * dedupes against existing workspace domains/emails, optional light drafts.
 */
export async function importLeads(
  ctx: Ctx,
  rows: ImportLeadRow[],
): Promise<{ imported: number; skipped: number; run: Run }> {
  const { db } = ctx;
  const ws = await db.getWorkspace(ctx.workspaceId);
  if (ws) await ensureUsageWindow(db, ws);

  const cleaned = rows
    .map((r) => ({
      company: (r.company ?? "").trim(),
      website: r.website?.trim() || null,
      emails: (r.emails ?? []).map((e) => e.trim()).filter(Boolean),
      phones: (r.phones ?? []).map((p) => p.trim()).filter(Boolean),
      contactName: r.contactName?.trim() || null,
      location: r.location?.trim() || null,
    }))
    .filter((r) => r.company.length > 0 || r.emails.length > 0);

  if (cleaned.length === 0) {
    throw new Error("No usable rows — need at least a company name or email.");
  }

  if (ctx.metered) {
    const fresh = ws ? await db.getWorkspace(ctx.workspaceId) : null;
    if (fresh) {
      const plan = getPlan(fresh.planId);
      const remaining = Math.max(0, plan.leadCreditsPerMonth - fresh.leadsUsedThisMonth);
      if (cleaned.length > remaining) {
        throw new QuotaError({
          kind: "leads",
          planId: fresh.planId,
          limit: plan.leadCreditsPerMonth,
          used: fresh.leadsUsedThisMonth,
          message: `Import would use ${cleaned.length} leads but only ${remaining} remain this month.`,
        });
      }
    }
  }

  const run: Run = {
    id: newId("run"),
    workspaceId: ctx.workspaceId,
    niche: "Imported list",
    location: null,
    offerNotes: null,
    senderName: null,
    status: "running",
    mode: "live",
    provider: "import",
    leadCount: 0,
    error: null,
    createdAt: nowIso(),
    completedAt: null,
  };
  await db.createRun(run);

  try {
    const prior = await db.listLeads();
    const knownDomains = new Set(
      prior.map((l) => domainKey(l.website)).filter((d): d is string => !!d),
    );
    const knownEmails = new Set(
      prior.flatMap((l) => l.emails.map((e) => e.toLowerCase())),
    );

    const fresh = cleaned.filter((r) => {
      const d = domainKey(r.website);
      if (d && knownDomains.has(d)) return false;
      if (r.emails.some((e) => knownEmails.has(e.toLowerCase()))) return false;
      return true;
    });
    const skipped = cleaned.length - fresh.length;

    const leads: Lead[] = fresh.map((r) => {
      const company =
        r.company ||
        r.emails[0]?.split("@")[1]?.split(".")[0] ||
        "Unknown company";
      const website =
        r.website ||
        (r.emails[0]?.includes("@")
          ? `https://${r.emails[0].split("@")[1]}`
          : null);
      return {
        id: newId("lead"),
        workspaceId: ctx.workspaceId,
        runId: run.id,
        company: company.replace(/^./, (c) => c.toUpperCase()),
        website,
        emails: r.emails,
        phones: r.phones,
        contactName: r.contactName,
        location: r.location,
        aboutBlurb: null,
        tags: ["imported"],
        fitScore: r.emails.length ? 55 : 40,
        fitReasons: [
          "Imported from your file",
          r.emails.length ? "Has email on file" : "No email — add one before send",
        ],
        sourceUrl: website || "import",
        status: "new",
        crmStage: "new",
        contactMethod: null,
        notes: null,
        followUps: [],
        createdAt: nowIso(),
      };
    });

    await db.createLeads(leads);

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
    await recordLeadUsage(ctx, leads.length);

    const updated = await db.updateRun(run.id, {
      status: "complete",
      leadCount: leads.length,
      error:
        skipped > 0
          ? `Skipped ${skipped} duplicate domain/email already in workspace`
          : null,
      completedAt: nowIso(),
    });

    return { imported: leads.length, skipped, run: updated ?? run };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.updateRun(run.id, {
      status: "failed",
      error: message,
      completedAt: nowIso(),
    });
    throw err;
  }
}

/**
 * Generate a default outreach pitch from the user's company website (Workers AI).
 * Falls back to a short heuristic pitch when AI is unavailable but the page loads.
 */
export async function generatePitchFromWebsite(
  _ctx: Ctx,
  input: { website: string; companyName?: string },
): Promise<{ pitch: string }> {
  let url = input.website.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    new URL(url);
  } catch {
    throw new Error("Enter a valid website URL.");
  }

  const { fetchPublicPageText } = await import("@/lib/ai/fetch-page");
  const { generateDefaultPitch } = await import("@/lib/ai/generate");
  const { workersAiAvailable } = await import("@/lib/ai/workers-ai");

  let pageText: string;
  try {
    pageText = await fetchPublicPageText(url);
  } catch (err) {
    throw new Error(
      err instanceof Error
        ? err.message
        : "Could not fetch that website. Check the URL and try again.",
    );
  }

  const companyName = input.companyName?.trim() || undefined;

  if (await workersAiAvailable()) {
    const pitch = await generateDefaultPitch({
      website: url,
      companyName,
      pageText,
    });
    if (pitch) return { pitch };
  }

  const heuristic = heuristicPitchFromPage(pageText, companyName);
  if (heuristic) return { pitch: heuristic };

  throw new Error(
    "Could not generate a pitch from that site. Try again or write one manually.",
  );
}

/** Last-resort pitch when Workers AI is down — first useful sentences from the page. */
function heuristicPitchFromPage(pageText: string, companyName?: string): string | null {
  const cleaned = pageText
    .replace(/\s+/g, " ")
    .replace(/#{1,6}\s*/g, "")
    .trim();
  if (cleaned.length < 60) return null;
  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(
      (s) =>
        s.length > 40 &&
        s.length < 220 &&
        !/cookie|privacy|sign in|log in|copyright|all rights/i.test(s),
    );
  const pick = sentences.slice(0, 2).join(" ");
  if (!pick) return null;
  const who = companyName ? `At ${companyName}, ` : "We ";
  const body = pick.replace(/^(we|our company|at .+?)\s+/i, "");
  return `${who}${body.charAt(0).toLowerCase()}${body.slice(1)}`.slice(0, 800);
}
