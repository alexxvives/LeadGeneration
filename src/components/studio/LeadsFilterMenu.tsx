"use client";

import { useEffect, useRef, useState } from "react";
import type { CrmStage } from "@/lib/types";
import { crmStageLabel } from "@/components/ui";
import { FilterIcon } from "@/components/icons";
import type { LeadsLayout } from "./studio-ui-prefs";

const STAGES: CrmStage[] = [
  "new",
  "contacted",
  "in_conversation",
  "closed",
  "not_interested",
];

/**
 * Phone-only: layout + stage filters in one menu (desktop keeps the split chrome).
 */
export function LeadsFilterMenu({
  layout,
  onLayout,
  stage,
  onStage,
}: {
  layout: LeadsLayout;
  onLayout: (next: LeadsLayout) => void;
  stage: CrmStage | "all";
  onStage: (next: CrmStage | "all") => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const filtered = stage !== "all";

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        data-testid="leads-filter-menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={filtered ? "Layout and stage filters (stage active)" : "Layout and stage filters"}
        onClick={() => setOpen((o) => !o)}
        className={`relative inline-flex h-11 w-11 items-center justify-center rounded-xl border transition-colors ${
          open || filtered
            ? "border-aurora-400/40 bg-aurora-400/10 text-aurora-200"
            : "border-white/10 text-mist-100 hover:border-white/20"
        }`}
      >
        <FilterIcon className="h-4 w-4" />
        {filtered ? (
          <span
            className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-aurora-400"
            aria-hidden
          />
        ) : null}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Layout and stage filters"
          className="absolute right-0 top-[calc(100%+0.35rem)] z-40 w-56 rounded-xl border border-white/10 bg-ink-900 p-2 shadow-xl"
        >
          <p className="px-2 pb-1 text-[0.65rem] uppercase tracking-wider text-mist-500">
            Layout
          </p>
          <div className="flex flex-col gap-0.5">
            {(["table", "map"] as const).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={layout === key}
                className={`flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm capitalize transition-colors ${
                  layout === key
                    ? "bg-aurora-400/10 font-medium text-aurora-200"
                    : "text-mist-200 hover:bg-white/5"
                }`}
                onClick={() => onLayout(key)}
              >
                {key}
              </button>
            ))}
          </div>
          <p className="mt-2 px-2 pb-1 text-[0.65rem] uppercase tracking-wider text-mist-500">
            Stage
          </p>
          <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
            <button
              type="button"
              aria-pressed={stage === "all"}
              className={`flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm transition-colors ${
                stage === "all"
                  ? "bg-aurora-400/10 font-medium text-aurora-200"
                  : "text-mist-200 hover:bg-white/5"
              }`}
              onClick={() => {
                onStage("all");
                setOpen(false);
                triggerRef.current?.focus();
              }}
            >
              All stages
            </button>
            {STAGES.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={stage === s}
                className={`flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm transition-colors ${
                  stage === s
                    ? "bg-aurora-400/10 font-medium text-aurora-200"
                    : "text-mist-200 hover:bg-white/5"
                }`}
                onClick={() => {
                  onStage(s);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
              >
                {crmStageLabel(s)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
