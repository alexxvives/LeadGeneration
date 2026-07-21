/**
 * @deprecated Prefer GET /api/providers/verify/usage (ADR 0016).
 * Kept so any old bookmarks / scripts keep working.
 */
export { GET } from "@/app/api/providers/verify/usage/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
