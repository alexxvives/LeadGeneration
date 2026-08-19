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
import {
  activeProfileIdFromJson,
  emptyProfileSendSettings,
  migrateLegacySendSettingsIfNeeded,
  parseProfileSendSettingsMap,
  profileIdsFromJson,
  profileSendSettingsToWorkspaceEmail,
  resolveProfileSendSettings,
  serializeProfileSendSettingsMap,
  toPublicProfileSendSettings,
  workspaceHasEasySendKey,
  type ProfileSendSettings,
  type PublicProfileSendSettings,
} from "@/lib/email/profile-send-settings";
import { checkSendRate } from "@/lib/email/rate-limit";
import { env } from "@/lib/config";
import {
  clearCachedVerify,
  getCachedVerify,
  isVerifyProviderFailure,
  verifyEmail,
} from "@/lib/email/verify";
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
  Outreach,
  PlanId,
  Run,
  ImportLeadRow,
  Workspace,
} from "@/lib/types";
import { normalizeCrmStage } from "@/lib/types";
import { scoreImportedLead } from "@/lib/fit-score";
import {
  contactMethodsEqual,
  contactMethodAddedNote,
} from "@/lib/contact-methods";
import { collapseEmailSentFollowUps, isBounceNote, isContactRegisteredNote, resolveFollowUpKind } from "@/lib/follow-ups";
import { LEAD_HYDRATE_LANES } from "@/lib/lead-lanes";
import {
  companyGuessFromEmail,
  isFreeMailDomain,
  websiteFromEmail,
} from "@/lib/website";
import {
  cleanLeadIdentity,
  sanitizeCompanyName,
  sanitizeContactName,
} from "@/lib/lead-text";

const LOCK_TTL_MS = 150_000; // 2.5 minutes

/** Persist scraped/imported names after stripping emoji and decorative punctuation. */
async function persistCleanedLeadNames(
  db: LeadRepository,
  leads: Lead[],
): Promise<Lead[]> {
  const patches: Array<{ id: string; patch: Partial<Lead> }> = [];
  const next = leads.map((l) => {
    const cleaned = cleanLeadIdentity(l);
    if (
      cleaned.company !== l.company ||
      (cleaned.contactName ?? null) !== (l.contactName ?? null)
    ) {
      patches.push({
        id: l.id,
        patch: {
          company: cleaned.company,
          contactName: cleaned.contactName ?? null,
        },
      });
    }
    return cleaned;
  });
  if (patches.length) await db.updateLeads(patches);
  return next;
}

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

/** First-touch attribution for shared boards — set once, cleared on reset to New. */
function firstContactAttribution(
  ctx: Ctx,
  lead: Lead,
  nextStage: CrmStage | undefined,
): Pick<Lead, "contactedByUserId" | "contactedByName"> | null {
  if (nextStage === "new") {
    return { contactedByUserId: null, contactedByName: null };
  }
  if (nextStage == null || lead.crmStage !== "new") return null;
  if (lead.contactedByUserId || lead.contactedByName) return null;
  const name =
    ctx.userName?.trim() ||
    ctx.userEmail?.trim() ||
    (ctx.userId ? "Teammate" : null);
  if (!ctx.userId && !name) return null;
  return {
    contactedByUserId: ctx.userId,
    contactedByName: name,
  };
}

/** Per-workspace: orphan backfill runs at most once per isolate lifetime. */
const defaultBoardOrphansChecked = new Set<string>();

/**
 * Heal board invariants without auto-creating a "Default" board.
 * - Collapse duplicate `isDefault` boards onto the oldest.
 * - Back-fill orphan leads/runs (empty boardId) onto an existing board once
 *   per workspace per isolate.
 * Returns a fallback board (default flag, else oldest) or null when empty.
 * Users create boards at search/import time (ADR 0023).
 */
