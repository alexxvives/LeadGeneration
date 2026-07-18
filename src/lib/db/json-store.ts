import { promises as fs } from "fs";
import path from "path";
import { normalizeCrmStage, type Board, type Lead, type Outreach, type Run, type Workspace } from "@/lib/types";
import type { LeadListFilter, LeadRepository } from "./index";
import { LOCAL_WORKSPACE_ID } from "./index";

interface DbShape {
  workspaces: Workspace[];
  boards: Board[];
  runs: Run[];
  leads: Lead[];
  outreach: Outreach[];
}

/** Back-fills email setting fields added in migration 0006 to workspace rows from older JSON files. */
function normalizeWorkspace(w: Workspace): Workspace {
  const raw = w as unknown as Record<string, unknown>;
  return {
    ...w,
    fromName: (raw.fromName as string | undefined) ?? null,
    fromEmail: (raw.fromEmail as string | undefined) ?? null,
    replyTo: (raw.replyTo as string | undefined) ?? null,
    physicalAddress: (raw.physicalAddress as string | undefined) ?? null,
    resendApiKey: (raw.resendApiKey as string | undefined) ?? null,
    resendWebhookId: (raw.resendWebhookId as string | undefined) ?? null,
    resendWebhookSecret: (raw.resendWebhookSecret as string | undefined) ?? null,
    mailerooApiKey: (raw.mailerooApiKey as string | undefined) ?? null,
    easyEmailProvider:
      (raw.easyEmailProvider as Workspace["easyEmailProvider"] | undefined) === "maileroo"
        ? "maileroo"
        : "resend",
    preferredSendPath:
      (raw.preferredSendPath as Workspace["preferredSendPath"] | undefined) === "pro" ||
      (raw.preferredSendPath as Workspace["preferredSendPath"] | undefined) === "easy"
        ? (raw.preferredSendPath as "easy" | "pro")
        : null,
    emailVerifyEnabled: raw.emailVerifyEnabled === false ? false : true,
    connectedMailbox: (raw.connectedMailbox as Workspace["connectedMailbox"] | undefined) ?? null,
    verifiesUsedToday:
      typeof raw.verifiesUsedToday === "number" ? raw.verifiesUsedToday : 0,
    verifiesResetsAt:
      typeof raw.verifiesResetsAt === "string" ? raw.verifiesResetsAt : null,
  };
}

/** Back-fills CRM fields that didn't exist on leads created before migration 0005. */
function normalizeLead(l: Lead): Lead {
  // Cast through unknown so TS doesn't treat these as always-defined on old JSON rows.
  const raw = l as unknown as Record<string, unknown>;
  return {
    ...l,
    boardId: typeof raw.boardId === "string" ? raw.boardId : "",
    crmStage: normalizeCrmStage(raw.crmStage),
    contactMethod: (raw.contactMethod as Lead["contactMethod"] | undefined) ?? null,
    notes: (raw.notes as Lead["notes"] | undefined) ?? null,
    followUps: (raw.followUps as Lead["followUps"] | undefined) ?? [],
    customFields:
      raw.customFields && typeof raw.customFields === "object"
        ? (raw.customFields as Record<string, string>)
        : {},
  };
}

function normalizeRun(r: Run): Run {
  const raw = r as unknown as Record<string, unknown>;
  return {
    ...r,
    boardId: typeof raw.boardId === "string" ? raw.boardId : "",
  };
}

function normalizeBoard(b: Board): Board {
  return {
    ...b,
    isDefault: !!b.isDefault,
  };
}

function normalizeOutreach(o: Outreach): Outreach {
  const raw = o as unknown as Record<string, unknown>;
  return {
    ...o,
    deliveryStatus: (raw.deliveryStatus as Outreach["deliveryStatus"] | undefined) ?? "unknown",
  };
}

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

