import type { LeadRepository } from "@/lib/db";
import { newId, nowIso } from "@/lib/id";
import { runSearch, SearchUnavailableError } from "@/lib/search";
import { generateDraft, stripLegacyCompliance } from "@/lib/outreach/draft";
import {
  mapPool,
  personalizeDraftForLead,
  scoreLeadPitchFit,
} from "@/lib/ai/generate";
import {
  outreachLangFromLocation,
  type OutreachLang,
} from "@/lib/outreach/locale";
import { sendEmail } from "@/lib/email/sender";
import { checkSendRate, recordSend } from "@/lib/email/rate-limit";
import { env } from "@/lib/config";
import { verifyEmail } from "@/lib/email/verify";
import { FREE_MAX_LEADS_PER_RUN, getPlan } from "@/lib/plans";
import { NotFoundError, QuotaError } from "@/lib/errors";
import { ensureUsageWindow } from "@/lib/workspace";
import type {
  Board,
  BoardSummary,
  ContactMethod,
  ConnectedMailbox,
  CrmStage,
  EasyEmailProvider,
  CreateRunInput,
  DashboardStats,
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
import { scoreImportedLead } from "@/lib/fit-score";
import { aiAvailable } from "@/lib/ai/chat";
import { fetchPublicPageText } from "@/lib/ai/fetch-page";
import { extractBlurb, extractLocation, extractPhones } from "@/lib/search/enrich";

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
 * Ensure the workspace has a Default board and back-fill any leads/runs that
 * predate boards (empty boardId). Idempotent — safe on every board read.
 * Also collapses duplicate defaults (race before unique index / migration 0012).
 */
export async function ensureDefaultBoard(ctx: Ctx): Promise<Board> {
  const { db } = ctx;
  const boards = await db.listBoards();
  const defaults = boards
    .filter((b) => b.isDefault)
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    );
  let def = defaults[0] ?? null;

  if (!def) {
    const now = nowIso();
    try {
      def = await db.createBoard({
        id: newId("board"),
        workspaceId: ctx.workspaceId,
        name: "Default",
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      });
    } catch {
      // Concurrent create (unique index) — re-read the winner.
      const again = (await db.listBoards()).filter((b) => b.isDefault);
      def = again.sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      )[0]!;
    }
  } else if (defaults.length > 1) {
    for (const extra of defaults.slice(1)) {
      const [extraLeads, extraRuns] = await Promise.all([
        db.listLeads({ boardId: extra.id }),
        db.listRuns(),
      ]);
      await Promise.all([
        ...extraLeads.map((l) => db.updateLead(l.id, { boardId: def!.id })),
        ...extraRuns
          .filter((r) => r.boardId === extra.id)
          .map((r) => db.updateRun(r.id, { boardId: def!.id })),
      ]);
      await db.updateBoard(extra.id, { isDefault: false, updatedAt: nowIso() });
      await db.deleteBoard(extra.id);
    }
  }

  const [leads, runs] = await Promise.all([db.listLeads(), db.listRuns()]);
  const orphanLeads = leads.filter((l) => !l.boardId);
  const orphanRuns = runs.filter((r) => !r.boardId);
  await Promise.all([
    ...orphanLeads.map((l) => db.updateLead(l.id, { boardId: def!.id })),
    ...orphanRuns.map((r) => db.updateRun(r.id, { boardId: def!.id })),
  ]);
  return def;
}

export async function listBoardSummaries(ctx: Ctx): Promise<BoardSummary[]> {
  await ensureDefaultBoard(ctx);
  const [boards, leads] = await Promise.all([
    ctx.db.listBoards(),
    ctx.db.listLeads(),
  ]);
  return boards.map((b) => {
    const mine = leads.filter((l) => l.boardId === b.id);
    return {
      ...b,
      leadCount: mine.length,
      contactedCount: mine.filter(
        (l) =>
          l.crmStage === "contacted" ||
          l.crmStage === "in_conversation" ||
          l.crmStage === "closed",
      ).length,
      sentCount: mine.filter((l) => l.status === "sent").length,
      closedCount: mine.filter((l) => l.crmStage === "closed").length,
    };
  });
}

