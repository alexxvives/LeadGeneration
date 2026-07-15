/** Prefixed id. Works in Node and in the browser (LeadDrawer notes). */
export function newId(prefix: string): string {
  const uuid = randomId();
  return `${prefix}_${uuid.replace(/-/g, "").slice(0, 20)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

function randomId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  // Extremely old runtimes — not cryptographically strong, but unique enough for UI ids.
  return `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, (ch) => {
    const n = (Math.random() * 16) | 0;
    const v = ch === "x" ? n : (n & 0x3) | 0x8;
    return v.toString(16);
  });
}
