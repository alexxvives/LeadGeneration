"use client";

/** "Deleted by Ona just now" banner (Round 9). */
export function DeletedNotice({
  text,
  actionLabel,
  onAction,
  onDismiss,
  className = "",
}: {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={`flex flex-wrap items-center gap-3 rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300 ${className}`}
    >
      <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-rose-300">
        Deleted
      </span>
      <span className="min-w-0 flex-1">{text}</span>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="rounded-full bg-rose-500/20 px-3 py-1 text-xs font-medium text-rose-200 hover:bg-rose-500/30"
        >
          {actionLabel}
        </button>
      ) : null}
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="rounded-full px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/20"
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}
