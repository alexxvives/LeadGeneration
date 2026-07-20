/**
 * Compat shim — prefer `/api/password-login`. Kept so older clients still hit
 * a handler; middleware also bypasses `auth()` for this path.
 */
export { POST } from "@/app/api/password-login/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
