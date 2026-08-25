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
      className={`inline-flex cursor-not-allowed [&>*]:pointer-events-none ${className ?? ""}`}
      title={hint}
    >
      {children}
    </span>
  );
}
