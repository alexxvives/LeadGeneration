import type { ContactMethod, FollowUpKind } from "@/lib/types";

const METHODS: readonly ContactMethod[] = [
  "email",
  "phone",
  "contact_form",
  "instagram",
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

const METHOD_ORDER: readonly ContactMethod[] = [
  "email",
  "phone",
  "contact_form",
  "instagram",
];

/**
 * Reconcile cached methods with a GET/poll snapshot. Keep optimistic extras,
 * skip `dropped` so a stale row cannot resurrect a toggle-off.
 */
export function mergeContactMethods(
  cached: ContactMethod[],
  incoming: ContactMethod[],
  dropped?: ReadonlySet<ContactMethod> | null,
): ContactMethod[] {
  const set = new Set<ContactMethod>();
  for (const m of cached) {
    if (dropped?.has(m)) continue;
    set.add(m);
  }
  for (const m of incoming) {
    if (dropped?.has(m)) continue;
    set.add(m);
  }
  return METHOD_ORDER.filter((m) => set.has(m));
}

export function rememberDroppedContactMethods(
  prior:
    | Pick<
        { contactMethods: ContactMethod[]; droppedContactMethods?: ContactMethod[] },
        "contactMethods" | "droppedContactMethods"
      >
    | undefined,
  nextMethods: ContactMethod[] | undefined,
): ContactMethod[] | undefined {
  const prevDropped = prior?.droppedContactMethods ?? [];
  if (!nextMethods) {
    return prevDropped.length ? prevDropped : undefined;
  }
  const nextSet = new Set(nextMethods);
  const extra = (prior?.contactMethods ?? []).filter((m) => !nextSet.has(m));
  const dropped = [...new Set([...prevDropped, ...extra])].filter(
    (m) => !nextSet.has(m),
  );
  return dropped.length ? dropped : undefined;
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
  if (method === "instagram") return "Instagram";
  return "contact form";
}

/** Note for a newly added channel. Phone/email are omitted — the drawer writes those logs. */
export function contactMethodAddedNote(
  method: Exclude<ContactMethod, "phone" | "email">,
  byName?: string | null,
): { note: string; kind: FollowUpKind } {
  const who = byName?.trim();
  if (method === "instagram") {
    const base = "Contacted via Instagram";
    return { note: who ? `${base} — ${who}` : base, kind: "note" };
  }
  const base = "Contacted via contact form";
  return { note: who ? `${base} — ${who}` : base, kind: "note" };
}
