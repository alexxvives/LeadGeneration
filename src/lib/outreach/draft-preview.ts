/**
 * Client-safe surface for Settings pitch preview.
 * Pure templates only (no DB, env, or network) — same helpers the server uses
 * when drafting; kept separate so UI never imports the full outreach pipeline.
 */
export { generateDraft, applySubjectTemplate } from "@/lib/outreach/draft";
export type { DraftOverrides, DraftResult } from "@/lib/outreach/draft";
