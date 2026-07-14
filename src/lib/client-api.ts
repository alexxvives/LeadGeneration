import type {
  Capabilities,
} from "@/lib/config";
import type {
  LeadWithOutreach,
  Outreach,
  PlanId,
  Run,
  SearchStrategy,
  WorkspaceSummary,
} from "@/lib/types";

export interface BoardResponse {
  run: Run | null;
  leads: LeadWithOutreach[];
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
  board: () => jsonFetch<BoardResponse>("/api/board"),

  createRun: (input: {
    niche: string;
    location?: string;
    offerNotes?: string;
    searchStrategy?: SearchStrategy;
  }) =>
    jsonFetch<{ run: Run }>("/api/runs", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  runWithLeads: (id: string) =>
    jsonFetch<{ run: Run; leads: LeadWithOutreach[] }>(`/api/runs/${id}`),

  draft: (leadId: string) =>
    jsonFetch<{ outreach: Outreach }>("/api/outreach", {
      method: "POST",
      body: JSON.stringify({ leadId }),
    }),

  updateOutreach: (
    id: string,
    patch: { subject?: string; body?: string; toEmail?: string | null; decision?: "approved" | "rejected" },
  ) =>
    jsonFetch<{ outreach: Outreach }>(`/api/outreach/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  send: (outreachId: string) =>
    jsonFetch<{ ok: boolean; error?: string }>("/api/send", {
      method: "POST",
      body: JSON.stringify({ outreachId }),
    }),

  checkout: (planId: PlanId) =>
    jsonFetch<{ url: string | null }>("/api/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ planId }),
    }),

  portal: () =>
    jsonFetch<{ url: string | null }>("/api/billing/portal", { method: "POST" }),
};
