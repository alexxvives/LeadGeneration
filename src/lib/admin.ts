import type { Session } from "next-auth";
import { authRequired } from "@/lib/config";

/**
 * Platform admin gate — JWT `isAdmin` from `users.is_admin` (hashed account).
 * Local demo (`!authRequired`) keeps admin chrome open for dogfooding.
 */
export function isAdminSession(
  session: Session | null | undefined,
): boolean {
  if (!authRequired()) return true;
  return session?.isAdmin === true;
}
