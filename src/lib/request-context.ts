import { headers } from "next/headers";
import { getD1Binding } from "@/lib/cf";
import { getDb, LOCAL_WORKSPACE_ID } from "@/lib/db";
import { authRequired, env } from "@/lib/config";
import { auth } from "@/auth";
import { getPlan } from "@/lib/plans";
import {
  ensureUsageWindow,
  ensureVerifyWindow,
  getOrCreateWorkspaceForUser,
  ensureLocalWorkspace,
} from "@/lib/workspace";
import { AuthError } from "@/lib/errors";
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
 *  • Auth enforced but no resolvable workspace → AuthError (never silently use
 *    "local" against D1 — that caused fake Settings saves).
 */
export async function getCtx(): Promise<Ctx> {
  const binding = await getD1Binding();
  let workspaceId = LOCAL_WORKSPACE_ID;
  let resolved = !authRequired();

  if (authRequired()) {
    try {
      const session = await auth();
      if (session?.workspaceId) {
        workspaceId = session.workspaceId;
        resolved = true;
      } else if (session?.user?.email || session?.userId || session?.user?.id) {
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
        resolved = true;
      }
    } catch (err) {
      console.error("[getCtx] auth/session failed", err);
    }

    if (!resolved) {
      // Headless smoke bypass (middleware already checked the key).
      const smokeKey = env.smokeApiKey();
      if (smokeKey) {
        try {
          const h = await headers();
          if (h.get("x-smoke-key") === smokeKey) {
            workspaceId = LOCAL_WORKSPACE_ID;
            resolved = true;
          }
        } catch {
          // headers() unavailable outside a request — ignore
        }
      }
    }

    if (!resolved) {
      throw new AuthError("Sign in required to use this workspace.");
    }
  }

  const db = getDb(binding, workspaceId);
  if (!binding || (authRequired() && workspaceId === LOCAL_WORKSPACE_ID)) {
    // Local JSON always; smoke-on-D1 needs a concrete "local" row too.
    await ensureLocalWorkspace(db);
  }
  return { db, workspaceId, metered: !!binding };
}

/**
 * Plan + usage snapshot for the current workspace, for the client UI. In demo/
 * local mode still reads the JSON workspace so usage bars can move during
 * local testing (quotas are not enforced when metered=false).
 */
export async function getWorkspaceSummary(ctx: Ctx): Promise<WorkspaceSummary> {
  const free = getPlan("free");
  try {
    const ws = await ctx.db.getWorkspace(ctx.workspaceId);
    if (!ws) {
      return {
        workspaceId: ctx.workspaceId,
        planId: "free",
        metered: ctx.metered,
        leadsUsed: 0,
        leadsLimit: free.leadCreditsPerMonth,
        sendsUsed: 0,
        sendsLimit: free.sendsPerMonth,
        resetsAt: null,
        verifiesUsed: 0,
        verifiesLimit: free.verifiesPerDay,
        verifiesResetsAt: null,
        emailVerifyEnabled: true,
      };
    }
    const monthly = await ensureUsageWindow(ctx.db, ws);
    const fresh = await ensureVerifyWindow(ctx.db, monthly);
    const plan = getPlan(fresh.planId);
    return {
      workspaceId: fresh.id,
      planId: fresh.planId,
      metered: ctx.metered,
      leadsUsed: fresh.leadsUsedThisMonth,
      leadsLimit: plan.leadCreditsPerMonth,
      sendsUsed: fresh.sendsUsedThisMonth,
      sendsLimit: plan.sendsPerMonth,
      resetsAt: fresh.resetsAt,
      verifiesUsed: fresh.verifiesUsedToday,
      verifiesLimit: plan.verifiesPerDay,
      verifiesResetsAt: fresh.verifiesResetsAt,
      emailVerifyEnabled: fresh.emailVerifyEnabled !== false,
    };
  } catch (err) {
    console.error("[getWorkspaceSummary] failed", err);
    return {
      workspaceId: ctx.workspaceId,
      planId: "free",
      metered: ctx.metered,
      leadsUsed: 0,
      leadsLimit: free.leadCreditsPerMonth,
      sendsUsed: 0,
      sendsLimit: free.sendsPerMonth,
      resetsAt: null,
      verifiesUsed: 0,
      verifiesLimit: free.verifiesPerDay,
      verifiesResetsAt: null,
      emailVerifyEnabled: true,
    };
  }
}
