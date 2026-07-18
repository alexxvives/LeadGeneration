import type { SavedIcp } from "@/lib/types";
import { readMigratedKey } from "@/lib/browser-storage";

const KEY = "hermes_saved_icps";
const LEGACY_KEYS = ["leadify_saved_icps", "lodestar_saved_icps"];
const MAX = 12;

export function loadSavedIcps(): SavedIcp[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = readMigratedKey(KEY, LEGACY_KEYS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is SavedIcp => !!x && typeof x === "object" && typeof (x as SavedIcp).id === "string")
      .map((x) => ({
        id: String(x.id),
        name: String(x.name ?? "Untitled"),
        niche: String(x.niche ?? ""),
        location: String(x.location ?? ""),
        offerNotes: String(x.offerNotes ?? ""),
        createdAt: String(x.createdAt ?? new Date().toISOString()),
      }));
  } catch {
    return [];
  }
}

function persist(list: SavedIcp[]): void {
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
}

export function saveIcp(input: {
  name: string;
  niche: string;
  location: string;
  offerNotes: string;
}): SavedIcp {
  const item: SavedIcp = {
    id: `icp_${Date.now().toString(36)}`,
    name: input.name.trim() || input.niche.trim() || "Untitled ICP",
    niche: input.niche.trim(),
    location: input.location.trim(),
    offerNotes: input.offerNotes.trim(),
    createdAt: new Date().toISOString(),
  };
  const next = [item, ...loadSavedIcps().filter((x) => x.id !== item.id)];
  persist(next);
  return item;
}

export function deleteSavedIcp(id: string): void {
  persist(loadSavedIcps().filter((x) => x.id !== id));
}
