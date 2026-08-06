/**
 * Browser-only studio chrome prefs (filters / layout). sessionStorage — no DB.
 * Survives tab switches and Settings round-trips within the same tab.
 */

import type { CrmStage } from "@/lib/types";

const KEY = "hermes_studio_ui";

const CRM_STAGES: readonly CrmStage[] = [
  "new",
  "contacted",
  "in_conversation",
  "closed",
  "not_interested",
];

export type LeadsLayout = "table" | "cards" | "map";

export type StudioUiPrefs = {
  leadSearch: string;
  pipelineFilter: CrmStage | "all";
  outreachTypeFilter: string;
  layout: LeadsLayout;
};

const DEFAULTS: StudioUiPrefs = {
  leadSearch: "",
  pipelineFilter: "all",
  outreachTypeFilter: "all",
  layout: "table",
};

function isLayout(v: unknown): v is LeadsLayout {
  return v === "table" || v === "cards" || v === "map";
}

function isStageFilter(v: unknown): v is CrmStage | "all" {
  return v === "all" || (typeof v === "string" && CRM_STAGES.includes(v as CrmStage));
}

export function loadStudioUiPrefs(): StudioUiPrefs {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<StudioUiPrefs>;
    return {
      leadSearch:
        typeof parsed.leadSearch === "string" ? parsed.leadSearch : DEFAULTS.leadSearch,
      pipelineFilter: isStageFilter(parsed.pipelineFilter)
        ? parsed.pipelineFilter
        : DEFAULTS.pipelineFilter,
      outreachTypeFilter:
        typeof parsed.outreachTypeFilter === "string"
          ? parsed.outreachTypeFilter
          : DEFAULTS.outreachTypeFilter,
      layout: isLayout(parsed.layout) ? parsed.layout : DEFAULTS.layout,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveStudioUiPrefs(prefs: StudioUiPrefs): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* private mode / quota */
  }
}
