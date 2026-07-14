import { promises as fs } from "fs";
import path from "path";
import type { Lead, Outreach, Run } from "@/lib/types";
import type { LeadRepository } from "./index";

interface DbShape {
  runs: Run[];
  leads: Lead[];
  outreach: Outreach[];
}

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

const EMPTY: DbShape = { runs: [], leads: [], outreach: [] };

/**
 * A tiny append/update JSON file store. Not built for scale or concurrency at
 * volume — it exists so the MVP runs with zero external services. All writes go
 * through a single in-process promise chain to avoid interleaved file writes.
 */
export class JsonStore implements LeadRepository {
  private writeChain: Promise<unknown> = Promise.resolve();

  private async read(): Promise<DbShape> {
    try {
      const raw = await fs.readFile(DB_FILE, "utf8");
      const parsed = JSON.parse(raw) as Partial<DbShape>;
      return {
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
    const next = this.writeChain.then(async () => {
      const data = await this.read();
      const { data: updated, result } = fn(data);
      await this.write(updated);
      return result;
    });
    // Keep the chain alive even if a mutation rejects.
    this.writeChain = next.catch(() => undefined);
    return next;
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
      const idx = data.runs.findIndex((r) => r.id === id);
      if (idx === -1) return { data, result: null };
      data.runs[idx] = { ...data.runs[idx], ...patch };
      return { data, result: data.runs[idx] };
    });
  }

  async getRun(id: string): Promise<Run | null> {
    const data = await this.read();
    return data.runs.find((r) => r.id === id) ?? null;
  }

  async listRuns(): Promise<Run[]> {
    const data = await this.read();
    return data.runs;
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
      const idx = data.leads.findIndex((l) => l.id === id);
      if (idx === -1) return { data, result: null };
      data.leads[idx] = { ...data.leads[idx], ...patch };
      return { data, result: data.leads[idx] };
    });
  }

  async getLead(id: string): Promise<Lead | null> {
    const data = await this.read();
    return data.leads.find((l) => l.id === id) ?? null;
  }

  async listLeads(runId?: string): Promise<Lead[]> {
    const data = await this.read();
    const leads = runId ? data.leads.filter((l) => l.runId === runId) : data.leads;
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
      const idx = data.outreach.findIndex((o) => o.id === id);
      if (idx === -1) return { data, result: null };
      data.outreach[idx] = { ...data.outreach[idx], ...patch };
      return { data, result: data.outreach[idx] };
    });
  }

  async getOutreach(id: string): Promise<Outreach | null> {
    const data = await this.read();
    return data.outreach.find((o) => o.id === id) ?? null;
  }

  async getOutreachByLead(leadId: string): Promise<Outreach | null> {
    const data = await this.read();
    return data.outreach.find((o) => o.leadId === leadId) ?? null;
  }

  async listOutreach(): Promise<Outreach[]> {
    const data = await this.read();
    return data.outreach;
  }
}
