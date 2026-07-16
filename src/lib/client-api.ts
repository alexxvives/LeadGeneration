import type {
  Capabilities,
} from "@/lib/config";
import type {
  Board,
  BoardSummary,
  ContactMethod,
  CrmStage,
  DashboardStats,
  FollowUp,
  Lead,
  LeadWithOutreach,
  Outreach,
  PlanId,
  Run,
  SearchStrategy,
  WorkspaceSummary,
} from "@/lib/types";
import type { LocationSuggestion } from "@/app/api/geocode/route";

export interface BoardResponse {
  run: Run | null;
  leads: LeadWithOutreach[];
  boards: BoardSummary[];
  activeBoardId: string | null;
  capabilities: Capabilities;
  workspace: WorkspaceSummary;
}

/** Error thrown when a request is rejected for exceeding a plan quota (402). */
export class QuotaExceededError extends Error {
  readonly kind: "leads" | "sends";
  readonly planId: PlanId;
  constructor(message: string, kind: "leads" | "sends", planId: PlanId) {
    super(message);
    this.name = "QuotaExceededError";
    this.kind = kind;
    this.planId = planId;
  }
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data as { error?: string; quota?: { kind: "leads" | "sends"; planId: PlanId } };
    if (res.status === 402 && err.quota) {
      throw new QuotaExceededError(
        err.error ?? "Plan limit reached",
        err.quota.kind,
        err.quota.planId,
      );
    }
    throw new Error(err.error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  board: (boardId?: string | null) => {
    const q =
      boardId && boardId !== "all"
        ? `?boardId=${encodeURIComponent(boardId)}`
        : "?boardId=all";
    return jsonFetch<BoardResponse>(`/api/board${q}`);
  },

  listBoards: () => jsonFetch<{ boards: BoardSummary[] }>("/api/boards"),

  createBoard: (name: string) =>
    jsonFetch<{ board: Board }>("/api/boards", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  renameBoard: (id: string, name: string) =>
    jsonFetch<{ board: Board }>(`/api/boards/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),

  deleteBoard: (id: string) =>
    jsonFetch<{ ok: boolean }>(`/api/boards/${id}`, { method: "DELETE" }),

  dashboard: (boardId?: string | null) => {
    const q =
      boardId && boardId !== "all"
        ? `?boardId=${encodeURIComponent(boardId)}`
        : "";
    return jsonFetch<DashboardStats & { workspace: WorkspaceSummary }>(
      `/api/dashboard${q}`,
    );
  },

  createRun: (input: {
    niche: string;
    location?: string;
    offerNotes?: string;
    senderName?: string;
    searchStrategy?: SearchStrategy;
    maxLeads?: number;
    demo?: boolean;
    boardId?: string | null;
  }) =>
    jsonFetch<{ run: Run }>("/api/runs", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  resetUsage: () =>
    jsonFetch<{ ok: boolean }>("/api/workspace/reset-usage", { method: "POST" }),

  setPlanDev: (planId: PlanId) =>
    jsonFetch<{ ok: boolean; planId: PlanId }>("/api/workspace/set-plan", {
      method: "POST",
      body: JSON.stringify({ planId }),
    }),

  clearBoard: () =>
    jsonFetch<{ ok: boolean }>("/api/board", { method: "DELETE" }),

  geocode: (q: string) =>
    jsonFetch<{ coords: { lat: number; lng: number } | null }>(
      `/api/geocode?q=${encodeURIComponent(q)}`,
    ),

  listRuns: () => jsonFetch<{ runs: Run[] }>("/api/runs"),

  runWithLeads: (id: string) =>
    jsonFetch<{ run: Run; leads: LeadWithOutreach[] }>(`/api/runs/${id}`),

  draft: (
    leadId: string,
    opts?: { signOff?: string; offerNotes?: string; subjectTemplate?: string },
  ) =>
    jsonFetch<{ outreach: Outreach }>("/api/outreach", {
      method: "POST",
      body: JSON.stringify({
        leadId,
        ...(opts?.signOff ? { signOff: opts.signOff } : {}),
        ...(opts?.offerNotes ? { offerNotes: opts.offerNotes } : {}),
        ...(opts?.subjectTemplate ? { subjectTemplate: opts.subjectTemplate } : {}),
      }),
    }),

  updateOutreach: (
    id: string,
    patch: {
      subject?: string;
      body?: string;
      toEmail?: string | null;
      decision?: "approved" | "rejected";
      deliveryStatus?: "unknown" | "sent" | "bounced" | "replied";
    },
  ) =>
    jsonFetch<{ outreach: Outreach }>(`/api/outreach/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  send: (outreachId: string) =>
    jsonFetch<{
      ok: boolean;
      error?: string;
      provider?: "google" | "resend" | "maileroo" | "smtp" | "demo";
    }>("/api/send", {
      method: "POST",
      body: JSON.stringify({ outreachId }),
    }),

  updateLead: (
    id: string,
    patch: {
      crmStage?: CrmStage;
      contactMethod?: ContactMethod | null;
      notes?: string | null;
      followUps?: FollowUp[];
    },
  ) => jsonFetch<{ lead: Lead }>(`/api/leads/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  suggestLocations: (q: string) =>
    jsonFetch<{ suggestions: LocationSuggestion[] }>(
      `/api/geocode?suggest=1&q=${encodeURIComponent(q)}`,
    ),

  checkout: (planId: PlanId) =>
    jsonFetch<{ url: string | null }>("/api/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ planId }),
    }),

  portal: () =>
    jsonFetch<{ url: string | null }>("/api/billing/portal", { method: "POST" }),

  firecrawlUsage: () =>
    jsonFetch<FirecrawlUsage>("/api/providers/firecrawl/usage"),
};

export type FirecrawlUsage = {
  available: boolean;
  provider: "firecrawl";
  remainingCredits: number | null;
  planCredits: number | null;
  error?: string;
};
