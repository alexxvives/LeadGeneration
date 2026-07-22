import type { LeadRepository } from "@/lib/db";
import { newId, nowIso } from "@/lib/id";
import { runSearch, SearchUnavailableError } from "@/lib/search";
import { generateDraft, stripLegacyCompliance } from "@/lib/outreach/draft";
import { mapPool, personalizeDraftForLead } from "@/lib/ai/generate";
import {
  outreachLangFromLocation,
  type OutreachLang,
} from "@/lib/outreach/locale";
import { sendEmail } from "@/lib/email/sender";
import { checkSendRate } from "@/lib/email/rate-limit";
import { env } from "@/lib/config";
import { getCachedVerify, verifyEmail } from "@/lib/email/verify";
import {
  getPlan,
  INSIDER_SHARED_POOL,
  isPaidPlan,
} from "@/lib/plans";
import { sumInsiderSharedUsage } from "@/lib/insider-quota";
import { getFirecrawlRemainingCredits } from "@/lib/search/firecrawl";
import {
  BoardLockedError,
  ForbiddenError,
  NotFoundError,
  QuotaError,
} from "@/lib/errors";
import { cancelWorkspaceBilling } from "@/lib/billing/stripe";
import { ensureUsageWindow, ensureVerifyWindow } from "@/lib/workspace";
import type {
  Board,
  BoardInvite,
  BoardLock,
  BoardMember,
  BoardMemberRole,
  BoardSummary,
  ContactMethod,
  ConnectedMailbox,
  CrmStage,
  EasyEmailProvider,
  CreateRunInput,
  AdminPlatformStats,
  AdminUserRow,
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
  Workspace,
} from "@/lib/types";
import { normalizeCrmStage } from "@/lib/types";

const LOCK_TTL_MS = 150_000; // 2.5 minutes
import { mailboxPublicStatus } from "@/lib/email/mailbox";
import { scoreImportedLead } from "@/lib/fit-score";
import {
  contactMethodsEqual,
  contactMethodsFollowUpNote,
} from "@/lib/contact-methods";
import {
  companyGuessFromEmail,
  isFreeMailDomain,
  websiteFromEmail,
} from "@/lib/website";

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
  /** Auth.js user id (null in anonymous local/smoke). */
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  /** Re-scope the repository to another workspace (shared board access). */
  scopeToWorkspace: (workspaceId: string) => LeadRepository;
}

/** Per-workspace: orphan backfill runs at most once per isolate lifetime. */
const defaultBoardOrphansChecked = new Set<string>();

/**
 * Ensure the workspace has a Default board and back-fill any leads/runs that
 * predate boards (empty boardId). Orphan scan runs once per workspace per
 * isolate; duplicate-default collapse still runs when needed.
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

  if (!defaultBoardOrphansChecked.has(ctx.workspaceId)) {
    const [leads, runs] = await Promise.all([db.listLeads(), db.listRuns()]);
    const orphanLeads = leads.filter((l) => !l.boardId);
    const orphanRuns = runs.filter((r) => !r.boardId);
    await Promise.all([
      ...orphanLeads.map((l) => db.updateLead(l.id, { boardId: def!.id })),
      ...orphanRuns.map((r) => db.updateRun(r.id, { boardId: def!.id })),
    ]);
    defaultBoardOrphansChecked.add(ctx.workspaceId);
  }
  return def;
}

function summarizeBoard(
  b: Board,
  counts: { total: number; contacted: number; sent: number; closed: number },
  access: BoardMemberRole,
  shared: boolean,
  foreignLock: BoardLock | null,
): BoardSummary {
  return {
    ...b,
    leadCount: counts.total,
    contactedCount: counts.contacted,
    sentCount: counts.sent,
    closedCount: counts.closed,
    access,
    shared,
    lock: foreignLock,
  };
}

/** Resolve owned or shared board access; returns owner-scoped db when shared. */
export async function resolveBoardAccess(
  ctx: Ctx,
  boardId: string,
): Promise<{
  board: Board;
  db: LeadRepository;
  access: BoardMemberRole;
  shared: boolean;
} | null> {
  const owned = await ctx.db.getBoard(boardId);
  if (owned) {
    return { board: owned, db: ctx.db, access: "owner", shared: false };
  }
  if (!ctx.userId) return null;
  const role = await ctx.db.getMemberRole(boardId, ctx.userId);
  if (!role) return null;
  const board = await ctx.db.getBoardAnywhere(boardId);
  if (!board) return null;
  return {
    board,
    db: ctx.scopeToWorkspace(board.workspaceId),
    access: role,
    shared: true,
  };
}