export async function createBoard(
  ctx: Ctx,
  name: string,
): Promise<Board> {
  await ensureDefaultBoard(ctx);
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Board name is required");
  if (trimmed.length > 80) throw new Error("Board name is too long");
  const now = nowIso();
  return ctx.db.createBoard({
    id: newId("board"),
    workspaceId: ctx.workspaceId,
    name: trimmed,
    isDefault: false,
    createdAt: now,
    updatedAt: now,
  });
}

export async function renameBoard(
  ctx: Ctx,
  id: string,
  name: string,
): Promise<Board> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Board name is required");
  const existing = await ctx.db.getBoard(id);
  if (!existing) throw new NotFoundError("Board not found");
  const updated = await ctx.db.updateBoard(id, {
    name: trimmed,
    updatedAt: nowIso(),
  });
  if (!updated) throw new NotFoundError("Board not found");
  return updated;
}

/**
 * Delete a non-default board. Leads move to the Default board.
 */
export async function deleteBoard(ctx: Ctx, id: string): Promise<void> {
  const existing = await ctx.db.getBoard(id);
  if (!existing) throw new NotFoundError("Board not found");
  if (existing.isDefault) throw new Error("Cannot delete the Default board");
  const def = await ensureDefaultBoard(ctx);
  const leads = await ctx.db.listLeads({ boardId: id });
  const runs = (await ctx.db.listRuns()).filter((r) => r.boardId === id);
  await Promise.all([
    ...leads.map((l) => ctx.db.updateLead(l.id, { boardId: def.id })),
    ...runs.map((r) => ctx.db.updateRun(r.id, { boardId: def.id })),
  ]);
  await ctx.db.deleteBoard(id);
}

/** Resolve a boardId or fall back to Default (optionally create by name). */
export async function resolveBoardId(
  ctx: Ctx,
  opts?: { boardId?: string | null; newBoardName?: string | null },
): Promise<string> {
  if (opts?.newBoardName?.trim()) {
    const created = await createBoard(ctx, opts.newBoardName);
    return created.id;
  }
  if (opts?.boardId) {
    const b = await ctx.db.getBoard(opts.boardId);
    if (b) return b.id;
  }
  const def = await ensureDefaultBoard(ctx);
  return def.id;
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
  const boardId = await resolveBoardId(ctx, { boardId: input.boardId });

  const db = ctx.db;
  const run: Run = {
    id: newId("run"),
    workspaceId: ctx.workspaceId,
    boardId,
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
      boardId,
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
      customFields: {},
      createdAt: nowIso(),
    }));
    await db.createLeads(leads);

    // Auto-draft only when Search explicitly selected an outreach profile.
    const shouldDraft = input.autoDraft === true;
    if (shouldDraft) {
      const now = nowIso();
      const aiPersonalize = Boolean(input.aiPersonalize);
      const draftOverrides = {
        signOff: input.senderName?.trim() || null,
        offerNotes: input.offerNotes?.trim() || null,
        subjectTemplate: input.subjectTemplate?.trim() || null,
        staticBody: aiPersonalize ? true : input.staticBody !== false,
        aiPersonalize,
      };
      const drafts: Outreach[] = await mapPool(leads, 3, async (lead) => {
        let { subject, body } = generateDraft(lead, run, draftOverrides);
        if (aiPersonalize) {
          const varied = await personalizeDraftForLead({
            company: lead.company,
            contactName: lead.contactName,
            location: lead.location,
            aboutBlurb: lead.aboutBlurb,
            website: lead.website,
            lang: outreachLangFromLocation(lead.location),
            subject,
            body,
          });
          if (varied) {
            subject = varied.subject;
            body = varied.body;
          }
        }
        return {
          id: newId("out"),
          workspaceId: ctx.workspaceId,
          leadId: lead.id,
          runId: run.id,
          toEmail: lead.emails[0] ?? null,
          subject,
          body,
          status: "draft" as const,
          deliveryStatus: "unknown" as const,
          sentAt: null,
          error: null,
          createdAt: now,
          updatedAt: now,
        };
      });
      await Promise.all(drafts.map((d) => db.upsertOutreach(d)));
      await Promise.all(leads.map((l) => db.updateLead(l.id, { status: "queued" })));
    }

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
  const leads = await ctx.db.listLeads({ runId });
  const withOutreach = await attachOutreach(ctx.db, leads);
  return { run, leads: withOutreach };
}

