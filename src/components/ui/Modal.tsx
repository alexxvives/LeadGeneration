"use client";

import { useEffect, useId, useRef } from "react";
import { XIcon } from "@/components/icons";

/**
 * Accessible modal primitive (role=dialog, Escape, focus trap, backdrop).
 * Matches BoardAssignModal / AuthModal chrome.
 */
export function Modal({
  open,
  onClose,
  title,
  titleId: titleIdProp,
  children,
  dismissible = true,
  className = "max-w-md",
  showClose = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  titleId?: string;
  children: React.ReactNode;
  dismissible?: boolean;
  className?: string;
  showClose?: boolean;
}) {
  const autoId = useId();
  const titleId = titleIdProp ?? autoId;
  const panelRef = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    prevFocus.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusables = () =>
      panel
        ? Array.from(
            panel.querySelectorAll<HTMLElement>(
              'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
            ),
          ).filter((el) => !el.hasAttribute("disabled"))
        : [];
    const first = focusables()[0];
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissible) {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const list = focusables();
      if (list.length === 0) return;
      const firstEl = list[0]!;
      const lastEl = list[list.length - 1]!;
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prevFocus.current?.focus?.();
    };
  }, [open, dismissible, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
    >
      <button
        type="button"
        className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm"
        aria-label="Close"
        disabled={!dismissible}
        onClick={() => {
          if (dismissible) onClose();
        }}
      />
      <div
        ref={panelRef}
        className={`animate-float-up relative w-full rounded-xl2 border border-white/10 bg-ink-900 p-6 shadow-2xl ${className}`}
      >
        {(title || (showClose && dismissible)) && (
          <div className="mb-3 flex items-start justify-between gap-3">
            {title ? (
              <h2
                id={titleId}
                className="font-display text-xl font-semibold text-mist-100"
              >
                {title}
              </h2>
            ) : (
              <span />
            )}
            {showClose && dismissible ? (
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-mist-500 hover:bg-white/5 hover:text-mist-200"
                aria-label="Close"
              >
                <XIcon className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