const EMPTY: DbShape = {
  workspaces: [],
  boards: [],
  runs: [],
  leads: [],
  outreach: [],
};

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
        boards: parsed.boards ?? [],
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
    const w = data.workspaces.find((w) => w.id === id);
    return w ? normalizeWorkspace(w) : null;
  }

  async getWorkspaceByOwner(ownerUserId: string): Promise<Workspace | null> {
    const data = await this.read();
    const w = data.workspaces.find((w) => w.ownerUserId === ownerUserId);
    return w ? normalizeWorkspace(w) : null;
  }

  async getWorkspaceByStripeCustomer(customerId: string): Promise<Workspace | null> {
    const data = await this.read();
    const w = data.workspaces.find((w) => w.stripeCustomerId === customerId);
    return w ? normalizeWorkspace(w) : null;
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

  async listWorkspaces(): Promise<Workspace[]> {
    const data = await this.read();
    return data.workspaces
      .map(normalizeWorkspace)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async adminCountByWorkspace(): Promise<{
    leads: Record<string, number>;
    sent: Record<string, number>;
    runs: Record<string, number>;
  }> {
    const data = await this.read();
    const leads: Record<string, number> = {};
    const sent: Record<string, number> = {};
    const runs: Record<string, number> = {};
    for (const l of data.leads) {
      const wid = l.workspaceId ?? this.workspaceId;
      leads[wid] = (leads[wid] ?? 0) + 1;
    }
    for (const o of data.outreach) {
      if (o.status !== "sent") continue;
      const wid = o.workspaceId ?? this.workspaceId;
      sent[wid] = (sent[wid] ?? 0) + 1;
    }
    for (const r of data.runs) {
      const wid = r.workspaceId ?? this.workspaceId;
      runs[wid] = (runs[wid] ?? 0) + 1;
    }
    return { leads, sent, runs };
  }

  async listAuthUsers(): Promise<
    Array<{ id: string; email: string | null; name: string | null }>
  > {
    const workspaces = await this.listWorkspaces();
    return workspaces
      .filter((w) => w.ownerUserId)
      .map((w) => ({
        id: w.ownerUserId!,
        email: w.fromEmail ?? (w.name.includes("@") ? w.name : null),
        name: w.name,
      }));
  }

  // ---- Boards ----
  createBoard(board: Board): Promise<Board> {
    return this.mutate((data) => {
      data.boards.push(board);
      return { data, result: board };
    });
  }

  updateBoard(id: string, patch: Partial<Board>): Promise<Board | null> {
    return this.mutate((data) => {
      const idx = data.boards.findIndex((b) => b.id === id && this.inScope(b));
      if (idx === -1) return { data, result: null };
      data.boards[idx] = { ...data.boards[idx], ...patch };
      return { data, result: data.boards[idx] };
    });
  }

  async getBoard(id: string): Promise<Board | null> {
    const data = await this.read();
    const b = data.boards.find((b) => b.id === id && this.inScope(b));
    return b ? normalizeBoard(b) : null;
  }

  async listBoards(): Promise<Board[]> {
    const data = await this.read();
    return data.boards
      .filter((b) => this.inScope(b))
      .map(normalizeBoard)
      .sort((a, b) => {
        if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }

  deleteBoard(id: string): Promise<boolean> {
    return this.mutate((data) => {
      const before = data.boards.length;
      data.boards = data.boards.filter((b) => !(b.id === id && this.inScope(b)));
      return { data, result: data.boards.length < before };
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
    const r = data.runs.find((r) => r.id === id && this.inScope(r));
    return r ? normalizeRun(r) : null;
  }

  async listRuns(): Promise<Run[]> {
    const data = await this.read();
    return data.runs.filter((r) => this.inScope(r)).map(normalizeRun);
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

  updateLeads(
    patches: Array<{ id: string; patch: Partial<Lead> }>,
  ): Promise<number> {
    if (patches.length === 0) return Promise.resolve(0);
    return this.mutate((data) => {
      let n = 0;
      for (const { id, patch } of patches) {
        const idx = data.leads.findIndex((l) => l.id === id && this.inScope(l));
        if (idx === -1) continue;
        data.leads[idx] = { ...data.leads[idx], ...patch };
        n++;
      }
      return { data, result: n };
    });
  }

  async getLead(id: string): Promise<Lead | null> {
    const data = await this.read();
    const l = data.leads.find((l) => l.id === id && this.inScope(l));
    if (!l) return null;
    return normalizeLead(l);
  }

  async listLeads(filter?: LeadListFilter): Promise<Lead[]> {
    const data = await this.read();
    const leads = data.leads.filter((l) => {
      if (!this.inScope(l)) return false;
      if (filter?.runId && l.runId !== filter.runId) return false;
      if (filter?.boardId && (l.boardId || "") !== filter.boardId) return false;
      return true;
    });
    return [...leads].map(normalizeLead).sort((a, b) => b.fitScore - a.fitScore);
  }

  async countLeads(filter?: LeadListFilter): Promise<number> {
    const data = await this.read();
    return data.leads.filter((l) => {
      if (!this.inScope(l)) return false;
      if (filter?.runId && l.runId !== filter.runId) return false;
      if (filter?.boardId && (l.boardId || "") !== filter.boardId) return false;
      return true;
    }).length;
  }

  deleteLead(id: string): Promise<boolean> {
    return this.mutate((data) => {
      const before = data.leads.length;
      data.leads = data.leads.filter((l) => !(l.id === id && this.inScope(l)));
      if (data.leads.length === before) return { data, result: false };
      data.outreach = data.outreach.filter(
        (o) => !(o.leadId === id && this.inScope(o)),
      );
      return { data, result: true };
    });
  }

  deleteLeads(ids: string[]): Promise<number> {
    const idSet = new Set(ids);
    return this.mutate((data) => {
      const before = data.leads.length;
      data.leads = data.leads.filter(
        (l) => !(this.inScope(l) && idSet.has(l.id)),
      );
      const deleted = before - data.leads.length;
      if (deleted > 0) {
        data.outreach = data.outreach.filter(
          (o) => !(this.inScope(o) && idSet.has(o.leadId)),
        );
      }
      return { data, result: deleted };
    });
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

  claimOutreachForSend(id: string): Promise<Outreach | null> {
    return this.mutate((data) => {
      const idx = data.outreach.findIndex((o) => o.id === id && this.inScope(o));
      if (idx === -1) return { data, result: null };
      const o = data.outreach[idx];
      const stuckBefore = Date.now() - 2 * 60_000;
      const updatedMs = Date.parse(o.updatedAt || "") || 0;
      const canClaim =
        o.status === "approved" ||
        (o.status === "sending" && updatedMs < stuckBefore);
      if (!canClaim) return { data, result: null };
      const now = new Date().toISOString();
      data.outreach[idx] = {
        ...o,
        status: "sending",
        error: null,
        updatedAt: now,
      };
      return { data, result: data.outreach[idx] };
    });
  }

  async getOutreach(id: string): Promise<Outreach | null> {
    const data = await this.read();
    const o = data.outreach.find((x) => x.id === id && this.inScope(x));
    return o ? normalizeOutreach(o) : null;
  }

  async getOutreachByLead(leadId: string): Promise<Outreach | null> {
    const data = await this.read();
    const o = data.outreach.find((x) => x.leadId === leadId && this.inScope(x));
    return o ? normalizeOutreach(o) : null;
  }

  async listOutreach(): Promise<Outreach[]> {
    const data = await this.read();
    return data.outreach.filter((o) => this.inScope(o)).map(normalizeOutreach);
  }

  async findLatestSentByEmail(email: string): Promise<Outreach | null> {
    const needle = email.trim().toLowerCase();
    if (!needle) return null;
    const data = await this.read();
    const candidates = data.outreach
      .filter((o) => o.status === "sent" && o.toEmail?.toLowerCase() === needle)
      .sort((a, b) => (b.sentAt ?? "").localeCompare(a.sentAt ?? ""));
    return candidates[0] ? normalizeOutreach(candidates[0]) : null;
  }

  async countRecentSendActivity(
    sinceIso: string,
    excludeId?: string,
  ): Promise<number> {
    const data = await this.read();
    return data.outreach.filter((o) => {
      if (!this.inScope(o)) return false;
      if (excludeId && o.id === excludeId) return false;
      if (o.status === "sent" && o.sentAt && o.sentAt >= sinceIso) return true;
      if (o.status === "sending" && o.updatedAt >= sinceIso) return true;
      return false;
    }).length;
  }

  clearWorkspaceData(): Promise<void> {
    return this.mutate((data) => {
      data.boards = data.boards.filter((b) => !this.inScope(b));
      data.runs = data.runs.filter((r) => !this.inScope(r));
      data.leads = data.leads.filter((l) => !this.inScope(l));
      data.outreach = data.outreach.filter((o) => !this.inScope(o));
      return { data, result: undefined };
    });
  }
}
