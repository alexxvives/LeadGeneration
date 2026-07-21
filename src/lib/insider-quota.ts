import type { LeadRepository } from "@/lib/db";
import { INSIDER_SHARED_POOL } from "@/lib/plans";
import { ensureUsageWindow, ensureVerifyWindow } from "@/lib/workspace";

/** Sum usage across every workspace on the hidden Insider plan (shared pool). */
export async function sumInsiderSharedUsage(db: LeadRepository): Promise<{
  leads: number;
  sends: number;
  verifies: number;
}> {
  const all = await db.listWorkspaces();
  let leads = 0;
  let sends = 0;
  let verifies = 0;
  for (const w of all) {
    if (w.planId !== "insider") continue;
    const monthly = await ensureUsageWindow(db, w);
    const fresh = await ensureVerifyWindow(db, monthly);
    leads += fresh.leadsUsedThisMonth;
    sends += fresh.sendsUsedThisMonth;
    verifies += fresh.verifiesUsedToday;
  }
  return { leads, sends, verifies };
}

export function insiderPoolLimits() {
  return INSIDER_SHARED_POOL;
}
