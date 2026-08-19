import type { ContactMethod, FollowUpKind } from "@/lib/types";

const METHODS: readonly ContactMethod[] = [
  "email",
  "phone",
  "contact_form",
] as const;

export function isContactMethod(v: unknown): v is ContactMethod {
  return typeof v === "string" && (METHODS as readonly string[]).includes(v);
}

/** Parse DB / legacy single-value or JSON array into a unique method list. */
export function parseContactMethods(raw: unknown): ContactMethod[] {
  if (raw == null || raw === "") return [];
  if (Array.isArray(raw)) {
    return [...new Set(raw.filter(isContactMethod))];
  }
  if (typeof raw !== "string") return [];
  const t = raw.trim();
  if (!t) return [];
  if (t.startsWith("[")) {
    try {
      return parseContactMethods(JSON.parse(t) as unknown);
    } catch {
      // fall through
    }
  }
  if (isContactMethod(t)) return [t];
  return [
    ...new Set(
      t
        .split(/[,|]/)
        .map((s) => s.trim())
        .filter(isContactMethod),
    ),
  ];
}

/** Persist for TEXT column — single value stays plain; multi becomes JSON. */
export function serializeContactMethods(
  methods: ContactMethod[] | null | undefined,
): string | null {
  if (!methods?.length) return null;
  const unique = [...new Set(methods.filter(isContactMethod))];
  if (unique.length === 0) return null;
  if (unique.length === 1) return unique[0]!;
  return JSON.stringify(unique);
}

export function toggleContactMethod(
  current: ContactMethod[],
  method: ContactMethod,
): ContactMethod[] {
  return current.includes(method)
    ? current.filter((m) => m !== method)
    : [...current, method];
}

export function contactMethodsEqual(
  a: ContactMethod[] | null | undefined,
  b: ContactMethod[] | null | undefined,
): boolean {
  const aa = [...(a ?? [])].sort();
  const bb = [...(b ?? [])].sort();
  if (aa.length !== bb.length) return false;
  return aa.every((m, i) => m === bb[i]);
}

export function contactMethodLabel(method: ContactMethod): string {
  if (method === "email") return "email";
  if (method === "phone") return "phone";
  return "contact form";
}

/** Note for a newly added channel. Phone/email are omitted — the drawer writes those logs. */
export function contactMethodAddedNote(
  method: Exclude<ContactMethod, "phone">,
  byName?: string | null,
): { note: string; kind: FollowUpKind } {
  const who = byName?.trim();
  if (method === "email") {
    const base = "Contacted by email";
    return { note: who ? `${base} — ${who}` : base, kind: "email" };
  }
  const base = "Contacted via contact form";
  return { note: who ? `${base} — ${who}` : base, kind: "note" };
}
