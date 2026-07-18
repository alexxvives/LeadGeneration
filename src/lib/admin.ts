import { env } from "@/lib/config";

/** Platform admin — only account that may override plan / reset usage. */
export function adminEmail(): string {
  return env.adminEmail();
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === adminEmail();
}

/**
 * Admin password check. Edge-safe (no Node crypto) — fine for a temporary
 * shared secret; hash + D1 before GA.
 */
export function verifyAdminPassword(password: string): boolean {
  const expected = env.adminPassword();
  if (!expected || password.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= password.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export function verifyAdminCredentials(
  email: string,
  password: string,
): boolean {
  return isAdminEmail(email) && verifyAdminPassword(password);
}
