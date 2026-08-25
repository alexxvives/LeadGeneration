/** Classname join for lucide-animated (and other) client components. */
export function cn(
  ...parts: Array<string | undefined | false | null>
): string {
  return parts.filter(Boolean).join(" ");
}