export async function listBoardSummaries(ctx: Ctx): Promise<BoardSummary[]> {
  await ensureDefaultBoard(ctx);
  const [boards, countsByBoard] = await Promise.all([
    ctx.db.listBoards(),
    ctx.db.countLeadsByBoard(),
  ]);
  const locks = await ctx.db.listBoardLocks(boards.map((b) => b.id));
  const lockByBoard = new Map(locks.map((l) => [l.boardId, l]));
  const emptyCounts = { total: 0, contacted: 0, sent: 0, closed: 0 };
  const summaries: BoardSummary[] = [];
  for (const b of boards) {
    const lock = lockByBoard.get(b.id) ?? null;
    const foreignLock =
      lock && ctx.userId && lock.userId !== ctx.userId ? lock : null;
    summaries.push(
      summarizeBoard(
        b,
        countsByBoard[b.id] ?? emptyCounts,
        "owner",
        false,
        foreignLock,
      ),
    );
  }

  if (ctx.userId) {
    const sharedIds = await ctx.db.listBoardIdsForMember(ctx.userId);
    const sharedLocks = await ctx.db.listBoardLocks(sharedIds);
    const sharedLockByBoard = new Map(sharedLocks.map((l) => [l.boardId, l]));
    for (const id of sharedIds) {
      if (summaries.some((s) => s.id === id)) continue;
      const access = await resolveBoardAccess(ctx, id);
      if (!access) continue;
      const sharedCounts = await access.db.countLeadsByBoard();
      const lock = sharedLockByBoard.get(id) ?? null;
      const foreignLock =
        lock && ctx.userId && lock.userId !== ctx.userId ? lock : null;
      summaries.push(
        summarizeBoard(
          access.board,
          sharedCounts[id] ?? emptyCounts,
          access.access,
          true,
          foreignLock,
        ),
      );
    }
  }

  return summaries.sort((a, b) => {
    if (a.shared !== b.shared) return a.shared ? 1 : -1;
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return a.name.localeCompare(b.name);
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
  const access = await resolveBoardAccess(ctx, id);
  if (!access || access.access !== "owner" || access.shared) {
    throw new NotFoundError("Board not found");
  }
  const updated = await access.db.updateBoard(id, {
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

export async function inviteToBoard(
  ctx: Ctx,
  boardId: string,
  emailRaw: string,
): Promise<{ invite: BoardInvite; emailSent: boolean }> {
  if (!ctx.userId) throw new Error("Sign in required to invite");
  const access = await resolveBoardAccess(ctx, boardId);
  if (!access || access.shared || access.access !== "owner") {
    throw new Error("Only the board owner can invite");
  }
  const email = emailRaw.trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("Valid email required");
  if (ctx.userEmail && email === ctx.userEmail.toLowerCase()) {
    throw new Error("You already own this board");
  }
  const existing = await ctx.db.listPendingInvitesForBoard(boardId);
  const dup = existing.find((i) => i.email.toLowerCase() === email);
  if (dup) return { invite: dup, emailSent: false };

  const now = nowIso();
  const expires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const invite = await ctx.db.createBoardInvite({
    id: newId("binv"),
    boardId,
    boardName: access.board.name,
    email,
    role: "editor",
    invitedByUserId: ctx.userId,
    status: "pending",
    createdAt: now,
    expiresAt: expires,
  });
  // Best-effort email — invite is valid in-app even if mail fails.
  let emailSent = false;
  try {
    const { sendBoardInviteEmail } = await import("@/lib/email/board-invite");
    const result = await sendBoardInviteEmail({
      to: email,
      boardName: access.board.name,
      inviterName: ctx.userName ?? ctx.userEmail,
    });
    emailSent = result.sent;
  } catch (err) {
    console.error("[inviteToBoard] email delivery failed", err);
  }
  return { invite, emailSent };
}

export async function listMyPendingInvites(ctx: Ctx): Promise<BoardInvite[]> {
  if (!ctx.userEmail) return [];
  return ctx.db.listPendingInvitesForEmail(ctx.userEmail);
}

export async function acceptBoardInvite(
  ctx: Ctx,
  inviteId: string,
): Promise<BoardMember> {
  if (!ctx.userId || !ctx.userEmail) {
    throw new Error("Sign in required to accept an invite");
  }
  const invite = await ctx.db.getBoardInvite(inviteId);
  if (!invite || invite.status !== "pending") {
    throw new NotFoundError("Invite not found");
  }
  if (invite.expiresAt <= nowIso()) {
    await ctx.db.updateBoardInvite(inviteId, { status: "revoked" });
    throw new Error("Invite expired");
  }
  if (invite.email.toLowerCase() !== ctx.userEmail.toLowerCase()) {
    throw new Error("This invite was sent to a different email");
  }
  const member: BoardMember = {
    boardId: invite.boardId,
    userId: ctx.userId,
    email: ctx.userEmail,
    role: invite.role === "owner" ? "editor" : invite.role,
    createdAt: nowIso(),
  };
  await ctx.db.upsertBoardMember(member);
  await ctx.db.updateBoardInvite(inviteId, { status: "accepted" });
  return member;
}

export async function listBoardInvites(
  ctx: Ctx,
  boardId: string,
): Promise<BoardInvite[]> {
  const access = await resolveBoardAccess(ctx, boardId);
  if (!access || access.shared) throw new NotFoundError("Board not found");
  return ctx.db.listPendingInvitesForBoard(boardId);
}

export async function listBoardMembersForUi(
  ctx: Ctx,
  boardId: string,
): Promise<BoardMember[]> {
  const access = await resolveBoardAccess(ctx, boardId);
  if (!access) throw new NotFoundError("Board not found");
  return ctx.db.listBoardMembers(boardId);
}

/** Heartbeat: claim or refresh soft lock. Fails if another user holds it. */
export async function heartbeatBoardLock(
  ctx: Ctx,
  boardId: string,
): Promise<BoardLock> {
  if (!ctx.userId) throw new Error("Sign in required");
  const access = await resolveBoardAccess(ctx, boardId);
  if (!access) throw new NotFoundError("Board not found");

  const existing = await ctx.db.getBoardLock(boardId);
  if (existing && existing.userId !== ctx.userId) {
    throw new BoardLockedError(existing.userId, existing.userName);
  }
  const now = nowIso();
  const lock: BoardLock = {
    boardId,
    userId: ctx.userId,
    userName: ctx.userName,
    lockedAt: existing?.lockedAt ?? now,
    expiresAt: new Date(Date.now() + LOCK_TTL_MS).toISOString(),
  };
  return ctx.db.upsertBoardLock(lock);
}

export async function releaseBoardLock(
  ctx: Ctx,
  boardId: string,
): Promise<void> {
  if (!ctx.userId) return;
  await ctx.db.clearBoardLock(boardId, ctx.userId);
}

export async function getBoardLockStatus(
  ctx: Ctx,
  boardId: string,
): Promise<BoardLock | null> {
  const access = await resolveBoardAccess(ctx, boardId);
  if (!access) return null;
  const lock = await ctx.db.getBoardLock(boardId);
  if (!lock) return null;
  if (ctx.userId && lock.userId === ctx.userId) return null;
  return lock;
}

async function assertBoardEditable(ctx: Ctx, boardId: string): Promise<void> {
  const lock = await ctx.db.getBoardLock(boardId);
  if (lock && ctx.userId && lock.userId !== ctx.userId) {
    throw new BoardLockedError(lock.userId, lock.userName);
  }
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
 * Resolve how many leads this run may return. Caps by platform hard max,
 * the plan’s monthly lead-credit quota, and remaining credits this period.
 * Throws QuotaError when nothing is left (or request exceeds monthly cap).
 */
async function resolveRunLeadLimit(
  ctx: Ctx,
  requested?: number | null,
): Promise<number> {
  const hardCap = env.maxLeadsPerRun();
  let planMonthlyCap = hardCap;
  let remaining = Number.POSITIVE_INFINITY;
  let planId: PlanId = "free";
  let used = 0;

  if (ctx.metered) {
    const ws = await ctx.db.getWorkspace(ctx.workspaceId);
    if (ws) {
      const fresh = await ensureUsageWindow(ctx.db, ws);
      const plan = getPlan(fresh.planId);
      planId = fresh.planId;
      if (fresh.planId === "insider") {
        // Shared Firecrawl API key = shared pool. Gate on raw credits > 0;
        // batch size still hard-capped (credits ≠ leads 1:1). Never invent a
        // fallback balance when the usage API is unreachable.
        const fc = await getFirecrawlRemainingCredits();
        used = (await sumInsiderSharedUsage(ctx.db)).leads;
        planMonthlyCap = hardCap;
        if (fc == null) {
          throw new QuotaError({
            kind: "leads",
            planId: "insider",
            limit: 0,
            used,
            message:
              "Firecrawl credits unavailable right now. Try again shortly.",
          });
        }
        remaining = fc;
      } else {
        planMonthlyCap = Math.min(hardCap, plan.leadCreditsPerMonth);
        used = fresh.leadsUsedThisMonth;
        remaining = plan.leadCreditsPerMonth - fresh.leadsUsedThisMonth;
      }
      if (remaining <= 0) {
        throw new QuotaError({
          kind: "leads",
          planId: fresh.planId,
          limit: planId === "insider" ? 0 : planMonthlyCap,
          used,
        });
      }
    }
  }

  const want =
    requested && requested > 0 ? Math.floor(requested) : Math.min(10, planMonthlyCap);
  if (planId !== "insider" && want > planMonthlyCap) {
    throw new QuotaError({
      kind: "leads",
      planId,
      limit: planMonthlyCap,
      used: 0,
      message: `Your plan allows up to ${planMonthlyCap} leads per month — pick a smaller batch or upgrade.`,
    });
  }

  // Insider remaining is FC credits (not lead slots) — only require credits > 0.
  if (planId === "insider") {
    return Math.max(1, Math.min(want, hardCap));
  }
  return Math.max(1, Math.min(want, planMonthlyCap, remaining, hardCap));
}

async function recordLeadUsage(ctx: Ctx, count: number): Promise<void> {
  // Track locally too so usage bars move in `npm run dev` (enforcement still
  // gated on ctx.metered in resolveRunLeadLimit).
  if (count <= 0) return;
  await ctx.db.incrementWorkspaceUsage(ctx.workspaceId, { leads: count });
}

/** TEMP developer helper — zero monthly lead/send + daily verify counters. */
export async function resetWorkspaceUsage(ctx: Ctx): Promise<void> {
  await ctx.db.updateWorkspace(ctx.workspaceId, {
    leadsUsedThisMonth: 0,
    sendsUsedThisMonth: 0,
    verifiesUsedToday: 0,
    updatedAt: nowIso(),
  });
}

/**
 * Admin helper — force a plan without Stripe. Optional `workspaceId` targets
 * another workspace (e.g. gift Insider to a friend).
 */
export async function setWorkspacePlanDev(
  ctx: Ctx,
  planId: PlanId,
  workspaceId?: string,
): Promise<void> {
  const id = workspaceId?.trim() || ctx.workspaceId;
  const existing = await ctx.db.getWorkspace(id);
  if (!existing) throw new NotFoundError("Workspace not found");
  await ctx.db.updateWorkspace(id, {
    planId,
    updatedAt: nowIso(),
  });
}

export async function createAndRunSearch(
  ctx: Ctx,
  input: CreateRunInput,
): Promise<Run> {
  const wsGate = await ctx.db.getWorkspace(ctx.workspaceId);
  // Demo data is offline sample leads — not live Find leads. Keep the Load
  // demo / tour seed path working when Search is paused or FC credits are down.
  if (wsGate && wsGate.findLeadsEnabled === false && !input.demo) {
    throw new ForbiddenError(
      "Find leads is disabled for this account. Contact support if you need it re-enabled.",
    );
  }
  // Quota + per-run cap BEFORE creating the run, so an over-limit request
  // doesn't leave a stray failed run behind and can surface a clean 402.
  const maxLeads = input.demo
    ? Math.min(Math.max(1, input.maxLeads ?? 8), 12)
    : await resolveRunLeadLimit(ctx, input.maxLeads);
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

    const { suggestCompanyType } = await import("@/lib/company-type");
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
      companyType: suggestCompanyType(
        l.company,
        l.aboutBlurb,
        l.location,
        ...(l.tags ?? []),
      ),
      tags: l.tags,
      fitScore: l.fitScore,
      fitReasons: l.fitReasons,
      sourceUrl: l.sourceUrl,
      status: "new",
      crmStage: "new",
      contactMethods: [],
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
    // Demo samples are free / offline — don't burn plan or Insider counters.
    if (!input.demo) {
      await recordLeadUsage(ctx, leads.length);
    }

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
  opts?: { includeLeads?: boolean },
): Promise<{
  run: Run | null;
  leads: LeadWithOutreach[];
  boards: BoardSummary[];
  activeBoardId: string | null;
  boardLock: BoardLock | null;
}> {
  await ensureDefaultBoard(ctx);
  const boards = await listBoardSummaries(ctx);
  const active =
    boardId && boardId !== "all" && boards.some((b) => b.id === boardId)
      ? boardId
      : null;

  let leadDb = ctx.db;
  let boardLock: BoardLock | null = null;
  if (active) {
    const access = await resolveBoardAccess(ctx, active);
    if (access) leadDb = access.db;
    boardLock = await getBoardLockStatus(ctx, active);
  }

  const includeLeads = opts?.includeLeads !== false;

  if (!includeLeads) {
    return {
      run: null,
      leads: [],
      boards,
      activeBoardId: active,
      boardLock,
    };
  }

  const runs = await leadDb.listRuns();
  const run =
    (active
      ? runs.find((r) => r.boardId === active && r.status === "complete")
      : null) ??
    runs.find((r) => r.status === "complete") ??
    runs[0] ??
    null;

  const leads = await leadDb.listLeads(active ? { boardId: active } : undefined);
  return {
    run,
    leads: await attachOutreach(leadDb, leads),
    boards,
    activeBoardId: active,
    boardLock,
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

  const filter = active ? { boardId: active } : undefined;
  const [leadSummary, outreachSummary, runs] = await Promise.all([
    ctx.db.summarizeLeads(filter),
    ctx.db.summarizeOutreach(active),
    ctx.db.listRuns(),
  ]);

  const byCrmStage: Record<CrmStage, number> = {
    new: 0,
    contacted: 0,
    in_conversation: 0,
    closed: 0,
    not_interested: 0,
  };
  for (const [k, n] of Object.entries(leadSummary.byCrmStage)) {
    const stage = normalizeCrmStage(k);
    byCrmStage[stage] = (byCrmStage[stage] ?? 0) + n;
  }

  return {
    totalLeads: leadSummary.total,
    byCrmStage,
    byStatus: leadSummary.byStatus,
    sentCount: outreachSummary.sentCount,
    draftedCount: outreachSummary.draftedCount,
    boards,
    recentRuns: runs.slice(0, 8),
    avgFitScore: leadSummary.avgFitScore,
    activeBoardId: active,
  };
}

async function attachOutreach(
  db: LeadRepository,
  leads: Lead[],
): Promise<LeadWithOutreach[]> {
  const rows = await db.listOutreachByLeadIds(leads.map((l) => l.id));
  const byLead = new Map(rows.map((o) => [o.leadId, o]));
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
  const existing = await ctx.db.getOutreach(outreachId);
  if (!existing) return null;
  // Preserve send audit trail — never rewrite in-flight or sent mail.
  if (existing.status === "sent" || existing.status === "sending") {
    return existing;
  }

  const nextPatch: Parameters<typeof ctx.db.updateOutreach>[1] = {
    ...patch,
    updatedAt: nowIso(),
  };
  // Recovery after verify undeliverable: new To → back to draft + restore lead email.
  const newTo = patch.toEmail?.trim();
  if (newTo && existing.status === "rejected") {
    nextPatch.status = "draft";
    nextPatch.error = null;
    const lead = await ctx.db.getLead(existing.leadId);
    if (lead) {
      const emails = lead.emails.some((e) => e.toLowerCase() === newTo.toLowerCase())
        ? lead.emails
        : [...lead.emails, newTo];
      await ctx.db.updateLead(lead.id, { emails, status: "queued" });
    }
  }

  return ctx.db.updateOutreach(outreachId, nextPatch);
}

export async function setOutreachDecision(
  ctx: Ctx,
  outreachId: string,
  decision: "approved" | "rejected",
): Promise<Outreach | null> {
  const db = ctx.db;
  const existing = await db.getOutreach(outreachId);
  if (!existing) return null;
  // Never reopen a sent/in-flight outreach (re-send must be a new draft path).
  if (
    existing.status === "sent" ||
    existing.status === "sending"
  ) {
    return existing;
  }
  // Human approve / API reject only from draft | rejected | failed | approved.
  const allowedFrom = new Set(["draft", "rejected", "failed", "approved"]);
  if (!allowedFrom.has(existing.status)) return existing;

  const outreach = await db.updateOutreach(outreachId, {
    status: decision,
    error: decision === "approved" ? null : existing.error,
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
  /**
   * True when verify failed and we stripped the bad address + rejected the
   * outreach so the lead leaves the Outreach queue (still under Leads).
   */
  undeliverableRemoved?: boolean;
  /** Transport that delivered (or would have, for local demo). */
  provider?: "google" | "resend" | "maileroo" | "smtp" | "demo";
}

/**
 * Send a single APPROVED outreach. Enforces (in order):
 *  - atomic claim approved→sending (prevents double-send)
 *  - a valid recipient
 *  - email verify (optional) + undeliverable cleanup
 *  - monthly send quota (metered workspaces only) — throws QuotaError → 402
 *  - rate limiting
 * Studio Send may auto-approve a draft first (per-lead human gate = Send click).
 */
export async function sendApprovedOutreach(
  ctx: Ctx,
  outreachId: string,
): Promise<SendOutcome> {
  const db = ctx.db;
  const claimed = await db.claimOutreachForSend(outreachId);
  if (!claimed) {
    const existing = await db.getOutreach(outreachId);
    if (!existing) return { ok: false, error: "Outreach not found" };
    if (existing.status === "sent") {
      return { ok: false, error: "Already sent", outreach: existing };
    }
    if (existing.status === "sending") {
      return { ok: false, error: "Send already in progress", outreach: existing };
    }
    return { ok: false, error: "Outreach must be approved before sending" };
  }

  const releaseClaim = async (error?: string | null) => {
    await db.updateOutreach(outreachId, {
      status: "approved",
      error: error ?? null,
      updatedAt: nowIso(),
    });
  };

  const outreach = claimed;
  if (!outreach.toEmail) {
    await releaseClaim("No recipient email on this lead");
    return { ok: false, error: "No recipient email on this lead" };
  }

  // List hygiene — verify at send only (not on enrich).
  const wsForVerify = await db.getWorkspace(ctx.workspaceId);
  const verifyOn = wsForVerify?.emailVerifyEnabled !== false;
  if (verifyOn && wsForVerify) {
    const verifyWs = await ensureVerifyWindow(db, wsForVerify);
    const plan = getPlan(verifyWs.planId);
    const hasVerifyProvider =
      Boolean(env.myEmailVerifierKey()) || Boolean(env.zeruhVerifyKey());
    const cached = getCachedVerify(outreach.toEmail);
    const verifyLimit =
      verifyWs.planId === "insider"
        ? INSIDER_SHARED_POOL.verifiesPerDay
        : plan.verifiesPerDay;
    const verifyUsed =
      verifyWs.planId === "insider"
        ? (await sumInsiderSharedUsage(db)).verifies
        : verifyWs.verifiesUsedToday;
    if (hasVerifyProvider && !cached && verifyUsed >= verifyLimit) {
      await releaseClaim();
      throw new QuotaError({
        kind: "verifies",
        planId: verifyWs.planId,
        limit: verifyLimit,
        used: verifyUsed,
      });
    }

    const verified = await verifyEmail(outreach.toEmail);
    if (verified.billed) {
      await db.incrementWorkspaceUsage(ctx.workspaceId, { verifies: 1 });
    }
    if (!verified.okToSend) {
      const lead = await db.getLead(outreach.leadId);
      const bad = outreach.toEmail.toLowerCase();
      if (lead) {
        const emails = lead.emails.filter((e) => e.toLowerCase() !== bad);
        await db.updateLead(lead.id, { emails, status: "rejected" });
      }
      await db.updateOutreach(outreachId, {
        status: "rejected",
        toEmail: null,
        error: "invalid_email_removed",
        updatedAt: nowIso(),
      });
      return {
        ok: false,
        undeliverableRemoved: true,
        error:
          "That email isn't real or can't receive mail. We removed it from this lead and took them out of Outreach — they're still under Leads without that address.",
      };
    }
  }

  if (ctx.metered) {
    const ws = await db.getWorkspace(ctx.workspaceId);
    if (ws) {
      const fresh = await ensureUsageWindow(db, ws);
      const plan = getPlan(fresh.planId);
      // Insider = BYO sender — no platform send quota.
      if (!plan.unlimitedSends) {
        if (fresh.sendsUsedThisMonth >= plan.sendsPerMonth) {
          await releaseClaim();
          throw new QuotaError({
            kind: "sends",
            planId: fresh.planId,
            limit: plan.sendsPerMonth,
            used: fresh.sendsUsedThisMonth,
          });
        }
      }
    }
  }

  const rate = await checkSendRate(db, outreachId);
  if (!rate.allowed) {
    await releaseClaim();
    return {
      ok: false,
      rateLimited: true,
      retryAfterMs: rate.retryAfterMs,
      error: `Rate limit reached (${rate.limit}/min). Try again shortly.`,
    };
  }

  const wsForEmail = await db.getWorkspace(ctx.workspaceId);
  const cleanBody = stripLegacyCompliance(outreach.body);
  const result = await sendEmail(
    {
      to: outreach.toEmail,
      subject: outreach.subject,
      body: cleanBody,
      tags: [
        { name: "hermes_ws", value: ctx.workspaceId.slice(0, 256) },
        { name: "hermes_outreach", value: outreachId.slice(0, 256) },
        // Back-compat for in-flight sends / older webhook configs
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
    const msg =
      "No email transport configured. Add a Resend/Maileroo key in Settings → Easy, or Connect Google on Pro.";
    const updated = await db.updateOutreach(outreachId, {
      status: "failed",
      error: msg,
      updatedAt: nowIso(),
    });
    return {
      ok: false,
      outreach: updated ?? undefined,
      error: msg,
      provider: "demo",
    };
  }

  if (result.ok) {
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
    const lead = await db.getLead(outreach.leadId);
    const crmPatch: Partial<Lead> = { status: "sent" };
    if (lead) {
      if (lead.crmStage === "new") crmPatch.crmStage = "contacted";
      if (!lead.contactMethods.includes("email")) {
        crmPatch.contactMethods = [...lead.contactMethods, "email"];
      }
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
    await db.incrementWorkspaceUsage(ctx.workspaceId, { sends: 1 });
    return { ok: true, outreach: updated ?? undefined, provider: result.provider };
  }

  // Transport error — mark failed so Email Status is honest; Send retries via approve.
  const updated = await db.updateOutreach(outreachId, {
    status: "failed",
    error: result.error ?? "Unknown send error",
    updatedAt: nowIso(),
  });
  if (updated) {
    await db.updateLead(outreach.leadId, { status: "failed" });
  }
  return {
    ok: false,
    outreach: updated ?? undefined,
    error: result.error,
    provider: result.provider,
  };
}

const TEST_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Send a one-off test message to verify workspace transport (Settings).
 * Explicit user action — not outreach, so no approved-outreach gate.
 * Does not consume monthly send quota; still uses the send rate window.
 */
export async function sendTestEmail(
  ctx: Ctx,
  toRaw: string,
): Promise<{
  ok: boolean;
  provider?: "google" | "resend" | "maileroo" | "smtp" | "demo";
  error?: string;
  demo?: boolean;
}> {
  const to = toRaw.trim().toLowerCase();
  if (!TEST_EMAIL_RE.test(to) || to.length > 254) {
    return { ok: false, error: "Enter a valid email address" };
  }

  const rate = await checkSendRate(ctx.db);
  if (!rate.allowed) {
    return {
      ok: false,
      error: `Rate limit reached (${rate.limit}/min). Try again shortly.`,
    };
  }

  const ws = await ctx.db.getWorkspace(ctx.workspaceId);
  const result = await sendEmail(
    {
      to,
      subject: "HERMES mail — test send",
      body: [
        "This is a test email from your HERMES mail workspace.",
        "",
        "If you received it, sending is configured correctly.",
        "",
        "— HERMES mail",
      ].join("\n"),
      tags: [
        { name: "hermes_ws", value: ctx.workspaceId.slice(0, 256) },
        { name: "hermes_test", value: "1" },
      ],
    },
    ws
      ? {
          fromName: ws.fromName,
          fromEmail: ws.fromEmail,
          replyTo: ws.replyTo,
          physicalAddress: ws.physicalAddress,
          resendApiKey: ws.resendApiKey,
          mailerooApiKey: ws.mailerooApiKey,
          easyEmailProvider: ws.easyEmailProvider,
          preferredSendPath: ws.preferredSendPath,
          connectedMailbox: ws.connectedMailbox,
        }
      : undefined,
  );

  if (result.connectedMailbox) {
    await ctx.db.updateWorkspace(ctx.workspaceId, {
      connectedMailbox: result.connectedMailbox,
      updatedAt: nowIso(),
    });
  }

  if (result.ok && result.provider === "demo") {
    if (ctx.metered) {
      return {
        ok: false,
        provider: "demo",
        error:
          "No email transport configured. Add a Resend/Maileroo key in Settings → Easy, or Connect Google on Pro.",
      };
    }
    return {
      ok: true,
      provider: "demo",
      demo: true,
    };
  }

  if (!result.ok) {
    return {
      ok: false,
      provider: result.provider,
      error: result.error ?? "Send failed",
    };
  }

  return { ok: true, provider: result.provider };
}

function domainKey(website: string | null | undefined): string | null {
  if (!website || /\[object\s+Object\]/i.test(website)) return null;
  try {
    const host = new URL(
      website.startsWith("http") ? website : `https://${website}`,
    ).hostname
      .replace(/^www\./, "")
      .toLowerCase();
    // Never dedupe/merge on consumer mail hosts (many unrelated @gmail.com leads).
    if (!host || isFreeMailDomain(host)) return null;
    return host;
  } catch {
    const host =
      website.replace(/^https?:\/\//i, "").replace(/^www\./, "").split("/")[0]?.toLowerCase() ||
      null;
    if (!host || isFreeMailDomain(host)) return null;
    return host;
  }
}

/**
 * Import dedupe key — company name only.
 * Aggregators (Booksy, Instagram, Facebook, Doctoralia…) share emails/domains
 * across unrelated locations, so website/email must not collapse those rows.
 */
function companyKey(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed || /^unknown company$/i.test(trimmed)) return null;
  const key = trimmed
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "");
  return key.length >= 2 ? key : null;
}

/** Rank delivery outcomes so webhooks don't clobber a stronger signal. */
function deliveryRank(s: DeliveryStatus): number {
  switch (s) {
    case "replied":
      return 3;
    case "bounced":
      return 2;
    case "sent":
      return 1;
    default:
      return 0;
  }
}

/** Manual delivery outcome stub (bounce / reply). Webhooks call the same path. */
export async function setOutreachDeliveryStatus(
  ctx: Ctx,
  outreachId: string,
  deliveryStatus: DeliveryStatus,
): Promise<Outreach | null> {
  const existing = await ctx.db.getOutreach(outreachId);
  if (!existing) return null;
  const prev = existing.deliveryStatus ?? "unknown";
  // Don't let "delivered" overwrite bounce/reply.
  if (deliveryRank(deliveryStatus) < deliveryRank(prev)) {
    return existing;
  }

  const outreach = await ctx.db.updateOutreach(outreachId, {
    deliveryStatus,
    updatedAt: nowIso(),
  });
  if (!outreach) return null;

  // Reply webhook / manual: park lead in In Conversation (Pipeline highlights these).
  if (deliveryStatus === "replied") {
    const lead = await ctx.db.getLead(outreach.leadId);
    if (
      lead &&
      lead.crmStage !== "closed" &&
      lead.crmStage !== "not_interested"
    ) {
      const patch: Partial<Lead> = {};
      if (lead.crmStage !== "in_conversation") {
        patch.crmStage = "in_conversation";
      }
      if (!lead.contactMethods.includes("email")) {
        patch.contactMethods = [...lead.contactMethods, "email"];
      }
      const today = nowIso().slice(0, 10);
      const existing = lead.followUps ?? [];
      const hasReplyNote = existing.some(
        (f) => f.note.trim().toLowerCase() === "reply received" && f.date === today,
      );
      if (!hasReplyNote) {
        patch.followUps = [
          { id: newId("fu"), date: today, note: "Reply received", done: false },
          ...existing,
        ];
      }
      if (Object.keys(patch).length > 0) {
        await ctx.db.updateLead(outreach.leadId, patch);
      }
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
    outreachProfilesJson?: string | null;
  },
): Promise<void> {
  const existing = await ctx.db.getWorkspace(ctx.workspaceId);
  const nextPatch: Partial<Workspace> = {
    ...patch,
    updatedAt: nowIso(),
  };

  // Clearing Resend key also drops the auto-registered webhook credentials.
  if (patch.resendApiKey === null) {
    nextPatch.resendWebhookId = null;
    nextPatch.resendWebhookSecret = null;
  }

  // New/rotated BYO Resend key → register delivery webhook (no user dashboard work).
  if (typeof patch.resendApiKey === "string" && patch.resendApiKey.trim()) {
    try {
      const { ensureResendDeliveryWebhook } = await import(
        "@/lib/email/resend-webhooks"
      );
      const ensured = await ensureResendDeliveryWebhook(patch.resendApiKey, {
        existingId: existing?.resendWebhookId,
        existingSecret: existing?.resendWebhookSecret,
      });
      if (ensured) {
        nextPatch.resendWebhookId = ensured.id;
        nextPatch.resendWebhookSecret = ensured.signingSecret;
      }
    } catch (err) {
      console.error("[updateWorkspaceEmailSettings] resend webhook ensure", err);
    }
  }

  const updated = await ctx.db.updateWorkspace(ctx.workspaceId, nextPatch);
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

/**
 * Delete every lead on a board (set-based). Prefer this for “select all” /
 * clear-board so the client never POSTs thousands of ids (API max 500 → 400).
 */
export async function clearBoardLeads(
  ctx: Ctx,
  boardId: string,
): Promise<{ deleted: number }> {
  const access = await resolveBoardAccess(ctx, boardId);
  if (!access) throw new Error("Board not found");
  await assertBoardEditable(ctx, boardId);
  await cancelRunningImportRuns(ctx);
  const deleted = await access.db.deleteLeadsByBoard(boardId);
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

/** User cancelled the import modal — stop accepting further chunks. */
export async function cancelImportRun(
  ctx: Ctx,
  runId: string,
): Promise<{ ok: true }> {
  const existing = await ctx.db.getRun(runId);
  if (
    !existing ||
    existing.workspaceId !== ctx.workspaceId ||
    existing.provider !== "import"
  ) {
    return { ok: true };
  }
  if (existing.status === "running") {
    await ctx.db.updateRun(existing.id, {
      status: "failed",
      error: "Cancelled by user",
      completedAt: nowIso(),
    });
  }
  return { ok: true };
}

/** Update user-managed CRM fields on a lead (stage, contact method, notes, follow-ups). */
export async function updateLeadCrm(
  ctx: Ctx,
  leadId: string,
  patch: {
    crmStage?: CrmStage;
    contactMethods?: ContactMethod[];
    notes?: string | null;
    companyType?: string | null;
    company?: string;
    website?: string | null;
    emails?: string[];
    phones?: string[];
    location?: string | null;
    aboutBlurb?: string | null;
    followUps?: FollowUp[];
    customFields?: Record<string, string>;
  },
): Promise<Lead | null> {
  let lead = await ctx.db.getLead(leadId);
  let db = ctx.db;
  if (!lead && ctx.userId) {
    // Shared-board lead: find via membership boards.
    const sharedIds = await ctx.db.listBoardIdsForMember(ctx.userId);
    for (const bid of sharedIds) {
      const access = await resolveBoardAccess(ctx, bid);
      if (!access) continue;
      const found = await access.db.getLead(leadId);
      if (found) {
        lead = found;
        db = access.db;
        break;
      }
    }
  }
  if (!lead) return null;
  await assertBoardEditable(ctx, lead.boardId);

  const next: typeof patch = { ...patch };

  // When the user explicitly sets how they contacted, journal a follow-up note.
  if (
    patch.contactMethods &&
    !contactMethodsEqual(patch.contactMethods, lead.contactMethods)
  ) {
    const note = contactMethodsFollowUpNote(patch.contactMethods);
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

  return db.updateLead(leadId, next);
}

/**
 * Create a blank lead on a board and open it for manual fill-in (Leads UI).
 * Reuses a single completed "manual" run per board so Runs stays tidy.
 */
export async function createManualLead(
  ctx: Ctx,
  opts?: { boardId?: string | null },
): Promise<LeadWithOutreach> {
  let boardId: string;
  let db = ctx.db;
  let workspaceId = ctx.workspaceId;

  if (opts?.boardId) {
    const access = await resolveBoardAccess(ctx, opts.boardId);
    if (!access) throw new NotFoundError("Board not found");
    boardId = access.board.id;
    db = access.db;
    workspaceId = access.board.workspaceId;
  } else {
    const def = await ensureDefaultBoard(ctx);
    boardId = def.id;
  }

  await assertBoardEditable(ctx, boardId);

  const ws = await ctx.db.getWorkspace(ctx.workspaceId);
  if (ws) await ensureUsageWindow(ctx.db, ws);

  if (ctx.metered) {
    const freshWs = ws ? await ctx.db.getWorkspace(ctx.workspaceId) : null;
    if (freshWs) {
      const plan = getPlan(freshWs.planId);
      const used = freshWs.leadsUsedThisMonth;
      const remaining =
        freshWs.planId === "insider"
          ? Number.POSITIVE_INFINITY
          : Math.max(0, plan.leadCreditsPerMonth - used);
      if (remaining < 1) {
        throw new QuotaError({
          kind: "leads",
          planId: freshWs.planId,
          limit: used + remaining,
          used,
          message: "No lead credits left this month — upgrade to add more.",
        });
      }
    }
  }

  const runs = await db.listRuns();
  let run =
    runs.find((r) => r.boardId === boardId && r.provider === "manual") ?? null;
  if (!run) {
    run = {
      id: newId("run"),
      workspaceId,
      boardId,
      niche: "Manual entry",
      location: null,
      offerNotes: null,
      senderName: null,
      status: "complete",
      mode: "live",
      provider: "manual",
      leadCount: 0,
      error: null,
      createdAt: nowIso(),
      completedAt: nowIso(),
    };
    await db.createRun(run);
  }

  const lead: Lead = {
    id: newId("lead"),
    workspaceId,
    runId: run.id,
    boardId,
    company: "",
    website: null,
    emails: [],
    phones: [],
    contactName: null,
    location: null,
    aboutBlurb: null,
    companyType: null,
    tags: ["manual"],
    fitScore: 0,
    fitReasons: [],
    sourceUrl: "manual",
    status: "new",
    crmStage: "new",
    contactMethods: [],
    notes: null,
    followUps: [],
    customFields: {},
    createdAt: nowIso(),
  };

  await db.createLeads([lead]);
  await recordLeadUsage(ctx, 1);
  const boardCount = await db.countLeads({ boardId });
  await db.updateRun(run.id, { leadCount: boardCount });

  return { ...lead, outreach: null };
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
  const { preferCrmStage } = await import("@/lib/import-crm-stage");

  const cleaned = rows
    .map((r) => ({
      company: (r.company ?? "").trim(),
      website: normalizeWebsiteUrl(r.website) ?? null,
      emails: (r.emails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean),
      phones: (r.phones ?? []).map((p) => p.trim()).filter(Boolean),
      contactName: r.contactName?.trim() || null,
      location: r.location?.trim() || null,
      companyType: r.companyType?.trim() || null,
      crmStage: r.crmStage ?? null,
      contactMethods: (r.contactMethods ?? []).filter(Boolean),
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
    // Name-only: shared aggregator emails/domains must not collapse locations.
    const byCompany = new Map<string, Lead>();
    for (const l of prior) {
      const ck = companyKey(l.company);
      if (ck) byCompany.set(ck, l);
    }

    const freshRows: typeof cleaned = [];
    /** Same-chunk name collisions merge into the first fresh row (no Lead id yet). */
    const freshByCompany = new Map<string, number>();
    const mergePatches: Array<{ id: string; patch: Partial<Lead> }> = [];
    let skipped = 0;

    for (const r of cleaned) {
      const ck = companyKey(r.company);
      const match = ck ? byCompany.get(ck) ?? null : null;

      if (!match) {
        if (ck && freshByCompany.has(ck)) {
          const idx = freshByCompany.get(ck)!;
          const prev = freshRows[idx]!;
          let changed = false;
          if ((!prev.website || /\[object\s+Object\]/i.test(prev.website)) && r.website) {
            prev.website = r.website;
            changed = true;
          }
          if (!prev.location && r.location) {
            prev.location = r.location;
            changed = true;
          } else if (
            r.location &&
            prev.location &&
            r.location.length > prev.location.length
          ) {
            prev.location = r.location;
            changed = true;
          }
          if (r.phones.length && prev.phones.length === 0) {
            prev.phones = r.phones;
            changed = true;
          }
          if (r.emails.length) {
            const mergedEmails = [...new Set([...prev.emails, ...r.emails])];
            if (mergedEmails.length > prev.emails.length) {
              prev.emails = mergedEmails;
              changed = true;
            }
          }
          if (!prev.companyType && r.companyType) {
            prev.companyType = r.companyType;
            changed = true;
          }
          if (!prev.contactName && r.contactName) {
            prev.contactName = r.contactName;
            changed = true;
          }
          if (r.crmStage) {
            const nextStage = preferCrmStage(prev.crmStage ?? "new", r.crmStage);
            if (nextStage !== (prev.crmStage ?? "new")) {
              prev.crmStage = nextStage;
              changed = true;
            }
            if (
              r.contactMethods.length > 0 &&
              (prev.contactMethods?.length ?? 0) === 0
            ) {
              prev.contactMethods = r.contactMethods;
              changed = true;
            }
          }
          if (
            r.company.trim() &&
            prev.company.length < r.company.trim().length
          ) {
            prev.company = r.company.trim();
            changed = true;
          }
          if (!changed) skipped++;
          continue;
        }
        freshRows.push(r);
        if (ck) freshByCompany.set(ck, freshRows.length - 1);
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
      if (!match.companyType && r.companyType) patch.companyType = r.companyType;
      if (!match.contactName && r.contactName) patch.contactName = r.contactName;
      if (r.crmStage) {
        const nextStage = preferCrmStage(match.crmStage ?? "new", r.crmStage);
        if (nextStage !== (match.crmStage ?? "new")) {
          patch.crmStage = nextStage;
        }
        if (
          r.contactMethods.length > 0 &&
          (match.contactMethods?.length ?? 0) === 0
        ) {
          patch.contactMethods = r.contactMethods;
        }
      }
      if (
        r.company.trim() &&
        (match.company === "Unknown company" ||
          match.company.length < r.company.trim().length)
      ) {
        patch.company = r.company.trim();
      }
      if (Object.keys(patch).length > 0) {
        mergePatches.push({ id: match.id, patch });
        // Keep in-memory map current for later rows in this chunk.
        const next = { ...match, ...patch };
        const nextKey = companyKey(next.company) ?? ck;
        if (nextKey) byCompany.set(nextKey, next);
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
        const used = freshWs.leadsUsedThisMonth;
        const remaining =
          freshWs.planId === "insider"
            ? // Imports use plain fetch (no Firecrawl) — do not gate on FC credits.
              Number.POSITIVE_INFINITY
            : Math.max(0, plan.leadCreditsPerMonth - used);
        if (freshRows.length > remaining) {
          throw new QuotaError({
            kind: "leads",
            planId: freshWs.planId,
            limit: used + remaining,
            used,
            message: `Import would use ${freshRows.length} leads but only ${remaining} remain.`,
          });
        }
      }
    }

    // Spreadsheet-only: no per-row website fetch / AI pitch-fit. Those made
    // multi-thousand imports crawl (HTTP × concurrency 3). Fit score uses
    // columns already on the row; users can enrich later from the drawer.
    const { suggestCompanyType } = await import("@/lib/company-type");
    const leads: Lead[] = freshRows.map((r) => {
      const fromEmail = r.emails[0] ?? null;
      const rawCompany =
        r.company.trim() ||
        companyGuessFromEmail(fromEmail) ||
        "Unknown company";
      const company = rawCompany.replace(/^./, (c) => c.toUpperCase());
      // Never invent https://gmail.com (etc.) from a free-mail inbox.
      const website = r.website || websiteFromEmail(fromEmail);
      const location = r.location;
      const phones = r.phones;
      const aboutBlurb: string | null = null;

      const companyType =
        r.companyType ||
        suggestCompanyType(company, aboutBlurb, r.location) ||
        null;

      const scored = scoreImportedLead(
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
        companyType,
        tags: ["imported"],
        fitScore: scored.score,
        fitReasons: scored.reasons,
        sourceUrl: website || "import",
        status: "new" as const,
        crmStage: r.crmStage ?? ("new" as const),
        contactMethods: r.contactMethods ?? [],
        notes: null,
        followUps: [],
        customFields: {},
        createdAt: nowIso(),
      };
    });

    if (leads.length > 0) await db.createLeads(leads);
    if (leads.length > 0) await recordLeadUsage(ctx, leads.length);

    // COUNT(*) — avoid reloading every lead row on each chunk.
    const boardCount = await db.countLeads({ boardId });
    const parts: string[] = [];
    if (merged > 0) {
      parts.push(`updated ${merged} already in workspace (same company name)`);
    }
    if (skipped > 0) {
      parts.push(
        `${skipped} already in workspace — no new fields (same company name)`,
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

/** Mark abandoned search runs (worker kill / client drop) as failed. */
export async function healStuckSearchRuns(ctx: Ctx): Promise<void> {
  const runs = await ctx.db.listRuns();
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const r of runs) {
    if (r.provider === "import" || r.status !== "running") continue;
    const started = Date.parse(r.createdAt);
    if (!Number.isFinite(started) || started > cutoff) continue;
    await ctx.db.updateRun(r.id, {
      status: "failed",
      error: "Search timed out — try again.",
      completedAt: nowIso(),
    });
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

/** Platform-wide admin Users table (caller must gate on isAdminSession). */
export async function listAdminUsers(ctx: Ctx): Promise<AdminUserRow[]> {
  const [workspaces, counts, authUsers, firecrawlCredits] = await Promise.all([
    ctx.db.listWorkspaces(),
    ctx.db.adminCountByWorkspace(),
    ctx.db.listAuthUsers(),
    getFirecrawlRemainingCredits(),
  ]);
  const emailByUserId = new Map(
    authUsers.map((u) => [u.id, { email: u.email, name: u.name }] as const),
  );
  // Platform admins are operators, not tracked tenants.
  const adminUserIds = new Set(
    authUsers.filter((u) => u.isAdmin).map((u) => u.id),
  );

  return workspaces
    .filter((w) => !w.ownerUserId || !adminUserIds.has(w.ownerUserId))
    .map((w) => {
      const plan = getPlan(w.planId);
      const owner = w.ownerUserId ? emailByUserId.get(w.ownerUserId) : undefined;
      const insider = w.planId === "insider";
      return {
        workspaceId: w.id,
        workspaceName: w.name,
        ownerUserId: w.ownerUserId,
        ownerEmail: owner?.email ?? null,
        ownerName: owner?.name ?? null,
        planId: w.planId,
        leadsUsedThisMonth: w.leadsUsedThisMonth,
        leadsLimit: insider
          ? (firecrawlCredits ?? 0)
          : plan.leadCreditsPerMonth,
        firecrawlCreditsRemaining: insider ? firecrawlCredits : null,
        sendsUsedThisMonth: w.sendsUsedThisMonth,
        sendsLimit: plan.sendsPerMonth,
        verifiesUsedToday: w.verifiesUsedToday,
        verifiesLimit: plan.verifiesPerDay,
        leadCount: counts.leads[w.id] ?? 0,
        sentCount: counts.sent[w.id] ?? 0,
        runCount: counts.runs[w.id] ?? 0,
        stripeCustomerId: w.stripeCustomerId,
        hasMailbox: Boolean(w.connectedMailbox),
        hasEasySendKey: Boolean(w.resendApiKey || w.mailerooApiKey),
        emailVerifyEnabled: w.emailVerifyEnabled !== false,
        findLeadsEnabled: w.findLeadsEnabled !== false,
        createdAt: w.createdAt,
        updatedAt: w.updatedAt,
      };
    });
}

/** Platform-wide admin overview (caller must gate on isAdminSession). */
export async function getAdminPlatformStats(ctx: Ctx): Promise<AdminPlatformStats> {
  const users = await listAdminUsers(ctx);
  const authUsers = await ctx.db.listAuthUsers();
  const byPlan: Record<PlanId, number> = {
    free: 0,
    starter: 0,
    pro: 0,
    agency: 0,
    insider: 0,
  };
  let totalLeads = 0;
  let totalSendsLifetime = 0;
  let totalRuns = 0;
  let leadsUsedThisMonth = 0;
  let sendsUsedThisMonth = 0;
  let verifiesUsedToday = 0;
  let paidWorkspaceCount = 0;
  let withStripeCustomer = 0;
  let withMailbox = 0;
  let withEasySendKey = 0;

  for (const u of users) {
    byPlan[u.planId] = (byPlan[u.planId] ?? 0) + 1;
    totalLeads += u.leadCount;
    totalSendsLifetime += u.sentCount;
    totalRuns += u.runCount;
    leadsUsedThisMonth += u.leadsUsedThisMonth;
    sendsUsedThisMonth += u.sendsUsedThisMonth;
    verifiesUsedToday += u.verifiesUsedToday;
    if (isPaidPlan(u.planId)) paidWorkspaceCount += 1;
    if (u.stripeCustomerId) withStripeCustomer += 1;
    if (u.hasMailbox) withMailbox += 1;
    if (u.hasEasySendKey) withEasySendKey += 1;
  }

  const recentSignups = [...users]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8);

  const nonAdminAuthUsers = authUsers.filter((u) => !u.isAdmin);

  return {
    workspaceCount: users.length,
    userCount:
      nonAdminAuthUsers.length || users.filter((u) => u.ownerUserId).length,
    totalLeads,
    totalSendsLifetime,
    totalRuns,
    leadsUsedThisMonth,
    sendsUsedThisMonth,
    verifiesUsedToday,
    byPlan,
    paidWorkspaceCount,
    withStripeCustomer,
    withMailbox,
    withEasySendKey,
    recentSignups,
  };
}

/**
 * Wipe a workspace’s data + row and (when present) the Auth.js owner.
 * Used by self-serve account deletion and admin user delete.
 * Does not delete platform admins. Cancels Stripe subscription best-effort first.
 */
export async function deleteWorkspaceAccount(
  ctx: Ctx,
  workspaceId: string,
): Promise<void> {
  const { LOCAL_WORKSPACE_ID } = await import("@/lib/db");
  if (workspaceId === LOCAL_WORKSPACE_ID) {
    throw new Error("Cannot delete the local demo workspace");
  }
  const ws = await ctx.db.getWorkspace(workspaceId);
  if (!ws) throw new NotFoundError("Workspace not found");

  if (ws.ownerUserId) {
    const authUsers = await ctx.db.listAuthUsers();
    const owner = authUsers.find((u) => u.id === ws.ownerUserId);
    if (owner?.isAdmin) {
      throw new Error("Cannot delete a platform admin account");
    }
  }

  await cancelWorkspaceBilling(ws);

  const scoped = ctx.scopeToWorkspace(workspaceId);
  await scoped.clearWorkspaceData();
  if (ws.ownerUserId) {
    await ctx.db.deleteAuthUser(ws.ownerUserId);
  }
  await ctx.db.deleteWorkspace(workspaceId);
}

/** Self-serve: delete the signed-in user’s workspace + auth identity. */
export async function deleteOwnAccount(ctx: Ctx): Promise<void> {
  await deleteWorkspaceAccount(ctx, ctx.workspaceId);
}

/** Admin: toggle Find leads (Search) for any workspace. */
export async function setFindLeadsEnabled(
  ctx: Ctx,
  workspaceId: string,
  enabled: boolean,
): Promise<void> {
  const existing = await ctx.db.getWorkspace(workspaceId);
  if (!existing) throw new NotFoundError("Workspace not found");
  await ctx.db.updateWorkspace(workspaceId, {
    findLeadsEnabled: enabled,
    updatedAt: nowIso(),
  });
}
