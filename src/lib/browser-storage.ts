/**
 * Read a localStorage key, migrating from legacy Lodestar keys once.
 */
export function readMigratedKey(key: string, legacyKeys: string[]): string | null {
  if (typeof window === "undefined") return null;
  const current = localStorage.getItem(key);
  if (current != null) return current;
  for (const legacy of legacyKeys) {
    const old = localStorage.getItem(legacy);
    if (old == null) continue;
    localStorage.setItem(key, old);
    localStorage.removeItem(legacy);
    return old;
  }
  return null;
}
