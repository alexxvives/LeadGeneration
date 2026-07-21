import { headers } from "next/headers";
import { getD1Binding } from "@/lib/cf";
import { getDb, LOCAL_WORKSPACE_ID } from "@/lib/db";
import { authRequired, env } from "@/lib/config";
import { auth } from "@/auth";
import { isAdminSession } from "@/lib/admin";
import {
  getPlan,
  INSIDER_SHARED_POOL,
} from "@/lib/plans";
import { sumInsiderSharedUsage } from "@/lib/insider-quota";
import { getFirecrawlRemainingCredits } from "@/lib/search/firecrawl";
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

  // Production D1 without AUTH_SECRET must never fall open into unmetered
  // demo mode (audit C2.6). Local `npm run dev` has no binding — still open.
  if (binding && !authRequired()) {
    console.error(
      "[getCtx] D1 binding present but AUTH_SECRET missing — refusing demo mode",
    );
    throw new AuthError(
      "Server misconfigured: AUTH_SECRET missing",
      503,
    );
  }

  let workspaceId = LOCAL_WORKSPACE_ID;
  let resolved = !authRequired();
  let userId: string | null = null;
  let userEmail: string | null = null;
  let userName: string | null = null;
  let isAdmin = !authRequired();

  if (authRequired()) {
    try {
      const session = await auth();
      isAdmin = isAdminSession(session);
      userEmail = session?.user?.email ?? null;
      userName = session?.user?.name ?? null;
      userId =
        session?.userId ??
        session?.user?.id ??
        (session?.user?.email ? `user_${session.user.email}` : null);

      if (session?.workspaceId) {
        workspaceId = session.workspaceId;
        resolved = true;
      } else if (session?.user?.email || session?.userId || session?.user?.id) {
        const db = getDb(binding);
        const uid =
          userId ??
          (session.user?.email ? `user_${session.user.email}` : "unknown");
        userId = uid;
        const ws = await getOrCreateWorkspaceForUser(
          db,
          uid,
          session.user?.email ?? null,
        );
        workspaceId = ws.id;
        resolved = true;
      }
    } catch (err) {
      console.error("[getCtx] auth/session failed", err);
    }

    if (!resolved) {
      // Headless smoke bypass — never against production D1 (audit C2.7).
      const smokeKey = env.smokeApiKey();
      if (smokeKey && !binding) {
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
  } else {
    // Local demo — stable synthetic identity so invites/locks still work.
    userId = "local";
    userEmail = "local@demo.hermes";
    userName = "Local";
  }

  const db = getDb(binding, workspaceId);
  if (!binding || (authRequired() && workspaceId === LOCAL_WORKSPACE_ID)) {
    // Local JSON always; smoke-on-D1 needs a concrete "local" row too.
    await ensureLocalWorkspace(db);
  }
  return {
    db,
    workspaceId,
    // Platform admins are unmetered (unlimited leads/sends/verifies).
    metered: !!binding && !isAdmin,
    userId,
    userEmail,
    userName,
    scopeToWorkspace: (wsId: string) => getDb(binding, wsId),
  };
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
        findLeadsEnabled: true,
      };
    }
    const monthly = await ensureUsageWindow(ctx.db, ws);
    const fresh = await ensureVerifyWindow(ctx.db, monthly);
    const plan = getPlan(fresh.planId);
    if (fresh.planId === "insider") {
      const shared = await sumInsiderSharedUsage(ctx.db);
      const fc = await getFirecrawlRemainingCredits();
      return {
        workspaceId: fresh.id,
        planId: fresh.planId,
        metered: ctx.metered,
        leadsUsed: shared.leads,
        // Null FC → 0 display capacity (never invent a fallback balance).
        leadsLimit: fc ?? 0,
        firecrawlCreditsRemaining: fc,
        sendsUsed: fresh.sendsUsedThisMonth,
        sendsLimit: 0,
        unlimitedSends: true,
        resetsAt: fresh.resetsAt,
        verifiesUsed: shared.verifies,
        verifiesLimit: INSIDER_SHARED_POOL.verifiesPerDay,
        verifiesResetsAt: fresh.verifiesResetsAt,
        emailVerifyEnabled: fresh.emailVerifyEnabled !== false,
        findLeadsEnabled: fresh.findLeadsEnabled !== false,
      };
    }
    return {
      workspaceId: fresh.id,
      planId: fresh.planId,
      metered: ctx.metered,
      leadsUsed: fresh.leadsUsedThisMonth,
      leadsLimit: plan.leadCreditsPerMonth,
      sendsUsed: fresh.sendsUsedThisMonth,
      sendsLimit: plan.sendsPerMonth,
      unlimitedSends: Boolean(plan.unlimitedSends),
      resetsAt: fresh.resetsAt,
      verifiesUsed: fresh.verifiesUsedToday,
      verifiesLimit: plan.verifiesPerDay,
      verifiesResetsAt: fresh.verifiesResetsAt,
      emailVerifyEnabled: fresh.emailVerifyEnabled !== false,
      findLeadsEnabled: fresh.findLeadsEnabled !== false,
    };
  } catch (err) {
    console.error("[getWorkspaceSummary] failed", err);
    // Fail closed on Find leads when metered: a DB blip must not re-enable Search
    // for an account the admin paused. Demo/local stays permissive.
    let findLeadsEnabled = !ctx.metered;
    try {
      const ws = await ctx.db.getWorkspace(ctx.workspaceId);
      if (ws) findLeadsEnabled = ws.findLeadsEnabled !== false;
    } catch {
      /* keep fail-closed default */
    }
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
      findLeadsEnabled,
    };
  }
}
