"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

export function boardLockHint(holder: string | null | undefined): string {
  const who = holder?.trim() || "Someone else";
  return `${who} is editing this board. Take control to make changes.`;
}

const BoardLockUiContext = createContext<{
  locked: boolean;
  holder: string | null;
  hint: string;
}>({ locked: false, holder: null, hint: boardLockHint(null) });

export function BoardLockUiProvider({
  locked,
  holder,
  children,
}: {
  locked: boolean;
  holder: string | null;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({
      locked,
      holder,
      hint: boardLockHint(holder),
    }),
    [locked, holder],
  );
  return (
    <BoardLockUiContext.Provider value={value}>
      {children}
    </BoardLockUiContext.Provider>
  );
}

export function useBoardLockUi() {
  return useContext(BoardLockUiContext);
}

/**
 * Native `disabled` controls don't fire hover, so the title lives on a
 * wrapper. Children should still be `disabled` for keyboard / AT.
 */
export function Lockable({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const { locked, hint } = useBoardLockUi();
  if (!locked) return <>{children}</>;
  return (
    <span
      className={`cursor-not-allowed [&>*]:pointer-events-none ${className ?? "inline-flex"}`}
      title={hint}
    >
      {children}
    </span>
  );
}

/** Compact “someone else is editing” chip — banner on phone, pill on desktop. */
export function BoardLiveChip({
  holder,
  takingOver,
  onTakeControl,
  variant = "pill",
}: {
  holder: string | null;
  takingOver: boolean;
  onTakeControl: () => void;
  variant?: "pill" | "bar";
}) {
  const who = holder?.trim() || "Someone else";
  const take = (
    <button
      type="button"
      onClick={onTakeControl}
      disabled={takingOver}
      aria-label={`Take control of this board from ${who}`}
      className="shrink-0 rounded-full bg-aurora-400 px-2.5 py-1 text-[11px] font-medium text-on-accent transition-colors hover:bg-aurora-300 disabled:opacity-50"
    >
      {takingOver ? "Taking…" : "Take"}
    </button>
  );
  const pulse = (
    <span
      className="pulse-ring h-1.5 w-1.5 shrink-0 rounded-full bg-aurora-400"
      aria-hidden
    />
  );
  if (variant === "bar") {
    return (
      <div className="flex w-full min-w-0 items-center gap-2 rounded-xl border border-aurora-400/20 bg-aurora-400/10 px-3 py-2">
        {pulse}
        <p className="min-w-0 flex-1 truncate text-xs text-mist-200">
          <span className="font-medium text-aurora-200">Live</span>
          <span className="text-mist-400"> · {who}</span>
        </p>
        {take}
      </div>
    );
  }
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-aurora-400/20 bg-aurora-400/10 py-1 pl-2.5 pr-1 text-xs text-mist-200">
      {pulse}
      <span className="font-medium text-aurora-200">Live</span>
      <span className="max-w-[7rem] truncate text-mist-400">{who}</span>
      {take}
    </span>
  );
}
