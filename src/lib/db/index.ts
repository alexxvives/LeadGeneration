import type { Lead, Outreach, Run, Workspace } from "@/lib/types";
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
export interface LeadRepository {
  // Workspaces (tenant + plan + usage). NOT workspace-scoped: these operate on
  // the workspaces table directly by id/owner/customer.
  getWorkspace(id: string): Promise<Workspace | null>;
  getWorkspaceByOwner(ownerUserId: string): Promise<Workspace | null>;
  getWorkspaceByStripeCustomer(customerId: string): Promise<Workspace | null>;
  createWorkspace(workspace: Workspace): Promise<Workspace>;
  updateWorkspace(id: string, patch: Partial<Workspace>): Promise<Workspace | null>;

  // Runs
  createRun(run: Run): Promise<Run>;
  updateRun(id: string, patch: Partial<Run>): Promise<Run | null>;
  getRun(id: string): Promise<Run | null>;
  listRuns(): Promise<Run[]>;

  // Leads
  createLeads(leads: Lead[]): Promise<Lead[]>;
  updateLead(id: string, patch: Partial<Lead>): Promise<Lead | null>;
  getLead(id: string): Promise<Lead | null>;
  listLeads(runId?: string): Promise<Lead[]>;

  // Outreach
  upsertOutreach(outreach: Outreach): Promise<Outreach>;
  updateOutreach(id: string, patch: Partial<Outreach>): Promise<Outreach | null>;
  getOutreach(id: string): Promise<Outreach | null>;
  getOutreachByLead(leadId: string): Promise<Outreach | null>;
  listOutreach(): Promise<Outreach[]>;

  /**
   * Cross-workspace: latest sent outreach for a recipient (delivery webhooks).
   * Prefer tag-based matching when Resend tags are present.
   */
  findLatestSentByEmail(email: string): Promise<Outreach | null>;

  /** Wipe runs/leads/outreach for this workspace (keeps the workspace row). */
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
