"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
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

/** Compact “someone else is editing” chip — pill on desktop, pulse-dot on phone. */
export function BoardLiveChip({
  holder,
  takingOver,
  onTakeControl,
  variant = "pill",
}: {
  holder: string | null;
  takingOver: boolean;
  onTakeControl: () => void;
  variant?: "pill" | "dot";
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
      className="pulse-ring h-2 w-2 shrink-0 rounded-full bg-aurora-400"
      aria-hidden
    />
  );
  if (variant === "dot") {
    return <LiveDot who={who} takingOver={takingOver} onTakeControl={onTakeControl} />;
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

function LiveDot({
  who,
  takingOver,
  onTakeControl,
}: {
  who: string;
  takingOver: boolean;
  onTakeControl: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${who} is editing this board`}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-11 w-8 items-center justify-center"
      >
        <span className="pulse-ring h-2.5 w-2.5 rounded-full bg-aurora-400" />
      </button>
      {open ? (
        <div
          role="dialog"
          className="absolute left-1/2 top-[calc(100%+0.35rem)] z-50 w-52 -translate-x-1/2 rounded-xl border border-white/10 bg-ink-900 p-3 shadow-xl"
        >
          <p className="text-xs text-mist-300">
            <span className="font-medium text-aurora-200">{who}</span> is
            editing this board.
          </p>
          <button
            type="button"
            onClick={() => {
              onTakeControl();
              setOpen(false);
            }}
            disabled={takingOver}
            className="mt-2 w-full rounded-full bg-aurora-400 px-3 py-1.5 text-xs font-medium text-on-accent disabled:opacity-50"
          >
            {takingOver ? "Taking…" : "Take control"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