/**
 * Studio board view. `boardId` null/"all" → all leads; otherwise filter.
 * Still returns the latest completed run for search-context chrome.
 */
export async function getLatestBoard(
  ctx: Ctx,
  boardId?: string | null,
): Promise<{
  run: Run | null;
  leads: LeadWithOutreach[];
  boards: BoardSummary[];
  activeBoardId: string | null;
}> {
  await ensureDefaultBoard(ctx);
  const boards = await listBoardSummaries(ctx);
  const active =
    boardId && boardId !== "all" && boards.some((b) => b.id === boardId)
      ? boardId
      : null;

  const runs = await ctx.db.listRuns();
  const run =
    (active
      ? runs.find((r) => r.boardId === active && r.status === "complete")
      : null) ??
    runs.find((r) => r.status === "complete") ??
    runs[0] ??
    null;

  const leads = await ctx.db.listLeads(active ? { boardId: active } : undefined);
  return {
    run,
    leads: await attachOutreach(ctx.db, leads),
    boards,
    activeBoardId: active,
  };
}

export async function getDashboardStats(
  ctx: Ctx,
  boardId?: string | null,
): Promise<DashboardStats> {
  await ensureDefaultBoard(ctx);
  const boards = await listBoardSummaries(ctx);
  const active =
    boardId && boardId !== "all" && boards.some((b) => b.id === boardId)
      ? boardId
      : null;

  const [allLeads, runs, outreach] = await Promise.all([
    ctx.db.listLeads(active ? { boardId: active } : undefined),
    ctx.db.listRuns(),
    ctx.db.listOutreach(),
  ]);

  const leadIds = new Set(allLeads.map((l) => l.id));
  const scopedOutreach = active
    ? outreach.filter((o) => leadIds.has(o.leadId))
    : outreach;

  const byCrmStage: Record<CrmStage, number> = {
    new: 0,
    contacted: 0,
    in_conversation: 0,
    closed: 0,
    not_interested: 0,
  };
  const byStatus: Record<string, number> = {};
  for (const l of allLeads) {
    byCrmStage[l.crmStage] = (byCrmStage[l.crmStage] ?? 0) + 1;
    byStatus[l.status] = (byStatus[l.status] ?? 0) + 1;
  }

  const avgFitScore =
    allLeads.length === 0
      ? 0
      : Math.round(allLeads.reduce((s, l) => s + l.fitScore, 0) / allLeads.length);

  return {
    totalLeads: allLeads.length,
    byCrmStage,
    byStatus,
    sentCount: scopedOutreach.filter((o) => o.status === "sent").length,
    draftedCount: scopedOutreach.filter(
      (o) => o.status === "draft" || o.status === "approved",
    ).length,
    boards,
    recentRuns: runs.slice(0, 8),
    avgFitScore,
    activeBoardId: active,
  };
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
  overrides?: {
    signOff?: string | null;
    offerNotes?: string | null;
    subjectTemplate?: string | null;
    staticBody?: boolean;
    aiPersonalize?: boolean;
    forceLang?: OutreachLang;
  },
): Promise<Outreach | null> {
  const db = ctx.db;
  const lead = await db.getLead(leadId);
  if (!lead) return null;
  const run = await db.getRun(lead.runId);
  if (!run) return null;

  const aiPersonalize = Boolean(overrides?.aiPersonalize);
  const draftLang =
    overrides?.forceLang ?? outreachLangFromLocation(lead.location);
  const draftOverrides = {
    ...overrides,
    forceLang: draftLang,
    staticBody: aiPersonalize ? true : overrides?.staticBody !== false,
    aiPersonalize,
  };
  let { subject, body } = generateDraft(lead, run, draftOverrides);
  if (aiPersonalize) {
    const varied = await personalizeDraftForLead({
      company: lead.company,
      contactName: lead.contactName,
      location: lead.location,
      aboutBlurb: lead.aboutBlurb,
      website: lead.website,
      lang: draftLang,
      subject,
      body,
    });
    if (varied) {
      subject = varied.subject;
      body = varied.body;
    }
  }
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

  // List hygiene — Zeruh verify at send only (not on enrich). Blocks hard
  // undeliverables when a verify key is configured and the workspace opted in.
  const wsForVerify = await db.getWorkspace(ctx.workspaceId);
  const verifyOn = wsForVerify?.emailVerifyEnabled !== false;
  if (verifyOn) {
    const verified = await verifyEmail(outreach.toEmail);
    if (!verified.okToSend) {
      return {
        ok: false,
        error: `Email looks undeliverable (${verified.reason ?? verified.status}). Pick another address or discard this lead.`,
      };
    }
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
  const cleanBody = stripLegacyCompliance(outreach.body);
  const result = await sendEmail(
    {
      to: outreach.toEmail,
      subject: outreach.subject,
      body: cleanBody,
      tags: [
        { name: "leadify_ws", value: ctx.workspaceId.slice(0, 256) },
        { name: "leadify_outreach", value: outreachId.slice(0, 256) },
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
    if (lead) {
      if (lead.crmStage === "new") crmPatch.crmStage = "contacted";
      if (!lead.contactMethod) crmPatch.contactMethod = "email";
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
  if (!website || /\[object\s+Object\]/i.test(website)) return null;
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
    emailVerifyEnabled?: boolean;
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

/** Permanently remove a lead and its outreach. */
export async function deleteLead(ctx: Ctx, leadId: string): Promise<boolean> {
  const lead = await ctx.db.getLead(leadId);
  if (!lead) return false;
  return ctx.db.deleteLead(leadId);
}

/**
 * Bulk-delete leads. Also aborts any in-flight import runs so a leftover CSV
 * upload can’t recreate rows after the user cleared the board.
 */
export async function deleteLeads(
  ctx: Ctx,
  leadIds: string[],
): Promise<{ deleted: number }> {
  const ids = [...new Set(leadIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return { deleted: 0 };
  await cancelRunningImportRuns(ctx);
  const deleted = await ctx.db.deleteLeads(ids);
  return { deleted };
}

/** Mark every running import as failed so late chunks stop writing. */
export async function cancelRunningImportRuns(ctx: Ctx): Promise<number> {
  const runs = await ctx.db.listRuns();
  let n = 0;
  for (const r of runs) {
    if (r.provider !== "import" || r.status !== "running") continue;
    await ctx.db.updateRun(r.id, {
      status: "failed",
      error: "Cancelled — leads were deleted while import was still running",
      completedAt: nowIso(),
    });
    n++;
  }
  return n;
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
    customFields?: Record<string, string>;
  },
): Promise<Lead | null> {
  const lead = await ctx.db.getLead(leadId);
  if (!lead) return null;

  const next: typeof patch = { ...patch };

  // When the user explicitly sets how they contacted, journal a follow-up note.
  if (
    patch.contactMethod &&
    patch.contactMethod !== lead.contactMethod
  ) {
    const note = contactMethodFollowUpNote(patch.contactMethod);
    const today = nowIso().slice(0, 10);
    const existing = patch.followUps ?? lead.followUps ?? [];
    const already = existing.some(
      (f) => f.note.trim().toLowerCase() === note.toLowerCase() && f.date === today,
    );
    if (!already) {
      next.followUps = [
        { id: newId("fu"), date: today, note, done: false },
        ...existing,
      ];
    }
    if (!patch.crmStage && lead.crmStage === "new") {
      next.crmStage = "contacted";
    }
  }

  return ctx.db.updateLead(leadId, next);
}

function contactMethodFollowUpNote(method: ContactMethod): string {
  if (method === "email") return "Contacted by email";
  if (method === "phone") return "Contacted by phone";
  return "Contacted via contact form";
}

/** Row shape for CSV/Excel import (flexible mapping happens client-side). */
export type { ImportLeadRow };

/**
 * Import leads from a spreadsheet onto a board (ADR 0014).
 * Supports chunked uploads via `runId` so the client can show progress.
 * Does not auto-draft (keeps import fast); draft from Outreach / Pipeline.
 */
export async function importLeads(
  ctx: Ctx,
  rows: ImportLeadRow[],
  opts?: {
    boardId?: string | null;
    newBoardName?: string | null;
    /** Continue an in-progress import run (chunked client uploads). */
    runId?: string | null;
    /** Mark the run complete after this chunk (default true). */
    finalize?: boolean;
    /** Active profile pitch — used for fit scoring (not Firecrawl-heavy). */
    offerNotes?: string | null;
  },
): Promise<{
  imported: number;
  merged: number;
  skipped: number;
  run: Run;
  boardId: string;
  processed: number;
}> {
  const { db } = ctx;
  const ws = await db.getWorkspace(ctx.workspaceId);
  if (ws) await ensureUsageWindow(db, ws);

  // Heal abandoned imports once per upload (first chunk only).
  if (!opts?.runId) await healStuckImportRuns(ctx);

  const boardId = await resolveBoardId(ctx, {
    boardId: opts?.boardId,
    newBoardName: opts?.newBoardName,
  });

  const { normalizeWebsiteUrl } = await import("@/lib/website");

  const cleaned = rows
    .map((r) => ({
      company: (r.company ?? "").trim(),
      website: normalizeWebsiteUrl(r.website) ?? null,
      emails: (r.emails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean),
      phones: (r.phones ?? []).map((p) => p.trim()).filter(Boolean),
      contactName: r.contactName?.trim() || null,
      location: r.location?.trim() || null,
    }))
    .filter((r) => r.company.length > 0 || r.emails.length > 0);

  const finalize = opts?.finalize !== false;
  // Finalize-only ping (empty chunk) after a successful upload — closes stuck "running".
  if (cleaned.length === 0) {
    if (!opts?.runId || !finalize) {
      throw new Error("No usable rows — need at least a company name or email.");
    }
    const existing = await db.getRun(opts.runId);
    if (!existing || existing.workspaceId !== ctx.workspaceId) {
      throw new Error("Import run not found");
    }
    const boardCount = await db.countLeads({ boardId: existing.boardId });
    const updated = await db.updateRun(existing.id, {
      status: "complete",
      leadCount: boardCount,
      completedAt: nowIso(),
    });
    return {
      imported: 0,
      merged: 0,
      skipped: 0,
      run: updated ?? existing,
      boardId: existing.boardId,
      processed: 0,
    };
  }

  let run: Run;
  if (opts?.runId) {
    const existing = await db.getRun(opts.runId);
    if (!existing || existing.workspaceId !== ctx.workspaceId) {
      throw new Error("Import run not found");
    }
    if (existing.provider !== "import") {
      throw new Error("Not an import run");
    }
    // User deleted leads mid-import — refuse further chunks.
    if (existing.status === "failed") {
      throw new Error(
        existing.error?.includes("Cancelled")
          ? "Import cancelled — leads were deleted"
          : existing.error || "Import was cancelled",
      );
    }
    if (existing.status === "complete" && !finalize) {
      throw new Error("Import already finished");
    }
    run = existing;
    if (run.status !== "running" && run.status !== "complete") {
      await db.updateRun(run.id, { status: "running", completedAt: null, error: null });
    }
  } else {
    run = {
      id: newId("run"),
      workspaceId: ctx.workspaceId,
      boardId,
      niche: "Imported list",
      location: null,
      offerNotes: opts?.offerNotes?.trim() || null,
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
  }

  const offerNotes = (opts?.offerNotes ?? run.offerNotes)?.trim() || "";

  try {
    const prior = await db.listLeads();
    const byEmail = new Map<string, Lead>();
    const byDomain = new Map<string, Lead>();
    for (const l of prior) {
      for (const e of l.emails) byEmail.set(e.toLowerCase(), l);
      const d = domainKey(l.website);
      if (d) byDomain.set(d, l);
    }

    const freshRows: typeof cleaned = [];
    const mergePatches: Array<{ id: string; patch: Partial<Lead> }> = [];
    let skipped = 0;

    for (const r of cleaned) {
      const d = domainKey(r.website);
      const match =
        r.emails.map((e) => byEmail.get(e)).find(Boolean) ??
        (d ? byDomain.get(d) : undefined) ??
        null;

      if (!match) {
        freshRows.push(r);
        continue;
      }

      const patch: Partial<Lead> = {};
      if (match.runId !== run.id) patch.runId = run.id;
      if (match.boardId !== boardId) patch.boardId = boardId;
      if ((!match.website || /\[object\s+Object\]/i.test(match.website)) && r.website) {
        patch.website = r.website;
      }
      if (!match.location && r.location) patch.location = r.location;
      if (r.location && match.location && r.location.length > match.location.length) {
        patch.location = r.location;
      }
      if (r.phones.length && match.phones.length === 0) patch.phones = r.phones;
      if (r.emails.length) {
        const mergedEmails = [
          ...new Set([...match.emails.map((e) => e.toLowerCase()), ...r.emails]),
        ];
        if (mergedEmails.length > match.emails.length) patch.emails = mergedEmails;
      }
      if (Object.keys(patch).length > 0) {
        mergePatches.push({ id: match.id, patch });
        // Keep in-memory maps current for later rows in this chunk.
        const next = { ...match, ...patch };
        for (const e of next.emails) byEmail.set(e.toLowerCase(), next);
        const nd = domainKey(next.website);
        if (nd) byDomain.set(nd, next);
      } else {
        skipped++;
      }
    }

    const merged =
      mergePatches.length > 0 ? await db.updateLeads(mergePatches) : 0;

    if (ctx.metered && freshRows.length > 0) {
      const freshWs = ws ? await db.getWorkspace(ctx.workspaceId) : null;
      if (freshWs) {
        const plan = getPlan(freshWs.planId);
        const remaining = Math.max(0, plan.leadCreditsPerMonth - freshWs.leadsUsedThisMonth);
        if (freshRows.length > remaining) {
          throw new QuotaError({
            kind: "leads",
            planId: freshWs.planId,
            limit: plan.leadCreditsPerMonth,
            used: freshWs.leadsUsedThisMonth,
            message: `Import would use ${freshRows.length} leads but only ${remaining} remain this month.`,
          });
        }
      }
    }

    // Plain website fetch (no Firecrawl) + optional AI pitch-fit. AI tokens are
    // tiny; Firecrawl credits are the costly part — keep imports off that path.
    const useAi = await aiAvailable();
    const draftLeads = await mapPool(freshRows, 3, async (r) => {
      const company = (
        r.company ||
        r.emails[0]?.split("@")[1]?.split(".")[0] ||
        "Unknown company"
      ).replace(/^./, (c) => c.toUpperCase());
      const website =
        r.website ||
        (r.emails[0]?.includes("@")
          ? `https://${r.emails[0].split("@")[1]}`
          : null);

      let aboutBlurb: string | null = null;
      let location = r.location;
      let phones = r.phones;
      if (website) {
        try {
          const pageText = await fetchPublicPageText(website, { preferPlain: true });
          aboutBlurb = extractBlurb(pageText);
          if (!location) location = extractLocation(pageText);
          if (phones.length === 0) {
            const found = extractPhones(pageText);
            if (found.length) phones = found.slice(0, 5);
          }
        } catch {
          /* best-effort enrich */
        }
      }

      let scored = scoreImportedLead(
        {
          company,
          website,
          emails: r.emails,
          phones,
          aboutBlurb,
          location,
          tags: ["imported"],
          contactName: r.contactName,
        },
        offerNotes || null,
      );
      if (useAi && offerNotes) {
        const pitchFit = await scoreLeadPitchFit({
          pitch: offerNotes,
          company,
          aboutBlurb,
          location,
          website,
        });
        if (pitchFit) {
          scored = {
            score: Math.min(100, scored.score + pitchFit.boost),
            reasons: [...scored.reasons, pitchFit.reason],
          };
        }
      }

      return {
        id: newId("lead"),
        workspaceId: ctx.workspaceId,
        runId: run.id,
        boardId,
        company,
        website,
        emails: r.emails,
        phones,
        contactName: r.contactName,
        location,
        aboutBlurb,
        tags: ["imported"],
        fitScore: scored.score,
        fitReasons: scored.reasons,
        sourceUrl: website || "import",
        status: "new" as const,
        crmStage: "new" as const,
        contactMethod: null,
        notes: null,
        followUps: [],
        customFields: {},
        createdAt: nowIso(),
      };
    });
    const leads: Lead[] = draftLeads;

    if (leads.length > 0) await db.createLeads(leads);
    if (leads.length > 0) await recordLeadUsage(ctx, leads.length);

    // COUNT(*) — avoid reloading every lead row on each chunk.
    const boardCount = await db.countLeads({ boardId });
    const parts: string[] = [];
    if (merged > 0) {
      parts.push(`updated ${merged} already in workspace (same email/website)`);
    }
    if (skipped > 0) {
      parts.push(
        `${skipped} already in workspace — no new fields (same email/website)`,
      );
    }

    const updated = finalize
      ? await db.updateRun(run.id, {
          status: "complete",
          leadCount: boardCount,
          error: parts.length ? parts.join(" · ") : null,
          completedAt: nowIso(),
        })
      : await db.updateRun(run.id, {
          status: "running",
          leadCount: boardCount,
          error: parts.length ? parts.join(" · ") : null,
        });

    return {
      imported: leads.length,
      merged,
      skipped,
      run: updated ?? run,
      boardId,
      processed: cleaned.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.updateRun(run.id, {
      status: "failed",
      error: message,
      completedAt: nowIso(),
    });
    throw err instanceof Error ? err : new Error(message);
  }
}

/**
 * Mark abandoned import runs as failed (or complete if chunks already wrote leads).
 * Called on import start and when listing Runs so the UI doesn't stay on RUNNING.
 */
export async function healStuckImportRuns(ctx: Ctx): Promise<void> {
  const runs = await ctx.db.listRuns();
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const r of runs) {
    if (r.provider !== "import" || r.status !== "running") continue;
    const started = Date.parse(r.createdAt);
    if (!Number.isFinite(started) || started > cutoff) continue;
    // Client dropped after chunks wrote — run.leadCount is updated each chunk.
    if (r.leadCount > 0) {
      await ctx.db.updateRun(r.id, {
        status: "complete",
        leadCount: r.leadCount,
        error: r.error,
        completedAt: nowIso(),
      });
    } else {
      await ctx.db.updateRun(r.id, {
        status: "failed",
        error: "Import timed out — re-upload the file to retry.",
        completedAt: nowIso(),
      });
    }
  }
}

/**
 * Generate a default outreach pitch from the user's company website (real AI only).
 * Workers AI → Groq → Gemini. Never invents a heuristic pitch (ADR 0013).
 */
export async function generatePitchFromWebsite(
  _ctx: Ctx,
  input: { website: string; companyName?: string },
): Promise<{ pitch: string; provider: string }> {
  let url = input.website.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    new URL(url);
  } catch {
    throw new Error("Enter a valid website URL.");
  }

  const { fetchPublicPageText } = await import("@/lib/ai/fetch-page");
  const { generateDefaultPitch } = await import("@/lib/ai/generate");
  const { aiAvailable } = await import("@/lib/ai/chat");

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

  if (!(await aiAvailable())) {
    throw new Error(
      "No AI available. On Cloudflare, redeploy so the Workers AI binding is live. Locally set CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN, or GROQ_API_KEY / GEMINI_API_KEY.",
    );
  }

  const result = await generateDefaultPitch({
    website: url,
    companyName: input.companyName?.trim() || undefined,
    pageText,
  });
  if (result) return { pitch: result.pitch, provider: result.provider };

  throw new Error(
    "AI could not generate a pitch from that site. Check Workers AI / Groq / Gemini credentials and try again, or write the pitch manually.",
  );
}
