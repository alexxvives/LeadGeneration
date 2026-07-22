import type {
  Capabilities,
} from "@/lib/config";
import type {
  Board,
  BoardInvite,
  BoardLock,
  BoardMember,
  BoardSummary,
  ContactMethod,
  CrmStage,
  AdminPlatformStats,
  AdminUserRow,
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
  boardLock: BoardLock | null;
  capabilities: Capabilities;
  workspace: WorkspaceSummary;
}

/** Error thrown when a request is rejected for exceeding a plan quota (402). */
export class QuotaExceededError extends Error {
  readonly kind: "leads" | "sends" | "verifies";
  readonly planId: PlanId;
  constructor(
    message: string,
    kind: "leads" | "sends" | "verifies",
    planId: PlanId,
  ) {
    super(message);
    this.name = "QuotaExceededError";
    this.kind = kind;
    this.planId = planId;
  }
}

export class RateLimitedError extends Error {
  readonly retryAfterMs: number;
  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = "RateLimitedError";
    this.retryAfterMs = retryAfterMs;
  }
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data as {
      error?: string;
      quota?: { kind: "leads" | "sends" | "verifies"; planId: PlanId };
      undeliverableRemoved?: boolean;
      rateLimited?: boolean;
      retryAfterMs?: number;
    };
    if (res.status === 402 && err.quota) {
      throw new QuotaExceededError(
        err.error ?? "Plan limit reached",
        err.quota.kind,
        err.quota.planId,
      );
    }
    if (res.status === 429 || err.rateLimited) {
      throw new RateLimitedError(
        err.error ?? "Rate limited",
        typeof err.retryAfterMs === "number" && err.retryAfterMs > 0
          ? err.retryAfterMs
          : 15_000,
      );
    }
    const e = new Error(err.error ?? `Request failed (${res.status})`) as Error & {
      undeliverableRemoved?: boolean;
      locked?: boolean;
    };
    if (err.undeliverableRemoved) e.undeliverableRemoved = true;
    if (res.status === 423) e.locked = true;
    throw e;
  }
  return data as T;
}

