/**
 * Heuristics for "sending identity is still a placeholder".
 * Used by Settings checklist + Getting Started wizard — never treat the
 * config.ts string defaults as "configured" for go-live readiness.
 */

const PLACEHOLDER_EMAILS = new Set([
  "you@yourdomain.com",
  "you@example.com",
]);

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  if (!email || !email.trim()) return true;
  return PLACEHOLDER_EMAILS.has(email.trim().toLowerCase());
}

export function isPlaceholderAddress(address: string | null | undefined): boolean {
  if (!address || !address.trim()) return true;
  return /placeholder/i.test(address);
}

export function isPlaceholderName(name: string | null | undefined): boolean {
  if (!name || !name.trim()) return true;
  const n = name.trim().toLowerCase();
  return n === "your name" || n === "lodestar outreach";
}

/** True when from name, email, and physical address all look real. */
export function isIdentityReady(opts: {
  fromName?: string | null;
  fromEmail?: string | null;
  physicalAddress?: string | null;
}): boolean {
  return (
    !isPlaceholderName(opts.fromName) &&
    !isPlaceholderEmail(opts.fromEmail) &&
    !isPlaceholderAddress(opts.physicalAddress)
  );
}
