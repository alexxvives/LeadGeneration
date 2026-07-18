import type { LeadColumnDef } from "@/lib/types";
import { readMigratedKey } from "@/lib/browser-storage";

const COLS_KEY = "hermes_lead_columns";
const COLS_LEGACY = ["leadify_lead_columns", "lodestar_lead_columns"];
const VIS_KEY = "hermes_lead_column_visibility";
const VIS_LEGACY = [
  "leadify_lead_column_visibility",
  "lodestar_lead_column_visibility",
];

export type ColumnVisibility = {
  notes: boolean;
  /** Custom column id → visible */
  custom: Record<string, boolean>;
};

const DEFAULT_VIS: ColumnVisibility = { notes: false, custom: {} };

export function loadLeadColumns(): LeadColumnDef[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = readMigratedKey(COLS_KEY, COLS_LEGACY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LeadColumnDef[];
    return Array.isArray(parsed) ? parsed.filter((c) => c?.id && c?.name) : [];
  } catch {
    return [];
  }
}

export function saveLeadColumns(cols: LeadColumnDef[]): void {
  localStorage.setItem(COLS_KEY, JSON.stringify(cols));
}

export function loadColumnVisibility(): ColumnVisibility {
  if (typeof window === "undefined") return DEFAULT_VIS;
  try {
    const raw = readMigratedKey(VIS_KEY, VIS_LEGACY);
    if (!raw) return { ...DEFAULT_VIS };
    const parsed = JSON.parse(raw) as Partial<ColumnVisibility>;
    return {
      notes: !!parsed.notes,
      custom: parsed.custom && typeof parsed.custom === "object" ? parsed.custom : {},
    };
  } catch {
    return { ...DEFAULT_VIS };
  }
}

export function saveColumnVisibility(vis: ColumnVisibility): void {
  localStorage.setItem(VIS_KEY, JSON.stringify(vis));
}

export function newColumnId(): string {
  return `col_${Math.random().toString(36).slice(2, 10)}`;
}
