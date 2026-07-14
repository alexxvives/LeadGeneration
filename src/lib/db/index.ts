import type { Lead, Outreach, Run } from "@/lib/types";
import { JsonStore } from "./json-store";
import { D1Store, type D1Database } from "./d1-store";

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
}

// Singleton for the JSON store only — preserves its in-process write chain.
// D1Store is not a singleton: D1 bindings are request-scoped in Workers.
let jsonInstance: LeadRepository | null = null;

export function getDb(binding?: D1Database): LeadRepository {
  if (binding) {
    return new D1Store(binding);
  }
  if (!jsonInstance) {
    jsonInstance = new JsonStore();
  }
  return jsonInstance;
}
