"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { BoardSummary } from "@/lib/types";
import { BoardsIcon, ChevronDownIcon } from "@/components/icons";
import { readMigratedKey } from "@/lib/browser-storage";
import { loadOutreachProfiles } from "@/lib/sender-profile";
import { Modal } from "@/components/ui/Modal";

const STORAGE_KEY = "hermes_active_board";
const STORAGE_LEGACY = ["leadify_active_board", "lodestar_active_board"];

export function loadStoredBoardFilter(): string {
  if (typeof window === "undefined") return "";
  const v = readMigratedKey(STORAGE_KEY, STORAGE_LEGACY) || "";
  // Legacy "all" is no longer a valid selection — force a single board.
  return v === "all" ? "" : v;
}

export function storeBoardFilter(id: string): void {
  if (id === "all") {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, id);
}

/**
 * Compact board picker above the account card — always one board (no "All").
 * Selecting a board activates its linked outreach profile (StudioShell).
 */
export function BoardPicker({
  boards,
  activeBoardId,
  onChange,
}: {
  boards: BoardSummary[];
  activeBoardId: string | null;
  onChange: (boardId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const active =
    activeBoardId && boards.find((b) => b.id === activeBoardId)
      ? boards.find((b) => b.id === activeBoardId)!
      : boards[0] ?? null;
  const label = active ? active.name : "Select board";
  const profileName = (profileId: string | null | undefined) => {
    if (!profileId) return null;
    const p = loadOutreachProfiles().profiles.find((x) => x.id === profileId);
    return p?.name?.trim() || null;
  };

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
    <div ref={wrapRef} className="relative mb-1">
      <p className="mb-1 px-1 text-[10px] uppercase tracking-wider text-mist-500">
        Board
      </p>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-1.5 text-left transition-colors hover:border-white/15 hover:bg-white/[0.05]"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <BoardsIcon className="h-4 w-4 shrink-0 text-aurora-300" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-mist-100">
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
          {boards.length === 0 ? (
            <li className="px-3 py-2 text-sm text-mist-500">No boards yet</li>
          ) : (
            boards.map((b) => (
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
                  <span className="min-w-0 truncate">
                    {b.name}
                    {b.shared ? (
                      <span className="ml-1.5 text-[10px] text-amber-400">Shared</span>
                    ) : null}
                    {profileName(b.outreachProfileId) ? (
                      <span className="ml-1.5 text-[10px] text-mist-500">
                        · {profileName(b.outreachProfileId)}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs text-mist-500">{b.leadCount}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

/** Icon-rail board switcher for narrow viewports (opens a sheet). */
export function MobileBoardButton({
  boards,
  activeBoardId,
  onChange,
}: {
  boards: BoardSummary[];
  activeBoardId: string | null;
  onChange: (boardId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const active =
    activeBoardId && boards.find((b) => b.id === activeBoardId)
      ? boards.find((b) => b.id === activeBoardId)!
      : boards[0] ?? null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-white/8 bg-white/[0.03] text-aurora-300 transition-colors hover:border-white/15 hover:bg-white/[0.05]"
        aria-label={active ? `Board: ${active.name}` : "Select board"}
        title={active?.name ?? "Select board"}
      >
        <BoardsIcon className="h-5 w-5" />
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Board"
        titleId={titleId}
        className="max-w-sm"
      >
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {boards.length === 0 ? (
            <li className="px-1 py-2 text-sm text-mist-500">No boards yet</li>
          ) : (
            boards.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm ${
                    active?.id === b.id
                      ? "bg-aurora-400/10 text-aurora-300"
                      : "text-mist-200 hover:bg-white/5"
                  }`}
                  onClick={() => {
                    onChange(b.id);
                    setOpen(false);
                  }}
                >
                  <span className="min-w-0 truncate">{b.name}</span>
                  <span className="shrink-0 text-xs text-mist-500">{b.leadCount}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </Modal>
    </>
  );
}