export const api = {
  board: (boardId?: string | null, opts?: { lite?: boolean }) => {
    const params = new URLSearchParams();
    params.set(
      "boardId",
      boardId && boardId !== "all" ? boardId : "all",
    );
    if (opts?.lite) params.set("lite", "1");
    return jsonFetch<BoardResponse>(`/api/board?${params.toString()}`);
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

  inviteToBoard: (boardId: string, email: string) =>
    jsonFetch<{ invite: BoardInvite; emailSent: boolean }>(
      `/api/boards/${boardId}/invites`,
      {
        method: "POST",
        body: JSON.stringify({ email }),
      },
    ),

  listBoardInvites: (boardId: string) =>
    jsonFetch<{ invites: BoardInvite[]; members: BoardMember[] }>(
      `/api/boards/${boardId}/invites`,
    ),

  listMyInvites: () => jsonFetch<{ invites: BoardInvite[] }>("/api/invites"),

  acceptInvite: (inviteId: string) =>
    jsonFetch<{ member: BoardMember }>("/api/invites", {
      method: "POST",
      body: JSON.stringify({ inviteId }),
    }),

  heartbeatBoardLock: (boardId: string) =>
    jsonFetch<{ lock: BoardLock }>(`/api/boards/${boardId}/lock`, {
      method: "POST",
    }),

  releaseBoardLock: (boardId: string) =>
    jsonFetch<{ ok: boolean }>(`/api/boards/${boardId}/lock`, {
      method: "DELETE",
    }),

  getBoardLock: (boardId: string) =>
    jsonFetch<{ lock: BoardLock | null }>(`/api/boards/${boardId}/lock`),

  dashboard: (boardId?: string | null) => {
    const q =
      boardId && boardId !== "all"
        ? `?boardId=${encodeURIComponent(boardId)}`
        : "";
    return jsonFetch<DashboardStats & { workspace: WorkspaceSummary }>(
      `/api/dashboard${q}`,
    );
  },

  adminOverview: () => jsonFetch<AdminPlatformStats>("/api/admin/overview"),

  adminUsers: () => jsonFetch<{ users: AdminUserRow[] }>("/api/admin/users"),

  createInsiderInvite: () =>
    jsonFetch<{ url: string; expiresInDays: number; note: string }>(
      "/api/admin/insider-invite",
      { method: "POST" },
    ),

  adminDeleteUser: (workspaceId: string) =>
    jsonFetch<{ ok: boolean }>("/api/admin/users", {
      method: "DELETE",
      body: JSON.stringify({ workspaceId }),
    }),

  adminSetFindLeads: (workspaceId: string, findLeadsEnabled: boolean) =>
    jsonFetch<{ ok: boolean; findLeadsEnabled: boolean }>("/api/admin/users", {
      method: "PATCH",
      body: JSON.stringify({ workspaceId, findLeadsEnabled }),
    }),

  deleteAccount: () =>
    jsonFetch<{ ok: boolean }>("/api/account", { method: "DELETE" }),

  createRun: (input: {
    niche: string;
    location?: string;
    offerNotes?: string;
    senderName?: string;
    subjectTemplate?: string;
    autoDraft?: boolean;
    staticBody?: boolean;
    aiPersonalize?: boolean;
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

  setPlanDev: (planId: PlanId, workspaceId?: string) =>
    jsonFetch<{ ok: boolean; planId: PlanId; workspaceId: string }>("/api/workspace/set-plan", {
      method: "POST",
      body: JSON.stringify({ planId, workspaceId }),
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
    opts?: {
      signOff?: string;
      offerNotes?: string;
      subjectTemplate?: string;
      staticBody?: boolean;
      aiPersonalize?: boolean;
      forceLang?: string;
    },
  ) =>
    jsonFetch<{ outreach: Outreach }>("/api/outreach", {
      method: "POST",
      body: JSON.stringify({
        leadId,
        ...(opts?.signOff !== undefined ? { signOff: opts.signOff } : {}),
        // Always pass offerNotes when set (incl. "") so empty profile ≠ run fallback.
        ...(opts && "offerNotes" in opts ? { offerNotes: opts.offerNotes ?? "" } : {}),
        ...(opts?.subjectTemplate !== undefined
          ? { subjectTemplate: opts.subjectTemplate }
          : {}),
        ...(opts?.staticBody !== undefined ? { staticBody: opts.staticBody } : {}),
        ...(opts?.aiPersonalize !== undefined
          ? { aiPersonalize: opts.aiPersonalize }
          : {}),
        ...(opts?.forceLang !== undefined ? { forceLang: opts.forceLang } : {}),
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
      contactMethods?: ContactMethod[];
      notes?: string | null;
      companyType?: string | null;
      company?: string;
      website?: string | null;
      emails?: string[];
      phones?: string[];
      location?: string | null;
      aboutBlurb?: string | null;
      followUps?: FollowUp[];
      customFields?: Record<string, string>;
    },
  ) => jsonFetch<{ lead: Lead }>(`/api/leads/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  deleteLead: (id: string) =>
    jsonFetch<{ ok: boolean }>(`/api/leads/${id}`, { method: "DELETE" }),

  /**
   * Bulk-delete. Prefer `boardId` (set-based clear) when wiping a whole board —
   * the ids path is capped at 500/request and is chunked here as a fallback.
   */
  deleteLeads: async (
    ids: string[],
    opts?: {
      boardId?: string | null;
      /** When true + boardId set, clear the board in one request (no id list). */
      clearBoard?: boolean;
      onProgress?: (done: number, total: number) => void;
    },
  ) => {
    if (opts?.clearBoard && opts.boardId) {
      opts.onProgress?.(0, Math.max(ids.length, 1));
      const result = await jsonFetch<{ deleted: number }>(
        "/api/leads/bulk-delete",
        {
          method: "POST",
          body: JSON.stringify({ boardId: opts.boardId }),
        },
      );
      opts.onProgress?.(ids.length || result.deleted, ids.length || result.deleted);
      return result;
    }

    const CHUNK = 500;
    const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    let deleted = 0;
    for (let i = 0; i < unique.length; i += CHUNK) {
      const chunk = unique.slice(i, i + CHUNK);
      const result = await jsonFetch<{ deleted: number }>(
        "/api/leads/bulk-delete",
        {
          method: "POST",
          body: JSON.stringify({ ids: chunk }),
        },
      );
      deleted += result.deleted;
      opts?.onProgress?.(
        Math.min(i + chunk.length, unique.length),
        unique.length,
      );
    }
    return { deleted };
  },

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

  /** MyEmailVerifier (or legacy Zeruh) credit balance — ADR 0016. */
  verifyUsage: () => jsonFetch<VerifyUsage>("/api/providers/verify/usage"),

  mapImportColumns: (headers: string[]) =>
    jsonFetch<{
      mapping: Partial<{
        company: number;
        emails: number;
        website: number;
        phones: number;
        location: number;
        contactName: number;
        companyType: number;
      }> | null;
    }>("/api/ai/map-columns", {
      method: "POST",
      body: JSON.stringify({ headers }),
    }),
};

export type FirecrawlUsage = {
  available: boolean;
  provider: "firecrawl";
  remainingCredits: number | null;
  planCredits: number | null;
  error?: string;
};

export type VerifyUsage = {
  available: boolean;
  provider: "myemailverifier" | "zeruh";
  remainingCredits: number | null;
  permanentCredits: number | null;
  recurringCredits: number | null;
  /** MyEmailVerifier free tier hint (100/day) — for UI copy only. */
  dailyFreeHint?: number | null;
  error?: string;
};

/** @deprecated Use VerifyUsage — name was historical (Zeruh). */
export type ZeruhUsage = VerifyUsage;
