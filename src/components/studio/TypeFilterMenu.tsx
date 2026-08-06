"use client";

import { useEffect, useRef, useState } from "react";

/** Soft title-case for ALL-CAPS company types without changing filter values. */
function displayType(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  if (t !== t.toUpperCase()) return t;
  return t
    .toLowerCase()
    .split(/([\s_/.-]+)/)
    .map((part) =>
      /^[\s_/.-]+$/.test(part)
        ? part
        : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join("");
}

/**
 * Custom glass menu for Outreach company-type filter (replaces native select).
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
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = value === "all" ? "All types" : displayType(value);

  return (
    <div ref={rootRef} className="relative inline-flex h-full shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Filter outreach by lead type"
        className="inline-flex h-full min-w-[9.75rem] items-center justify-between gap-2 rounded-xl border border-white/10 bg-ink-900/60 py-0 pl-3 pr-2.5 text-sm text-mist-100 outline-none transition-colors hover:border-white/20 focus-visible:border-aurora-400/50"
      >
        <span className="truncate">{label}</span>
        <span className="shrink-0 text-[10px] text-mist-500" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <ul
          role="listbox"
          aria-label="Lead types"
          className="absolute right-0 top-[calc(100%+0.35rem)] z-40 max-h-64 min-w-full overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-ink-900 py-1 shadow-xl"
        >
          <li role="option" aria-selected={value === "all"}>
            <button
              type="button"
              className={`block w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-white/5 ${
                value === "all"
                  ? "font-medium text-aurora-300"
                  : "text-mist-200"
              }`}
              onClick={() => {
                onChange("all");
                setOpen(false);
              }}
            >
              All types
            </button>
          </li>
          {options.map((t) => (
            <li key={t} role="option" aria-selected={value === t}>
              <button
                type="button"
                className={`block w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-white/5 ${
                  value === t
                    ? "font-medium text-aurora-300"
                    : "text-mist-200"
                }`}
                onClick={() => {
                  onChange(t);
                  setOpen(false);
                }}
              >
                {displayType(t)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
