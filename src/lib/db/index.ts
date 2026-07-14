import { databaseProvider } from "@/lib/config";
import type { Lead, Outreach, Run } from "@/lib/types";
import { JsonStore } from "./json-store";
import { SupabaseStore } from "./supabase-store";

/**
 * Repository abstraction for persistence.
 *
 * The app only ever talks to this interface, never to a concrete store. The
 * concrete backend is chosen by `getDb()` from env (see config.ts):
 *  - Supabase/Postgres when its env vars are set (commercialization backend);
 *  - the local JSON file store otherwise — the zero-key demo/offline default.
 * No UI or API-route changes are required to switch.
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

let instance: LeadRepository | null = null;

export function getDb(): LeadRepository {
  if (!instance) {
    instance =
      databaseProvider() === "supabase" ? new SupabaseStore() : new JsonStore();
  }
  return instance;
}
