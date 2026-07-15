import { getD1Binding } from "@/lib/cf";
import { getDb, LOCAL_WORKSPACE_ID } from "@/lib/db";
import { authRequired } from "@/lib/config";
import { auth } from "@/auth";
import { getPlan } from "@/lib/plans";
import { ensureUsageWindow, getOrCreateWorkspaceForUser } from "@/lib/workspace";
import type { Ctx } from "@/lib/service";
import type { WorkspaceSummary } from "@/lib/types";

/**
 * Build the per-request service context: the workspace-scoped repository, the
 * caller's workspace id, and whether usage is metered.
 *
 *  • Production (auth enforced + D1 binding): workspaceId comes from the signed
 *    session; the repo is a workspace-scoped D1Store; metered = true.
 *  • Local dev / demo (no AUTH_SECRET, no binding): workspaceId = "local"; repo
 *    is the JSON store; metered = false → unmetered (constitution Art. I.2).
 */
export async function getCtx(): Promise<Ctx> {
  const binding = await getD1Binding();
  let workspaceId = LOCAL_WORKSPACE_ID;

  if (authRequired()) {
    try {
      const session = await auth();
      if (session?.workspaceId) {
        workspaceId = session.workspaceId;
      } else if (session?.user?.email || session?.userId || session?.user?.id) {
        // Token missing workspaceId (e.g. provision failed at sign-in) — recover.
        const db = getDb(binding);
        const userId =
          session.userId ??
          session.user?.id ??
          (session.user?.email ? `user_${session.user.email}` : "unknown");
        const ws = await getOrCreateWorkspaceForUser(
          db,
          userId,
          session.user?.email ?? null,
        );
        workspaceId = ws.id;
      }
    } catch (err) {
      console.error("[getCtx] auth/session failed", err);
    }
  }

  const db = getDb(binding, workspaceId);
  return { db, workspaceId, metered: !!binding };
}

/**
 * Plan + usage snapshot for the current workspace, for the client UI. In demo/
 * local mode returns an unmetered Free summary without touching the DB.
 */
export async function getWorkspaceSummary(ctx: Ctx): Promise<WorkspaceSummary> {
  if (!ctx.metered) {
    const free = getPlan("free");
    return {
      workspaceId: ctx.workspaceId,
      planId: "free",
      metered: false,
      leadsUsed: 0,
      leadsLimit: free.leadCreditsPerMonth,
      sendsUsed: 0,
      sendsLimit: free.sendsPerMonth,
      resetsAt: null,
    };
  }
  try {
    const ws = await ctx.db.getWorkspace(ctx.workspaceId);
    if (!ws) {
      const free = getPlan("free");
      return {
        workspaceId: ctx.workspaceId,
        planId: "free",
        metered: true,
        leadsUsed: 0,
        leadsLimit: free.leadCreditsPerMonth,
        sendsUsed: 0,
        sendsLimit: free.sendsPerMonth,
        resetsAt: null,
      };
    }
    const fresh = await ensureUsageWindow(ctx.db, ws);
    const plan = getPlan(fresh.planId);
    return {
      workspaceId: fresh.id,
      planId: fresh.planId,
      metered: true,
      leadsUsed: fresh.leadsUsedThisMonth,
      leadsLimit: plan.leadCreditsPerMonth,
      sendsUsed: fresh.sendsUsedThisMonth,
      sendsLimit: plan.sendsPerMonth,
      resetsAt: fresh.resetsAt,
    };
  } catch (err) {
    console.error("[getWorkspaceSummary] failed", err);
    const free = getPlan("free");
    return {
      workspaceId: ctx.workspaceId,
      planId: "free",
      metered: true,
      leadsUsed: 0,
      leadsLimit: free.leadCreditsPerMonth,
      sendsUsed: 0,
      sendsLimit: free.sendsPerMonth,
      resetsAt: null,
    };
  }
}