export async function ensureDefaultBoard(ctx: Ctx): Promise<Board | null> {
  const { db } = ctx;
  const boards = await db.listBoards();
  const defaults = boards
    .filter((b) => b.isDefault)
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    );
  let def = defaults[0] ?? null;

  if (defaults.length > 1 && def) {
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

  if (!def && boards.length > 0) {
    def = [...boards].sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    )[0]!;
  }

  if (def && !defaultBoardOrphansChecked.has(ctx.workspaceId)) {
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
  opts?: { outreachProfileId?: string | null },
): Promise<Board> {
  await ensureDefaultBoard(ctx);
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Board name is required");
  if (trimmed.length > 80) throw new Error("Board name is too long");
  const ws = await ctx.db.getWorkspace(ctx.workspaceId);
  const known = new Set(profileIdsFromJson(ws?.outreachProfilesJson));
  let outreachProfileId =
    opts?.outreachProfileId?.trim() ||
    activeProfileIdFromJson(ws?.outreachProfilesJson);
  if (outreachProfileId && known.size > 0 && !known.has(outreachProfileId)) {
    outreachProfileId = activeProfileIdFromJson(ws?.outreachProfilesJson);
  }
  const now = nowIso();
  return ctx.db.createBoard({
    id: newId("board"),
    workspaceId: ctx.workspaceId,
    name: trimmed,
    isDefault: false,
    outreachProfileId: outreachProfileId ?? null,
    // Inherit workspace default so Settings → new board stays consistent.
    emailVerifyEnabled: ws?.emailVerifyEnabled !== false,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateBoard(
  ctx: Ctx,
  id: string,
  patch: {
    name?: string;
    outreachProfileId?: string | null;
    emailVerifyEnabled?: boolean;
  },
): Promise<Board> {
  const access = await resolveBoardAccess(ctx, id);
  if (!access || access.access !== "owner" || access.shared) {
    throw new NotFoundError("Board not found");
  }
  const next: Partial<Board> = { updatedAt: nowIso() };
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) throw new Error("Board name is required");
    if (trimmed.length > 80) throw new Error("Board name is too long");
    next.name = trimmed;
  }
  if (patch.outreachProfileId !== undefined) {
    const pid = patch.outreachProfileId?.trim() || null;
    if (pid) {
      const ws = await access.db.getWorkspace(access.board.workspaceId);
      const known = profileIdsFromJson(ws?.outreachProfilesJson);
      if (known.length > 0 && !known.includes(pid)) {
        throw new Error("Unknown outreach profile");
      }
    }
    next.outreachProfileId = pid;
  }
  if (patch.emailVerifyEnabled !== undefined) {
    next.emailVerifyEnabled = patch.emailVerifyEnabled;
  }
  const updated = await access.db.updateBoard(id, next);
  if (!updated) throw new NotFoundError("Board not found");
  return updated;
}

/** @deprecated Use updateBoard — kept for any stray imports. */
export async function renameBoard(
  ctx: Ctx,
  id: string,
  name: string,
): Promise<Board> {
  return updateBoard(ctx, id, { name });
}

/**
 * Delete a board. Leads/runs move to another board when one remains;
 * deleting the last board with leads is blocked.
 */
export async function deleteBoard(ctx: Ctx, id: string): Promise<void> {
  const existing = await ctx.db.getBoard(id);
  if (!existing) throw new NotFoundError("Board not found");
  const others = (await ctx.db.listBoards())
    .filter((b) => b.id !== id)
    .sort(
      (a, b) =>
        Number(b.isDefault) - Number(a.isDefault) ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    );
  const leads = await ctx.db.listLeads({ boardId: id });
  const runs = (await ctx.db.listRuns()).filter((r) => r.boardId === id);
  const dest = others[0] ?? null;
  if (!dest) {
    if (leads.length > 0) {
      throw new Error("Move or delete leads before removing the last board");
    }
  } else {
    await Promise.all([
      ...leads.map((l) => ctx.db.updateLead(l.id, { boardId: dest.id })),
      ...runs.map((r) => ctx.db.updateRun(r.id, { boardId: dest.id })),
    ]);
  }
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

/** Resolve a boardId or create by name — never invents a Default board. */
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
  throw new Error("Pick or create a board before adding leads");
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
      company: sanitizeCompanyName(l.company),
      website: l.website,
      emails: l.emails,
      phones: l.phones,
      contactName: sanitizeContactName(l.contactName),
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
      contactedByUserId: null,
      contactedByName: null,
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
  const leads = await persistCleanedLeadNames(
    ctx.db,
    await ctx.db.listLeads({ runId }),
  );
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
  opts?: {
    includeLeads?: boolean;
    /** Cap rows returned (progressive hydrate). Omit for all. */
    leadLimit?: number;
    leadOffset?: number;
    /** Round-robin hydrate: N rows from each Pipeline/Outreach lane. */
    leadPerLane?: number;
    leadLaneOffset?: number;
  },
): Promise<{
  run: Run | null;
  leads: LeadWithOutreach[];
  /** Total leads matching the board filter (even when paged). */
  leadsTotal: number;
  /** True when more pages remain after this response. */
  leadsHasMore: boolean;
  /** DB truth for Pipeline column badges (not limited to loaded pages). */
  crmStageCounts: Record<CrmStage, number>;
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
  const filter = active ? { boardId: active } : undefined;

  const emptyStageCounts = (): Record<CrmStage, number> => ({
    new: 0,
    contacted: 0,
    in_conversation: 0,
    closed: 0,
    not_interested: 0,
  });

  const toStageCounts = (
    byCrmStage: Record<string, number>,
  ): Record<CrmStage, number> => {
    const next = emptyStageCounts();
    for (const stage of Object.keys(next) as CrmStage[]) {
      next[stage] = Number(byCrmStage[stage] ?? 0) || 0;
    }
    return next;
  };

  if (!includeLeads) {
    const [leadsTotal, summary] = await Promise.all([
      leadDb.countLeads(filter),
      leadDb.summarizeLeads(filter),
    ]);
    return {
      run: null,
      leads: [],
      leadsTotal,
      leadsHasMore: false,
      crmStageCounts: toStageCounts(summary.byCrmStage),
      boards,
      activeBoardId: active,
      boardLock,
    };
  }

  const run =
    (active
      ? await leadDb.getLatestRun({ boardId: active, status: "complete" })
      : null) ??
    (await leadDb.getLatestRun({ status: "complete" })) ??
    (await leadDb.getLatestRun());

  const perLane =
    opts?.leadPerLane != null && opts.leadPerLane > 0
      ? Math.floor(opts.leadPerLane)
      : null;
  const laneOffset = Math.max(0, opts?.leadLaneOffset ?? 0);
  const offset = Math.max(0, opts?.leadOffset ?? 0);
  const limit = opts?.leadLimit;
  const listLeads =
    perLane != null
      ? Promise.all(
          LEAD_HYDRATE_LANES.map((lane) =>
            leadDb.listLeads({
              ...filter,
              lane,
              limit: perLane,
              offset: laneOffset,
            }),
          ),
        ).then((pages) => ({
          raw: pages.flat(),
          hasMore: pages.some((p) => p.length >= perLane),
        }))
      : leadDb
          .listLeads({
            ...filter,
            ...(limit != null ? { limit, offset } : {}),
          })
          .then((raw) => ({
            raw,
            hasMore: false,
          }));
  const [leadsTotal, summary, listed] = await Promise.all([
    leadDb.countLeads(filter),
    leadDb.summarizeLeads(filter),
    listLeads,
  ]);
  const rawLeads = listed.raw;
  const leads = await persistCleanedLeadNames(leadDb, rawLeads);
  const leadsHasMore =
    perLane != null
      ? listed.hasMore
      : limit != null
        ? offset + leads.length < leadsTotal
        : false;
  return {
    run,
    // Slim list: no email bodies / blurbs — drawer fetches full detail on open.
    leads: await attachOutreach(leadDb, leads, { slim: true }),
    leadsTotal,
    leadsHasMore,
    crmStageCounts: toStageCounts(summary.byCrmStage),
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
  opts?: { slim?: boolean },
): Promise<LeadWithOutreach[]> {
  const rows = await db.listOutreachByLeadIds(
    leads.map((l) => l.id),
    opts?.slim ? { omitBody: true } : undefined,
  );
  const byLead = new Map(rows.map((o) => [o.leadId, o]));
  return leads.map((l) => {
    const outreach = byLead.get(l.id) ?? null;
    if (!opts?.slim) {
      return { ...l, outreach, detailLoaded: true };
    }
    // List rows: drop blurb/notes/body so 3k boards stay fast over the wire.
    return {
      ...l,
      aboutBlurb: null,
      notes: null,
      outreach: outreach
        ? { ...outreach, body: "" }
        : null,
      detailLoaded: false,
    };
  });
}

/** Full lead + outreach for drawer / edit (not the slim board list). */
export async function getLeadWithOutreach(
  ctx: Ctx,
  leadId: string,
): Promise<LeadWithOutreach | null> {
  let db = ctx.db;
  let lead = await db.getLead(leadId);
  if (!lead && ctx.userId) {
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
  const [cleaned] = await persistCleanedLeadNames(db, [lead]);
  const [row] = await attachOutreach(db, [cleaned ?? lead], { slim: false });
  return row ?? null;
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
  // Preserve send audit trail — never reopen in-flight or sent mail (Art. I.1).
  if (existing?.status === "sent" || existing?.status === "sending") {
    return existing;
  }
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
  if (newTo && (existing.status === "rejected" || !existing.toEmail)) {
    if (existing.status === "rejected") {
      nextPatch.status = "draft";
    }
    nextPatch.error = null;
    const lead = await ctx.db.getLead(existing.leadId);
    if (lead) {
      const emails = lead.emails.some((e) => e.toLowerCase() === newTo.toLowerCase())
        ? lead.emails
        : [...lead.emails, newTo];
      await ctx.db.updateLead(lead.id, {
        emails,
        status: existing.status === "rejected" ? "queued" : lead.status,
      });
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

  let restoredTo: string | null | undefined;
  if (decision === "approved" && !existing.toEmail) {
    const lead = await db.getLead(existing.leadId);
    restoredTo = lead?.emails.find((e) => e.trim())?.trim() || null;
  }
  const outreach = await db.updateOutreach(outreachId, {
    status: decision,
    error: decision === "approved" ? null : existing.error,
    ...(restoredTo ? { toEmail: restoredTo } : {}),
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
  /** Updated journal after send (includes dated "Email sent by …" note). */
  followUps?: FollowUp[];
  error?: string;
  rateLimited?: boolean;
  retryAfterMs?: number;
  /**
   * True when verify hard-failed (disposable / no-reply) and we stripped the
   * address + rejected the outreach. Soft Invalid never sets this.
   */
  undeliverableRemoved?: boolean;
  /**
   * Soft verify block — address kept, outreach stays approved. Client may
   * retry with skipVerify after the user confirms.
   */
  verifyBlocked?: boolean;
  canForce?: boolean;
  verifyReason?: string | null;
  /** Transport that delivered (or would have, for local demo). */
  provider?: "google" | "resend" | "maileroo" | "smtp" | "demo";
}

/**
 * Send a single APPROVED outreach. Enforces (in order):
 *  - atomic claim approved→sending (prevents double-send)
 *  - a valid recipient
 *  - email verify (optional) — soft-block on Invalid, strip only hard junk
 *  - monthly send quota (metered workspaces only) — throws QuotaError → 402
 *  - rate limiting
 * Studio Send may auto-approve a draft first (per-lead human gate = Send click).
 */
export async function sendApprovedOutreach(
  ctx: Ctx,
  outreachId: string,
  opts?: { skipVerify?: boolean },
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
  // Prior verify hard-cleanups (or a re-added CRM email) can leave outreach.To
  // empty while the lead still has an address — heal before failing the send.
  let toEmail = outreach.toEmail?.trim() ?? "";
  if (!toEmail) {
    const lead = await db.getLead(outreach.leadId);
    toEmail = lead?.emails.find((e) => e.trim())?.trim() ?? "";
    if (!toEmail) {
      await releaseClaim("No recipient email on this lead");
      return { ok: false, error: "No recipient email on this lead" };
    }
    await db.updateOutreach(outreachId, {
      toEmail,
      error: null,
      updatedAt: nowIso(),
    });
  }

  // List hygiene — verify at send only (not on enrich). Per-board flag (ADR 0025).
  const wsForVerify = await db.getWorkspace(ctx.workspaceId);
  const leadForVerify = await db.getLead(outreach.leadId);
  const boardForVerify = leadForVerify?.boardId
    ? ((await db.getBoard(leadForVerify.boardId)) ??
      (await ctx.db.getBoardAnywhere(leadForVerify.boardId)))
    : null;
  const verifyOn =
    !opts?.skipVerify &&
    (boardForVerify
      ? boardForVerify.emailVerifyEnabled !== false
      : wsForVerify?.emailVerifyEnabled !== false);
  if (verifyOn && wsForVerify) {
    const verifyWs = await ensureVerifyWindow(db, wsForVerify);
    const plan = getPlan(verifyWs.planId);
    const hasVerifyProvider = Boolean(env.myEmailVerifierKey());
    const cached = getCachedVerify(toEmail);
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

    const verified = await verifyEmail(toEmail);
    if (verified.billed) {
      await db.incrementWorkspaceUsage(ctx.workspaceId, { verifies: 1 });
    } else if (isVerifyProviderFailure(verified)) {
      // Toggle on but live check never completed — do not fail-open silently.
      clearCachedVerify(toEmail);
      const detail = verified.reason?.trim() || "unknown";
      await releaseClaim(`verify_provider_failed:${detail}`);
      const authish = /invalid api key|unauthorized|user not found/i.test(detail);
      const networkish =
        /verify_timeout|verify_network|verify_error|verify_http_/i.test(detail);
      return {
        ok: false,
        error:
          verified.provider === "heuristic"
            ? "Email verify is on but MYEMAILVERIFIER_API_KEY is not set on the server."
            : authish
              ? `MyEmailVerifier rejected the API key (${detail}). Update the Wrangler secret MYEMAILVERIFIER_API_KEY from your MEV dashboard, or turn verify off in Settings → Sending.`
              : networkish
                ? `MyEmailVerifier request failed (${detail}). Usually a timeout or network blip between our server and MEV — not your credits. Retry send, or turn verify off in Settings → Sending.`
                : `MyEmailVerifier failed (${detail}). Check credits/account at myemailverifier.com, or turn verify off in Settings → Sending.`,
      };
    }
    if (!verified.okToSend) {
      // Hard junk only — disposable / no-reply / empty. Soft Invalid keeps the
      // address (MEV false-positives on info@ + greylisted SMBs are common).
      if (verified.hardFail) {
        const lead = await db.getLead(outreach.leadId);
        const bad = toEmail.toLowerCase();
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

      const detail = verified.reason?.trim() || "marked undeliverable";
      await releaseClaim(`verify_blocked:${detail}`);
      return {
        ok: false,
        verifyBlocked: true,
        canForce: true,
        verifyReason: verified.reason,
        error: `Verifier isn't sure ${toEmail} can receive mail (${detail}). Soft checks false-positive often — you can send anyway if you trust it.`,
      };
    }
  } else if (opts?.skipVerify) {
    // Force path — drop a soft-block cache entry so a later normal send rechecks.
    clearCachedVerify(toEmail);
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

  const wsForEmail = await ensureProfileSendSettingsMigrated(ctx);
  const cleanBody = stripLegacyCompliance(outreach.body);
  const leadForProfile = await db.getLead(outreach.leadId);
  const boardProfileId = leadForProfile
    ? await profileIdForLead(db, leadForProfile)
    : null;
  const sendIdentity = wsForEmail
    ? resolveSendIdentity(wsForEmail, boardProfileId)
    : undefined;
  const result = await sendEmail(
    {
      to: toEmail,
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
    sendIdentity,
  );

  // Production (metered): never treat demo/no-transport as a real send.
  if (result.ok && result.provider === "demo" && ctx.metered) {
    const msg =
      "No email transport configured. Add Resend, Maileroo, or SMTP in Settings → Easy.";
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
    const updated = await db.updateOutreach(outreachId, {
      status: "sent",
      deliveryStatus: "sent",
      sentAt: nowIso(),
      error: null,
      updatedAt: nowIso(),
    });
    const lead = leadForProfile ?? (await db.getLead(outreach.leadId));
    const crmPatch: Partial<Lead> = { status: "sent" };
    if (lead) {
      if (lead.crmStage === "new") crmPatch.crmStage = "contacted";
      if (!lead.contactMethods.includes("email")) {
        crmPatch.contactMethods = [...lead.contactMethods, "email"];
      }
      const attr = firstContactAttribution(
        ctx,
        lead,
        crmPatch.crmStage ?? lead.crmStage,
      );
      if (attr) Object.assign(crmPatch, attr);
      const existing = lead.followUps ?? [];
      const today = nowIso().slice(0, 10);
      const actor =
        attr?.contactedByName?.trim() ||
        lead.contactedByName?.trim() ||
        ctx.userName?.trim() ||
        ctx.userEmail?.trim() ||
        null;
      const emailSentNote = actor
        ? `Email sent by ${actor}`
        : "Email sent";
      // App send always journals its own line — chip logs can add more the
      // same day; collapse only drops a bare "Email sent" duplicate.
      const followUps = [
        {
          id: newId("fu"),
          date: today,
          note: emailSentNote,
          done: true,
          kind: "email" as const,
        },
        ...existing,
      ];
      crmPatch.followUps = collapseEmailSentFollowUps(followUps, actor);
    }
    await db.updateLead(outreach.leadId, crmPatch);
    await db.incrementWorkspaceUsage(ctx.workspaceId, { sends: 1 });
    return {
      ok: true,
      outreach: updated ?? undefined,
      followUps: crmPatch.followUps,
      provider: result.provider,
    };
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

  const ws = await ensureProfileSendSettingsMigrated(ctx);
  const sendIdentity = ws ? resolveSendIdentity(ws) : undefined;
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
    sendIdentity,
  );

  if (result.ok && result.provider === "demo") {
    if (ctx.metered) {
      return {
        ok: false,
        provider: "demo",
        error:
          "No email transport configured. Add Resend, Maileroo, or SMTP in Settings → Easy.",
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

/** Decode leftover `%20` prefixes / encoded spaces so bounce matching is exact. */
function normalizeBounceAddr(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    decoded = trimmed.replace(/%20/gi, " ");
  }
  return decoded.trim().toLowerCase();
}

function emailsWithoutBounced(emails: string[], bouncedAddr: string): string[] {
  if (bouncedAddr) {
    const next = emails.filter((e) => normalizeBounceAddr(e) !== bouncedAddr);
    if (next.length !== emails.length) return next;
  }
  // Unknown recipient + a single leftover address: that address is the bounce.
  if (emails.length === 1) return [];
  return emails;
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

  const outreachPatch: Partial<Outreach> = {};
  if (deliveryStatus !== prev) {
    outreachPatch.deliveryStatus = deliveryStatus;
    outreachPatch.updatedAt = nowIso();
  }

  // Bounce: address never landed — drop it, undo Contacted. Not a follow-up.
  // Idempotent: already-bounced rows from before strip-on-bounce still get cleaned.
  if (deliveryStatus === "bounced") {
    const firstBounce = prev !== "bounced";
    const lead = await ctx.db.getLead(existing.leadId);
    if (lead) {
      const patch: Partial<Lead> = {};
      const bouncedAddr = normalizeBounceAddr(existing.toEmail);
      const nextEmails = emailsWithoutBounced(lead.emails, bouncedAddr);
      if (nextEmails.join("\0") !== lead.emails.join("\0")) {
        patch.emails = nextEmails;
      }
      const nextTo = nextEmails.find((e) => e.trim())?.trim() ?? null;
      const currentTo = existing.toEmail?.trim() || null;
      if (currentTo !== nextTo) {
        outreachPatch.toEmail = nextTo;
        outreachPatch.updatedAt = nowIso();
      }
      const methods = lead.contactMethods ?? [];
      const withoutEmail = methods.filter((m) => m !== "email");
      if (withoutEmail.length !== methods.length) {
        patch.contactMethods = withoutEmail;
      }
      // Send path moves new → contacted; bounce means that contact didn't happen.
      if (firstBounce && lead.crmStage === "contacted" && withoutEmail.length === 0) {
        patch.crmStage = "new";
      }
      const withoutBounceNotes = (lead.followUps ?? []).filter(
        (f) => !f.note.trim().toLowerCase().startsWith("email bounced"),
      );
      if (withoutBounceNotes.length !== (lead.followUps ?? []).length) {
        patch.followUps = withoutBounceNotes;
      }
      if (Object.keys(patch).length > 0) {
        await ctx.db.updateLead(existing.leadId, patch);
      }
    }
  }

  let outreach: Outreach | null = existing;
  if (Object.keys(outreachPatch).length > 0) {
    outreach = await ctx.db.updateOutreach(outreachId, outreachPatch);
    if (!outreach) return null;
  }

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
      const existingFu = lead.followUps ?? [];
      const hasReplyNote = existingFu.some(
        (f) => f.note.trim().toLowerCase() === "reply received" && f.date === today,
      );
      if (!hasReplyNote) {
        patch.followUps = [
          {
            id: newId("fu"),
            date: today,
            note: "Reply received",
            done: false,
            kind: "follow_up",
          },
          ...existingFu,
        ];
      }
      if (Object.keys(patch).length > 0) {
        await ctx.db.updateLead(outreach.leadId, patch);
      }
    }
  }

  return outreach;
}

function resolveSendIdentity(ws: Workspace, profileId?: string | null) {
  const { settings } = resolveProfileSendSettings(ws, profileId);
  return profileSendSettingsToWorkspaceEmail(settings);
}

/** Board-linked profile for a lead, else null (caller falls back to active). */
async function profileIdForLead(
  db: LeadRepository,
  lead: Lead,
): Promise<string | null> {
  if (!lead.boardId) return null;
  const board =
    (await db.getBoard(lead.boardId)) ??
    (await db.getBoardAnywhere(lead.boardId));
  return board?.outreachProfileId?.trim() || null;
}

/** Persist one-time legacy → per-profile seed when the map is empty. */
async function ensureProfileSendSettingsMigrated(
  ctx: Ctx,
): Promise<Workspace | null> {
  const existing = await ctx.db.getWorkspace(ctx.workspaceId);
  if (!existing) return null;
  const seeded = migrateLegacySendSettingsIfNeeded(existing);
  if (!seeded) return existing;
  return (
    (await ctx.db.updateWorkspace(ctx.workspaceId, {
      profileSendSettingsJson: seeded,
      updatedAt: nowIso(),
    })) ?? existing
  );
}

function mergeProfileSendPatch(
  base: ProfileSendSettings,
  patch: {
    fromName?: string | null;
    fromEmail?: string | null;
    replyTo?: string | null;
    physicalAddress?: string | null;
    resendApiKey?: string | null;
    mailerooApiKey?: string | null;
    smtpHost?: string | null;
    smtpPort?: number | null;
    smtpUser?: string | null;
    smtpPass?: string | null;
    easyEmailProvider?: EasyEmailProvider;
    preferredSendPath?: "easy" | null;
  },
): ProfileSendSettings {
  const next = { ...base };
  if (patch.fromName !== undefined) next.fromName = patch.fromName;
  if (patch.fromEmail !== undefined) next.fromEmail = patch.fromEmail;
  if (patch.replyTo !== undefined) next.replyTo = patch.replyTo;
  if (patch.physicalAddress !== undefined) {
    next.physicalAddress = patch.physicalAddress;
  }
  if (patch.easyEmailProvider !== undefined) {
    next.easyEmailProvider = patch.easyEmailProvider;
  }
  if (patch.preferredSendPath !== undefined) {
    next.preferredSendPath = patch.preferredSendPath === "easy" ? "easy" : null;
  }
  if (patch.resendApiKey !== undefined) next.resendApiKey = patch.resendApiKey;
  if (patch.mailerooApiKey !== undefined) {
    next.mailerooApiKey = patch.mailerooApiKey;
  }
  if (patch.smtpHost !== undefined) next.smtpHost = patch.smtpHost;
  if (patch.smtpPort !== undefined) next.smtpPort = patch.smtpPort;
  if (patch.smtpUser !== undefined) next.smtpUser = patch.smtpUser;
  if (patch.smtpPass !== undefined) next.smtpPass = patch.smtpPass;
  return next;
}

/** Public send settings for Settings UI (active profile or explicit id). */
export async function getPublicProfileSendSettings(
  ctx: Ctx,
  profileId?: string | null,
): Promise<{
  profileId: string | null;
  send: PublicProfileSendSettings;
  sendByProfile: Record<string, PublicProfileSendSettings>;
  outreachProfilesJson: string | null;
}> {
  let ws = await ensureProfileSendSettingsMigrated(ctx);
  if (!ws) {
    return {
      profileId: null,
      send: toPublicProfileSendSettings(emptyProfileSendSettings()),
      sendByProfile: {},
      outreachProfilesJson: null,
    };
  }
  let map = parseProfileSendSettingsMap(ws.profileSendSettingsJson);
  const requested =
    (profileId && profileId.trim()) ||
    activeProfileIdFromJson(ws.outreachProfilesJson);
  // Persist an empty shell so later saves don't fall through to legacy.
  if (requested && !map[requested] && Object.keys(map).length > 0) {
    map = { ...map, [requested]: emptyProfileSendSettings() };
    const saved = await ctx.db.updateWorkspace(ctx.workspaceId, {
      profileSendSettingsJson: serializeProfileSendSettingsMap(map),
      updatedAt: nowIso(),
    });
    if (saved) {
      ws = saved;
      map = parseProfileSendSettingsMap(ws.profileSendSettingsJson);
    }
  }
  const sendByProfile: Record<string, PublicProfileSendSettings> = {};
  for (const [id, settings] of Object.entries(map)) {
    sendByProfile[id] = toPublicProfileSendSettings(settings);
  }
  const resolved = resolveProfileSendSettings(ws, profileId);
  // Include resolved even when still on legacy fallback (not yet in map).
  if (resolved.profileId && !sendByProfile[resolved.profileId]) {
    sendByProfile[resolved.profileId] = toPublicProfileSendSettings(
      resolved.settings,
    );
  }
  return {
    profileId: resolved.profileId,
    send: toPublicProfileSendSettings(resolved.settings),
    sendByProfile,
    outreachProfilesJson: ws.outreachProfilesJson,
  };
}

/** Update per-profile (or legacy) email sending identity. */
export async function updateWorkspaceEmailSettings(
  ctx: Ctx,
  patch: {
    profileId?: string | null;
    /** Drop send settings for a deleted outreach profile. */
    removeProfileSendSettings?: string | null;
    /** Ensure an empty send-settings shell exists for a new profile. */
    ensureProfileSendSettings?: string | null;
    fromName?: string | null;
    fromEmail?: string | null;
    replyTo?: string | null;
    physicalAddress?: string | null;
    resendApiKey?: string | null;
    mailerooApiKey?: string | null;
    smtpHost?: string | null;
    smtpPort?: number | null;
    smtpUser?: string | null;
    smtpPass?: string | null;
    easyEmailProvider?: EasyEmailProvider;
    preferredSendPath?: "easy" | null;
    emailVerifyEnabled?: boolean;
    outreachProfilesJson?: string | null;
  },
): Promise<{ emailVerifyEnabled: boolean }> {
  const existing = await ensureProfileSendSettingsMigrated(ctx);
  if (!existing) {
    throw new NotFoundError(
      "Workspace not found — sign in again, then re-save Settings.",
    );
  }

  const nextPatch: Partial<Workspace> = {
    updatedAt: nowIso(),
  };

  if (patch.emailVerifyEnabled !== undefined) {
    nextPatch.emailVerifyEnabled = patch.emailVerifyEnabled;
  }
  if (patch.outreachProfilesJson !== undefined) {
    nextPatch.outreachProfilesJson = patch.outreachProfilesJson;
  }

  const map = parseProfileSendSettingsMap(existing.profileSendSettingsJson);
  let mapDirty = false;

  if (patch.removeProfileSendSettings?.trim()) {
    const rid = patch.removeProfileSendSettings.trim();
    if (rid in map) {
      delete map[rid];
      mapDirty = true;
    }
  }

  if (patch.ensureProfileSendSettings?.trim()) {
    const eid = patch.ensureProfileSendSettings.trim();
    if (!(eid in map)) {
      map[eid] = emptyProfileSendSettings();
      mapDirty = true;
    }
  }

  const sendFieldTouched =
    patch.fromName !== undefined ||
    patch.fromEmail !== undefined ||
    patch.replyTo !== undefined ||
    patch.physicalAddress !== undefined ||
    patch.resendApiKey !== undefined ||
    patch.mailerooApiKey !== undefined ||
    patch.smtpHost !== undefined ||
    patch.smtpPort !== undefined ||
    patch.smtpUser !== undefined ||
    patch.smtpPass !== undefined ||
    patch.easyEmailProvider !== undefined ||
    patch.preferredSendPath !== undefined;

  const targetProfileId =
    (patch.profileId && patch.profileId.trim()) ||
    activeProfileIdFromJson(
      patch.outreachProfilesJson !== undefined
        ? patch.outreachProfilesJson
        : existing.outreachProfilesJson,
    );

  if (sendFieldTouched) {
    if (!targetProfileId) {
      // No profiles yet — keep writing legacy workspace columns only.
      if (patch.fromName !== undefined) nextPatch.fromName = patch.fromName;
      if (patch.fromEmail !== undefined) nextPatch.fromEmail = patch.fromEmail;
      if (patch.replyTo !== undefined) nextPatch.replyTo = patch.replyTo;
      if (patch.physicalAddress !== undefined) {
        nextPatch.physicalAddress = patch.physicalAddress;
      }
      if (patch.easyEmailProvider !== undefined) {
        nextPatch.easyEmailProvider = patch.easyEmailProvider;
      }
      if (patch.preferredSendPath !== undefined) {
        nextPatch.preferredSendPath =
          patch.preferredSendPath === "easy" ? "easy" : null;
      }
      if (patch.resendApiKey !== undefined) {
        nextPatch.resendApiKey = patch.resendApiKey;
      }
      if (patch.mailerooApiKey !== undefined) {
        nextPatch.mailerooApiKey = patch.mailerooApiKey;
      }
      if (patch.smtpHost !== undefined) nextPatch.smtpHost = patch.smtpHost;
      if (patch.smtpPort !== undefined) nextPatch.smtpPort = patch.smtpPort;
      if (patch.smtpUser !== undefined) nextPatch.smtpUser = patch.smtpUser;
      if (patch.smtpPass !== undefined) nextPatch.smtpPass = patch.smtpPass;
    } else {
      const base =
        map[targetProfileId] ??
        resolveProfileSendSettings(existing, targetProfileId).settings;
      const merged = mergeProfileSendPatch(base, patch);
      map[targetProfileId] = merged;
      mapDirty = true;

      // Mirror active profile into legacy columns for older readers / admin.
      const activeId = activeProfileIdFromJson(
        patch.outreachProfilesJson !== undefined
          ? patch.outreachProfilesJson
          : existing.outreachProfilesJson,
      );
      if (!activeId || activeId === targetProfileId) {
        nextPatch.fromName = merged.fromName;
        nextPatch.fromEmail = merged.fromEmail;
        nextPatch.replyTo = merged.replyTo;
        nextPatch.physicalAddress = merged.physicalAddress;
        nextPatch.easyEmailProvider = merged.easyEmailProvider;
        nextPatch.preferredSendPath = merged.preferredSendPath;
        nextPatch.resendApiKey = merged.resendApiKey;
        nextPatch.mailerooApiKey = merged.mailerooApiKey;
        nextPatch.smtpHost = merged.smtpHost;
        nextPatch.smtpPort = merged.smtpPort;
        nextPatch.smtpUser = merged.smtpUser;
        nextPatch.smtpPass = merged.smtpPass;
      }
    }
  }

  if (mapDirty) {
    nextPatch.profileSendSettingsJson = serializeProfileSendSettingsMap(map);
  }

  // Clearing Resend key also drops webhook credentials on that profile +
  // mirrored workspace columns when the active key is cleared.
  if (patch.resendApiKey === null) {
    if (targetProfileId && map[targetProfileId]) {
      map[targetProfileId] = {
        ...map[targetProfileId]!,
        resendWebhookId: null,
        resendWebhookSecret: null,
      };
      mapDirty = true;
      nextPatch.profileSendSettingsJson =
        serializeProfileSendSettingsMap(map);
    }
    if (nextPatch.resendApiKey === null) {
      nextPatch.resendWebhookId = null;
      nextPatch.resendWebhookSecret = null;
    }
  }

  const profileForWebhook = targetProfileId ? map[targetProfileId] : null;
  const keyForWebhook =
    patch.resendApiKey === null
      ? ""
      : typeof patch.resendApiKey === "string" && patch.resendApiKey.trim()
        ? patch.resendApiKey.trim()
        : profileForWebhook?.resendApiKey?.trim() ||
          existing.resendApiKey?.trim() ||
          "";
  if (keyForWebhook) {
    try {
      const { ensureResendDeliveryWebhook } = await import(
        "@/lib/email/resend-webhooks"
      );
      const ensured = await ensureResendDeliveryWebhook(keyForWebhook, {
        existingId:
          profileForWebhook?.resendWebhookId ?? existing.resendWebhookId,
        existingSecret:
          profileForWebhook?.resendWebhookSecret ??
          existing.resendWebhookSecret,
      });
      if (ensured) {
        // Mirror onto workspace for older readers / platform fallback path.
        nextPatch.resendWebhookId = ensured.id;
        nextPatch.resendWebhookSecret = ensured.signingSecret;
        if (targetProfileId) {
          const base =
            map[targetProfileId] ??
            resolveProfileSendSettings(existing, targetProfileId).settings;
          map[targetProfileId] = {
            ...base,
            resendWebhookId: ensured.id,
            resendWebhookSecret: ensured.signingSecret,
          };
          mapDirty = true;
          nextPatch.profileSendSettingsJson =
            serializeProfileSendSettingsMap(map);
        }
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
  return {
    emailVerifyEnabled: updated.emailVerifyEnabled !== false,
  };
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

/** Soft niche context from the workspace’s active outreach pitch (for fit). */
function pitchContextFromWorkspace(ws: Workspace | null): string | null {
  const raw = ws?.outreachProfilesJson?.trim();
  if (!raw) return null;
  try {
    const store = JSON.parse(raw) as {
      profiles?: Array<{
        id: string;
        pitches?: Partial<Record<string, string>>;
      }>;
      activeId?: string | null;
    };
    const profiles = store.profiles ?? [];
    const active =
      profiles.find((p) => p.id === store.activeId) ?? profiles[0] ?? null;
    if (!active?.pitches) return null;
    const texts = Object.values(active.pitches)
      .map((t) => (typeof t === "string" ? t : ""))
      .filter((t) => t.trim().length > 0);
    return texts.length ? texts.join(" ") : null;
  } catch {
    return null;
  }
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

  const next: typeof patch & {
    fitScore?: number;
    fitReasons?: string[];
    contactedByUserId?: string | null;
    contactedByName?: string | null;
  } = { ...patch };
  if (next.company !== undefined) {
    next.company = sanitizeCompanyName(next.company);
  }

  const stageAfterPreview =
    patch.crmStage ?? lead.crmStage;
  // Attribution first so journal notes can include the actor name.
  const attr = firstContactAttribution(
    ctx,
    lead,
    patch.contactMethods &&
      !contactMethodsEqual(patch.contactMethods, lead.contactMethods) &&
      !patch.crmStage &&
      lead.crmStage === "new"
      ? "contacted"
      : stageAfterPreview,
  );
  if (attr) {
    next.contactedByUserId = attr.contactedByUserId;
    next.contactedByName = attr.contactedByName;
  }
  const actorName =
    attr?.contactedByName?.trim() ||
    lead.contactedByName?.trim() ||
    ctx.userName?.trim() ||
    ctx.userEmail?.trim() ||
    null;

  // Journal only channels that were just added. Phone/email logs are written
  // in the drawer so we don't invent a "Contacted via …" line here.
  if (
    patch.contactMethods &&
    !contactMethodsEqual(patch.contactMethods, lead.contactMethods)
  ) {
    const today = nowIso().slice(0, 10);
    const existing = patch.followUps ?? lead.followUps ?? [];
    const added = patch.contactMethods.filter(
      (m) => !lead.contactMethods.includes(m),
    );
    let followUps = existing;
    for (const method of added) {
      if (method === "phone" || method === "email") continue;
      const entry = contactMethodAddedNote(method, actorName);
      const already = followUps.some(
        (f) =>
          f.note.trim().toLowerCase() === entry.note.toLowerCase() &&
          f.date === today,
      );
      if (already) continue;
      followUps = [
        {
          id: newId("fu"),
          date: today,
          note: entry.note,
          done: true,
          kind: entry.kind,
        },
        ...followUps,
      ];
    }
    if (followUps !== existing) next.followUps = followUps;
    if (!patch.crmStage && lead.crmStage === "new") {
      next.crmStage = "contacted";
    }
  }

  // Manual / edited leads start at 0% — recompute when contactable fields change.
  const fitFieldsChanged =
    patch.company !== undefined ||
    patch.website !== undefined ||
    patch.emails !== undefined ||
    patch.phones !== undefined ||
    patch.location !== undefined ||
    patch.aboutBlurb !== undefined;
  if (fitFieldsChanged) {
    const ws = await ctx.db.getWorkspace(ctx.workspaceId);
    const scored = scoreImportedLead(
      {
        company: next.company ?? lead.company,
        website: patch.website !== undefined ? patch.website : lead.website,
        emails: patch.emails ?? lead.emails,
        phones: patch.phones ?? lead.phones,
        aboutBlurb:
          patch.aboutBlurb !== undefined ? patch.aboutBlurb : lead.aboutBlurb,
        location: patch.location !== undefined ? patch.location : lead.location,
        tags: lead.tags,
        contactName: lead.contactName,
        companyType: lead.companyType,
      },
      pitchContextFromWorkspace(ws),
    );
    next.fitScore = scored.score;
    next.fitReasons = scored.reasons;
  }

  const fus = next.followUps ?? patch.followUps;
  if (fus) {
    next.followUps = collapseEmailSentFollowUps(fus, actorName)
      .filter((f) => !isBounceNote(f.note) && !isContactRegisteredNote(f.note))
      .map((f) => {
        const kind = resolveFollowUpKind(f);
        if (kind === f.kind) return f;
        return {
          ...f,
          kind,
          done:
            kind === "phone" || kind === "email" || kind === "note"
              ? true
              : f.done,
        };
      });
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
    throw new Error("Pick or create a board before adding leads");
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
    contactedByUserId: null,
    contactedByName: null,
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
      company: r.company?.trim()
        ? sanitizeCompanyName(r.company)
        : "",
      website: normalizeWebsiteUrl(r.website) ?? null,
      emails: (r.emails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean),
      phones: (r.phones ?? []).map((p) => p.trim()).filter(Boolean),
      contactName: sanitizeContactName(r.contactName?.trim() || null),
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
    // Name-only within the target board — never silently relocate a lead from
    // another board (multi-board campaigns share common company names).
    const byCompany = new Map<string, Lead>();
    for (const l of prior) {
      if (l.boardId !== boardId) continue;
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
      const company = sanitizeCompanyName(
        rawCompany.replace(/^./, (c) => c.toUpperCase()),
      );
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
          companyType,
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
        contactedByUserId: null,
        contactedByName: null,
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
        hasEasySendKey: workspaceHasEasySendKey(w),
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
