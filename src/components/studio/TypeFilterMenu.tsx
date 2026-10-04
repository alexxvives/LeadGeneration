"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDownIcon } from "@/components/icons";

/** Case-insensitive identity for company types ("Cafe" and "cafe" are one). */
export function companyTypeKey(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function titleCaseType(raw: string): string {
  const t = raw.trim().replace(/\s+/g, " ");
  if (!t) return t;
  return t
    .toLocaleLowerCase()
    .split(/([\s_/.-]+)/)
    .map((part) =>
      /^[\s_/.-]+$/.test(part)
        ? part
        : part.charAt(0).toLocaleUpperCase() + part.slice(1),
    )
    .join("");
}

/**
 * One menu label for a case-variant group. Keep a mixed-case spelling when
 * the board already has one ("IT Services"); otherwise title-case.
 */
export function canonicalCompanyType(variants: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const raw of variants) {
    const t = raw.trim().replace(/\s+/g, " ");
    if (!t) continue;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort(
    (a, b) =>
      b[1] - a[1] ||
      a[0].localeCompare(b[0], undefined, { sensitivity: "base" }),
  );
  const mixed = ranked.find(
    ([label]) => {
      const lower = label.toLocaleLowerCase();
      const upper = label.toLocaleUpperCase();
      return label !== lower && label !== upper;
    },
  );
  if (mixed) return mixed[0];
  return titleCaseType(ranked[0]?.[0] ?? "");
}

const MENU_MAX_H = 256;

/**
 * Company-type filter. Same portaled glass menu as the board picker and
 * calendar: the studio header is overflow-clipped, so the list renders on
 * document.body.
 */
export function TypeFilterMenu({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLUListElement | null>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = Math.max(r.width, 180);
      let top = r.bottom + 6;
      let left = r.left;
      if (top + MENU_MAX_H > window.innerHeight - 8) {
        top = Math.max(8, r.top - MENU_MAX_H - 6);
      }
      left = Math.min(Math.max(8, left), window.innerWidth - width - 8);
      setPos({ top, left, width });
    };
    place();
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const typeRows: { id: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const raw of options) {
    const key = companyTypeKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    typeRows.push({ id: raw, label: canonicalCompanyType([raw]) });
  }
  const selected = typeRows.find(
    (row) => companyTypeKey(row.id) === companyTypeKey(value),
  );
  const label =
    value === "all" ? "All types" : (selected?.label ?? titleCaseType(value));
  const rows: { id: string; label: string }[] = [
    { id: "all", label: "All types" },
    ...typeRows,
  ];

  const menu =
    open && pos && typeof document !== "undefined"
      ? createPortal(
          <ul
            ref={popRef}
            id={listId}
            role="listbox"
            aria-label="Lead types"
            className="fixed z-[1200] max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-ink-900 py-1 shadow-xl"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
          >
            {rows.map((row) => {
              const active =
                row.id === "all"
                  ? value === "all"
                  : value !== "all" &&
                    companyTypeKey(value) === companyTypeKey(row.id);
              return (
                <li key={row.id} role="option" aria-selected={active}>
                  <button
                    type="button"
                    className={`block w-full truncate px-3 py-2 text-left text-sm transition-colors ${
                      active
                        ? "bg-aurora-400/10 font-medium text-aurora-300"
                        : "text-mist-200 hover:bg-white/5"
                    }`}
                    onClick={() => {
                      onChange(row.id);
                      setOpen(false);
                      triggerRef.current?.focus();
                    }}
                  >
                    {row.label}
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className="relative inline-flex h-9 shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label="Filter outreach by lead type"
        className="inline-flex h-9 min-w-[9.75rem] items-center justify-between gap-2 rounded-xl border border-white/10 bg-ink-900/60 py-0 pl-3 pr-2.5 text-sm text-mist-100 outline-none transition-colors hover:border-white/20 focus-visible:border-aurora-400/50"
      >
        <span className="truncate">{label}</span>
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-mist-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </button>
      {menu}
    </div>
  );
}
