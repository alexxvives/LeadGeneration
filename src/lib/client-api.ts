import type {
  Capabilities,
} from "@/lib/config";
import type { LeadWithOutreach, Outreach, Run, SearchStrategy } from "@/lib/types";

export interface BoardResponse {
  run: Run | null;
  leads: LeadWithOutreach[];
  capabilities: Capabilities;
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
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
};
