import { promises as fs } from "fs";
import path from "path";
import type { Lead, Outreach, Run, Workspace } from "@/lib/types";
import type { LeadRepository } from "./index";
import { LOCAL_WORKSPACE_ID } from "./index";

interface DbShape {
  workspaces: Workspace[];
  runs: Run[];
  leads: Lead[];
  outreach: Outreach[];
}

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

const EMPTY: DbShape = { workspaces: [], runs: [], leads: [], outreach: [] };

// A single, process-wide write chain shared by ALL JsonStore instances. Stores
// are now created per-request (one per workspace scope), so the chain can no
// longer live on the instance — that would let concurrent requests interleave
// file writes. Keeping it module-level preserves the read-modify-write ordering.
let sharedChain: Promise<unknown> = Promise.resolve();

/** Treat a row with no workspaceId as belonging to the local workspace, so
 *  pre-existing demo/seed data stays visible in local mode. */
function wsOf(row: { workspaceId?: string }): string {
  return row.workspaceId ?? LOCAL_WORKSPACE_ID;
}

/**
 * A tiny append/update JSON file store. Not built for scale or concurrency at
 * volume — it exists so the MVP runs with zero external services. Reads/writes
 * for runs/leads/outreach are filtered to the workspace this instance was
 * constructed with; workspace rows themselves are global.
 */
export class JsonStore implements LeadRepository {
  constructor(private readonly workspaceId: string = LOCAL_WORKSPACE_ID) {}

  private async read(): Promise<DbShape> {
    try {
      const raw = await fs.readFile(DB_FILE, "utf8");
      const parsed = JSON.parse(raw) as Partial<DbShape>;
      return {
        workspaces: parsed.workspaces ?? [],
        runs: parsed.runs ?? [],
        leads: parsed.leads ?? [],
        outreach: parsed.outreach ?? [],
      };
    } catch {
      return structuredClone(EMPTY);
    }
  }

  private async write(data: DbShape): Promise<void> {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2), "utf8");
  }

  /** Serialize read-modify-write cycles so concurrent requests don't clobber. */
  private mutate<T>(fn: (data: DbShape) => { data: DbShape; result: T }): Promise<T> {
    const next = sharedChain.then(async () => {
      const data = await this.read();
      const { data: updated, result } = fn(data);
      await this.write(updated);
      return result;
    });
    sharedChain = next.catch(() => undefined);
    return next;
  }

  private inScope<T extends { workspaceId?: string }>(row: T): boolean {
    return wsOf(row) === this.workspaceId;
  }

  // ---- Workspaces (global, not scoped) ----
  async getWorkspace(id: string): Promise<Workspace | null> {
    const data = await this.read();
    return data.workspaces.find((w) => w.id === id) ?? null;
  }

  async getWorkspaceByOwner(ownerUserId: string): Promise<Workspace | null> {
    const data = await this.read();
    return data.workspaces.find((w) => w.ownerUserId === ownerUserId) ?? null;
  }

  async getWorkspaceByStripeCustomer(customerId: string): Promise<Workspace | null> {
    const data = await this.read();
    return data.workspaces.find((w) => w.stripeCustomerId === customerId) ?? null;
  }

  createWorkspace(workspace: Workspace): Promise<Workspace> {
    return this.mutate((data) => {
      const idx = data.workspaces.findIndex((w) => w.id === workspace.id);
      if (idx === -1) data.workspaces.push(workspace);
      else data.workspaces[idx] = workspace;
      return { data, result: workspace };
    });
  }

  updateWorkspace(id: string, patch: Partial<Workspace>): Promise<Workspace | null> {
    return this.mutate((data) => {
      const idx = data.workspaces.findIndex((w) => w.id === id);
      if (idx === -1) return { data, result: null };
      data.workspaces[idx] = { ...data.workspaces[idx], ...patch };
      return { data, result: data.workspaces[idx] };
    });
  }

  // ---- Runs ----
  createRun(run: Run): Promise<Run> {
    return this.mutate((data) => {
      data.runs.unshift(run);
      return { data, result: run };
    });
  }

  updateRun(id: string, patch: Partial<Run>): Promise<Run | null> {
    return this.mutate((data) => {
      const idx = data.runs.findIndex((r) => r.id === id && this.inScope(r));
      if (idx === -1) return { data, result: null };
      data.runs[idx] = { ...data.runs[idx], ...patch };
      return { data, result: data.runs[idx] };
    });
  }

  async getRun(id: string): Promise<Run | null> {
    const data = await this.read();
    return data.runs.find((r) => r.id === id && this.inScope(r)) ?? null;
  }

  async listRuns(): Promise<Run[]> {
    const data = await this.read();
    return data.runs.filter((r) => this.inScope(r));
  }

  // ---- Leads ----
  createLeads(leads: Lead[]): Promise<Lead[]> {
    return this.mutate((data) => {
      data.leads.push(...leads);
      return { data, result: leads };
    });
  }

  updateLead(id: string, patch: Partial<Lead>): Promise<Lead | null> {
    return this.mutate((data) => {
      const idx = data.leads.findIndex((l) => l.id === id && this.inScope(l));
      if (idx === -1) return { data, result: null };
      data.leads[idx] = { ...data.leads[idx], ...patch };
      return { data, result: data.leads[idx] };
    });
  }

  async getLead(id: string): Promise<Lead | null> {
    const data = await this.read();
    return data.leads.find((l) => l.id === id && this.inScope(l)) ?? null;
  }

  async listLeads(runId?: string): Promise<Lead[]> {
    const data = await this.read();
    const leads = data.leads.filter(
      (l) => this.inScope(l) && (runId ? l.runId === runId : true),
    );
    return [...leads].sort((a, b) => b.fitScore - a.fitScore);
  }

  // ---- Outreach ----
  upsertOutreach(outreach: Outreach): Promise<Outreach> {
    return this.mutate((data) => {
      const idx = data.outreach.findIndex((o) => o.id === outreach.id);
      if (idx === -1) data.outreach.push(outreach);
      else data.outreach[idx] = outreach;
      return { data, result: outreach };
    });
  }

  updateOutreach(id: string, patch: Partial<Outreach>): Promise<Outreach | null> {
    return this.mutate((data) => {
      const idx = data.outreach.findIndex((o) => o.id === id && this.inScope(o));
      if (idx === -1) return { data, result: null };
      data.outreach[idx] = { ...data.outreach[idx], ...patch };
      return { data, result: data.outreach[idx] };
    });
  }

  async getOutreach(id: string): Promise<Outreach | null> {
    const data = await this.read();
    return data.outreach.find((o) => o.id === id && this.inScope(o)) ?? null;
  }

  async getOutreachByLead(leadId: string): Promise<Outreach | null> {
    const data = await this.read();
    return data.outreach.find((o) => o.leadId === leadId && this.inScope(o)) ?? null;
  }

  async listOutreach(): Promise<Outreach[]> {
    const data = await this.read();
    return data.outreach.filter((o) => this.inScope(o));
  }
}
