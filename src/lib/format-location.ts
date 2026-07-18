/** Short city/region label for tables — keeps full street address for the drawer. */
export function shortLocation(location: string | null | undefined): string | null {
  if (!location?.trim()) return null;
  const stripPostal = (s: string) =>
    s.replace(/^\d{4,6}\s+/, "").replace(/\s+\d{4,6}$/, "").trim();
  const parts = location.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    // "123 Main St, Austin, TX 78701" → "Austin, TX"
    // "…, 08002 Barcelona, Spain" → "Barcelona, Spain"
    // "08011 Barcelona, Spain" → "Barcelona, Spain"
    const last = parts[parts.length - 1] ?? "";
    const prev = stripPostal(parts[parts.length - 2] ?? "");
    if (/^\d{4,6}/.test(last) && parts.length >= 3) {
      return stripPostal(last) || last;
    }
    if (/^[A-Z]{2}(?:\s+\d{5})?$/.test(last)) return `${prev}, ${last.split(/\s+/)[0]}`;
    if (prev && last) return `${prev}, ${last}`;
    return parts.slice(-2).map(stripPostal).join(", ");
  }
  return stripPostal(location.trim()) || location.trim();
}
