"use client";

import { useEffect, useRef, useState } from "react";
import type { BoardSummary } from "@/lib/types";
import { BoardsIcon, ChevronDownIcon } from "@/components/icons";

const STORAGE_KEY = "leadify_active_board";

export function loadStoredBoardFilter(): string {
  if (typeof window === "undefined") return "all";
  return localStorage.getItem(STORAGE_KEY) || "all";
}

export function storeBoardFilter(id: string): void {
  localStorage.setItem(STORAGE_KEY, id);
}

/**
 * Compact board filter above the account card — All (default) or one board.
 */
export function BoardPicker({
  boards,
  activeBoardId,
  onChange,
}: {
  boards: BoardSummary[];
  /** null / "all" = all boards */
  activeBoardId: string | null;
  onChange: (boardId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const active =
    activeBoardId && boards.find((b) => b.id === activeBoardId)
      ? boards.find((b) => b.id === activeBoardId)!
      : null;
  const label = active ? active.name : "All boards";
  const totalLeads = boards.reduce((s, b) => s + b.leadCount, 0);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={wrapRef} className="relative mb-3 hidden sm:block">
      <p className="mb-1.5 px-1 text-[10px] uppercase tracking-wider text-mist-500">
        Board
      </p>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 text-left transition-colors hover:border-white/15 hover:bg-white/[0.05]"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <BoardsIcon className="h-4 w-4 shrink-0 text-aurora-300" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-mist-100">
          {label}
        </span>
        <ChevronDownIcon
          className={`h-3.5 w-3.5 shrink-0 text-mist-500 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute bottom-full left-0 right-0 z-40 mb-1 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-ink-900 py-1 shadow-xl"
        >
          <li role="option" aria-selected={!active}>
            <button
              type="button"
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                !active
                  ? "bg-aurora-400/10 text-aurora-300"
                  : "text-mist-200 hover:bg-white/5"
              }`}
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              <span>All boards</span>
              <span className="text-xs text-mist-500">{totalLeads}</span>
            </button>
          </li>
          {boards.map((b) => (
            <li key={b.id} role="option" aria-selected={active?.id === b.id}>
              <button
                type="button"
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                  active?.id === b.id
                    ? "bg-aurora-400/10 text-aurora-300"
                    : "text-mist-200 hover:bg-white/5"
                }`}
                onClick={() => {
                  onChange(b.id);
                  setOpen(false);
                }}
              >
                <span className="truncate">
                  {b.name}
                  {b.isDefault ? (
                    <span className="ml-1.5 text-[10px] text-mist-500">Default</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs text-mist-500">{b.leadCount}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
