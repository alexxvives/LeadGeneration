"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

/** What a short-lived bulk lock is protecting. */
export type BulkLockKind = "import" | "search" | "delete";

function activity(kind: BulkLockKind | null | undefined): string {
  if (kind === "import") return "importing leads";
  if (kind === "search") return "running Find leads";
  if (kind === "delete") return "deleting leads";
  return "running a bulk action";
}

export function boardLockHint(
  holder: string | null | undefined,
  kind?: BulkLockKind | null,
): string {
  const who = holder?.trim() || "Someone else";
  return `${who} is ${activity(kind)}. Import, Find leads, bulk delete and draft-all are paused until it finishes.`;
}

const BoardLockUiContext = createContext<{
  /** True only while another user is running an import / search / bulk delete. */
  bulkLocked: boolean;
  holder: string | null;
  kind: BulkLockKind | null;
  hint: string;
}>({ bulkLocked: false, holder: null, kind: null, hint: boardLockHint(null) });

export function BoardLockUiProvider({
  locked,
  holder,
  kind,
  children,
}: {
  locked: boolean;
  holder: string | null;
  kind: BulkLockKind | null;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({ bulkLocked: locked, holder, kind, hint: boardLockHint(holder, kind) }),
    [locked, holder, kind],
  );
  return <BoardLockUiContext.Provider value={value}>{children}</BoardLockUiContext.Provider>;
}

export function useBoardLockUi() {
  return useContext(BoardLockUiContext);
}

/**
 * Wraps a bulk control. Native `disabled` controls don't fire hover, so the
 * title lives on a wrapper while the bulk lock is held by someone else.
 */
export function BulkLockable({ className, children }: { className?: string; children: ReactNode }) {
  const { bulkLocked, hint } = useBoardLockUi();
  if (!bulkLocked) return <>{children}</>;
  return (
    <span
      className={`cursor-not-allowed [&>*]:pointer-events-none ${className ?? "inline-flex"}`}
      title={hint}
    >
      {children}
    </span>
  );
}

/** “Ona is importing…” notice shown while another user's bulk action runs. */
export function BulkActivityChip({
  holder,
  kind,
}: {
  holder: string | null;
  kind: BulkLockKind | null;
}) {
  const who = holder?.trim() || "Someone else";
  const label = `${who} is ${activity(kind)}…`;
  return (
    <span
      role="status"
      title={boardLockHint(holder, kind)}
      className="inline-flex max-w-full items-center gap-2 rounded-full border border-aurora-400/20 bg-aurora-400/10 px-2.5 py-1 text-xs text-mist-200"
    >
      <span className="pulse-ring h-2 w-2 shrink-0 rounded-full bg-aurora-400" aria-hidden />
      <span className="truncate">{label}</span>
    </span>
  );
}
