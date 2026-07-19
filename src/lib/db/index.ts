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
} from "@/lib/types";
import { JsonStore } from "./json-store";
import { D1Store, type D1Database } from "./d1-store";

/** The implicit single-tenant workspace used in local dev / demo mode. */
export const LOCAL_WORKSPACE_ID = "local";

/**
 * Repository abstraction for persistence.
 *
 * The app only ever talks to this interface, never to a concrete store. The
 * concrete backend is chosen by getDb():
 *
 *  • D1Store  — selected when a Cloudflare D1Database binding is passed in.
 *               In production (Workers + OpenNext), API routes call:
 *                 import { getRequestContext } from "@opennextjs/cloudflare";
 *                 const db = getDb(getRequestContext().env.DB);
 *               That wiring happens in the Cloudflare deploy phase (Phase 4).
 *
 *  • JsonStore — the zero-key default used in local dev, demo mode, and CI.
 *               Works offline with no external services (constitution Art. I.2).
 *
 * No binding is needed today: local dev always lands on JsonStore. Adding the
 * D1 binding at deploy time is a one-liner in each API route — no service or
 * UI changes required.
 */
export interface LeadListFilter {
  runId?: string;
  boardId?: string;
}

export interface LeadRepository {
  // Workspaces (tenant + plan + usage). NOT workspace-scoped: these operate on
  // the workspaces table directly by id/owner/customer.
  getWorkspace(id: string): Promise<Workspace | null>;
  getWorkspaceByOwner(ownerUserId: string): Promise<Workspace | null>;
  getWorkspaceByStripeCustomer(customerId: string): Promise<Workspace | null>;
  createWorkspace(workspace: Workspace): Promise<Workspace>;
  updateWorkspace(id: string, patch: Partial<Workspace>): Promise<Workspace | null>;
  /** All workspaces (admin). Not scoped. */
  listWorkspaces(): Promise<Workspace[]>;
  /**
   * Cross-workspace counts for admin dashboards.
   * Keys are workspace ids.
   */
  adminCountByWorkspace(): Promise<{
    leads: Record<string, number>;
    sent: Record<string, number>;
    runs: Record<string, number>;
  }>;
  /** Auth.js users table (D1) or derived from workspaces (JSON). */
  listAuthUsers(): Promise<
    Array<{ id: string; email: string | null; name: string | null }>
  >;

  // Boards (named lead collections — ADR 0014)
  createBoard(board: Board): Promise<Board>;
  updateBoard(id: string, patch: Partial<Board>): Promise<Board | null>;
  getBoard(id: string): Promise<Board | null>;
  /** Cross-workspace board lookup (sharing). */
  getBoardAnywhere(id: string): Promise<Board | null>;
  listBoards(): Promise<Board[]>;
  deleteBoard(id: string): Promise<boolean>;

  // Board sharing (ADR 0015) — not workspace-scoped
  listBoardMembers(boardId: string): Promise<BoardMember[]>;
  upsertBoardMember(member: BoardMember): Promise<BoardMember>;
  removeBoardMember(boardId: string, userId: string): Promise<boolean>;
  listBoardIdsForMember(userId: string): Promise<string[]>;
  createBoardInvite(invite: BoardInvite): Promise<BoardInvite>;
  updateBoardInvite(
    id: string,
    patch: Partial<BoardInvite>,
  ): Promise<BoardInvite | null>;
  getBoardInvite(id: string): Promise<BoardInvite | null>;
  listPendingInvitesForEmail(email: string): Promise<BoardInvite[]>;
  listPendingInvitesForBoard(boardId: string): Promise<BoardInvite[]>;
  getBoardLock(boardId: string): Promise<BoardLock | null>;
  upsertBoardLock(lock: BoardLock): Promise<BoardLock>;
  clearBoardLock(boardId: string, userId?: string): Promise<boolean>;
  /** Role when user is a member; null if not. */
  getMemberRole(boardId: string, userId: string): Promise<BoardMemberRole | null>;

  // Runs
  createRun(run: Run): Promise<Run>;
  updateRun(id: string, patch: Partial<Run>): Promise<Run | null>;
  getRun(id: string): Promise<Run | null>;
  listRuns(): Promise<Run[]>;

  // Leads
  createLeads(leads: Lead[]): Promise<Lead[]>;
  updateLead(id: string, patch: Partial<Lead>): Promise<Lead | null>;
  /** Batch patch (one write / D1 batch) — used by chunked import merges. */
  updateLeads(
    patches: Array<{ id: string; patch: Partial<Lead> }>,
  ): Promise<number>;
  getLead(id: string): Promise<Lead | null>;
  listLeads(filter?: LeadListFilter): Promise<Lead[]>;
  /** Fast count for import progress (avoids loading every lead row). */
  countLeads(filter?: LeadListFilter): Promise<number>;
  /** Deletes the lead and its outreach row(s). */
  deleteLead(id: string): Promise<boolean>;
  /** Bulk delete leads + their outreach. Returns number removed. */
  deleteLeads(ids: string[]): Promise<number>;

  // Outreach
  upsertOutreach(outreach: Outreach): Promise<Outreach>;
  updateOutreach(id: string, patch: Partial<Outreach>): Promise<Outreach | null>;
  /**
   * Atomic send claim: `approved` → `sending` (or reclaim stuck `sending`).
   * Returns null if another sender already claimed it.
   */
  claimOutreachForSend(id: string): Promise<Outreach | null>;
  getOutreach(id: string): Promise<Outreach | null>;
  getOutreachByLead(leadId: string): Promise<Outreach | null>;
  listOutreach(): Promise<Outreach[]>;

  /**
   * Cross-workspace: latest sent outreach for a recipient (inbound reply match).
   * Prefer tag-based matching when provider tags are present.
   */
  findLatestSentByEmail(email: string): Promise<Outreach | null>;

  /**
   * Sends in the last minute (workspace-scoped) for rate limiting across
   * Worker isolates. Counts `sent` (by sent_at) and in-flight `sending`.
   * Pass `excludeId` so the current claim doesn’t count against itself.
   */
  countRecentSendActivity(sinceIso: string, excludeId?: string): Promise<number>;

  /** Wipe runs/leads/outreach/boards for this workspace (keeps the workspace row). */
  clearWorkspaceData(): Promise<void>;
}

/**
 * Return a repository scoped to a single workspace.
 *
 *  • D1Store  — when a Cloudflare D1Database binding is passed (Workers runtime).
 *  • JsonStore — the zero-key default for local dev / demo mode. Instances are
 *    cheap and share a module-level write chain (see json-store.ts), so a new
 *    per-request instance per workspace is safe.
 *
 * All reads/writes for runs/leads/outreach are transparently filtered by
 * `workspaceId` inside the store, which is how workspace isolation is enforced
 * (the service layer is what chooses the workspace — constitution Art. II.2).
 * Workspace + auth tables are global (not scoped).
 */
export function getDb(
  binding?: D1Database,
  workspaceId: string = LOCAL_WORKSPACE_ID,
): LeadRepository {
  if (binding) {
    return new D1Store(binding, workspaceId);
  }
  return new JsonStore(workspaceId);
}
