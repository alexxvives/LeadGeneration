import type { LeadRepository } from "@/lib/db";
import type { Workspace } from "@/lib/types";
import { newId, nowIso } from "@/lib/id";

/**
 * Workspace provisioning + usage-window helpers. Kept separate from service.ts
 * because the Auth.js sign-in callback also needs to provision a workspace, and
 * both paths should share one implementation.
 */

/** ISO timestamp for 00:00 UTC on the first of next month (usage reset point). */
export function firstOfNextMonthIso(from: Date = new Date()): string {
  return new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1),
  ).toISOString();
}

/** ISO timestamp for next 00:00 UTC (daily verify reset point). */
export function nextUtcMidnightIso(from: Date = new Date()): string {
  return new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + 1),
  ).toISOString();
}

export function newWorkspace(args: {
  name: string;
  ownerUserId: string | null;
  id?: string;
}): Workspace {
  const now = nowIso();
  return {
    id: args.id ?? newId("ws"),
    name: args.name,
    ownerUserId: args.ownerUserId,
    planId: "free",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripePriceId: null,
    leadsUsedThisMonth: 0,
    sendsUsedThisMonth: 0,
    resetsAt: firstOfNextMonthIso(),
    verifiesUsedToday: 0,
    verifiesResetsAt: nextUtcMidnightIso(),
    createdAt: now,
    updatedAt: now,
    fromName: null,
    fromEmail: null,
    replyTo: null,
    physicalAddress: null,
    resendApiKey: null,
    mailerooApiKey: null,
    easyEmailProvider: "resend",
    preferredSendPath: null,
    emailVerifyEnabled: true,
    connectedMailbox: null,
  };
}

/**
 * Find (or create on first login) the default workspace for an Auth.js user.
 * Called from the sign-in callback so a workspace always exists before the
 * studio loads.
 */
export async function getOrCreateWorkspaceForUser(
  db: LeadRepository,
  userId: string,
  email: string | null | undefined,
): Promise<Workspace> {
  const existing = await db.getWorkspaceByOwner(userId);
  if (existing) return existing;
  const name = email ? `${email.split("@")[0]}'s workspace` : "My workspace";
  return db.createWorkspace(newWorkspace({ name, ownerUserId: userId }));
}

/**
 * Ensure the local JSON workspace row exists so Settings can save sending
 * identity during `npm run dev` (no D1 / not metered).
 */
export async function ensureLocalWorkspace(db: LeadRepository): Promise<Workspace> {
  const { LOCAL_WORKSPACE_ID } = await import("@/lib/db");
  const existing = await db.getWorkspace(LOCAL_WORKSPACE_ID);
  if (existing) return existing;
  return db.createWorkspace(
    newWorkspace({
      id: LOCAL_WORKSPACE_ID,
      name: "Local workspace",
      ownerUserId: "local",
    }),
  );
}

/**
 * Lazily reset the monthly usage window: if we've passed `resetsAt`, zero the
 * counters and roll `resetsAt` forward. Returns the (possibly updated) row.
 */
export async function ensureUsageWindow(
  db: LeadRepository,
  ws: Workspace,
): Promise<Workspace> {
  if (!ws.resetsAt) {
    const updated = await db.updateWorkspace(ws.id, {
      resetsAt: firstOfNextMonthIso(),
      updatedAt: nowIso(),
    });
    return updated ?? ws;
  }
  if (Date.now() >= Date.parse(ws.resetsAt)) {
    const updated = await db.updateWorkspace(ws.id, {
      leadsUsedThisMonth: 0,
      sendsUsedThisMonth: 0,
      resetsAt: firstOfNextMonthIso(),
      updatedAt: nowIso(),
    });
    return updated ?? ws;
  }
  return ws;
}

/**
 * Lazily reset the daily verify window at UTC midnight.
 */
export async function ensureVerifyWindow(
  db: LeadRepository,
  ws: Workspace,
): Promise<Workspace> {
  if (!ws.verifiesResetsAt) {
    const updated = await db.updateWorkspace(ws.id, {
      verifiesUsedToday: ws.verifiesUsedToday ?? 0,
      verifiesResetsAt: nextUtcMidnightIso(),
      updatedAt: nowIso(),
    });
    return updated ?? ws;
  }
  if (Date.now() >= Date.parse(ws.verifiesResetsAt)) {
    const updated = await db.updateWorkspace(ws.id, {
      verifiesUsedToday: 0,
      verifiesResetsAt: nextUtcMidnightIso(),
      updatedAt: nowIso(),
    });
    return updated ?? ws;
  }
  return ws;
}
