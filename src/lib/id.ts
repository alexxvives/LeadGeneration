import { randomUUID } from "crypto";

/** Prefixed, sortable-ish id. Prefix keeps ids readable in the JSON store. */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
