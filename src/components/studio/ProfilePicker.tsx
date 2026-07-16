"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MailIcon, ChevronDownIcon } from "@/components/icons";
import {
  loadOutreachProfiles,
  setActiveOutreachProfile,
  type OutreachProfile,
} from "@/lib/sender-profile";

/**
 * Compact outreach-profile picker above the account card — mirrors BoardPicker.
 * Selection drives Search + Create draft (localStorage active profile).
 */
export function ProfilePicker({
  onChange,
}: {
  /** Called after the active profile changes (so Studio can refresh labels). */
  onChange?: (profile: OutreachProfile | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState<OutreachProfile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const refresh = () => {
    const store = loadOutreachProfiles();
    setProfiles(store.profiles);
    setActiveId(store.activeId);
  };

  useEffect(() => {
    refresh();
    const onStorage = (e: StorageEvent) => {
      if (e.key === "leadify_sender_profiles") refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const active =
    (activeId && profiles.find((p) => p.id === activeId)) || profiles[0] || null;
  const label = active?.name?.trim() || "No profile";

  return (
    <div ref={wrapRef} className="relative mb-3 hidden sm:block">
      <p className="mb-1.5 px-1 text-[10px] uppercase tracking-wider text-mist-500">
        Outreach profile
      </p>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 text-left transition-colors hover:border-white/15 hover:bg-white/[0.05]"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <MailIcon className="h-4 w-4 shrink-0 text-aurora-300" />
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
          {profiles.map((p) => (
            <li key={p.id} role="option" aria-selected={active?.id === p.id}>
              <button
                type="button"
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                  active?.id === p.id
                    ? "bg-aurora-400/10 text-aurora-300"
                    : "text-mist-200 hover:bg-white/5"
                }`}
                onClick={() => {
                  setActiveOutreachProfile(p.id);
                  setActiveId(p.id);
                  onChange?.(p);
                  setOpen(false);
                }}
              >
                <span className="truncate">{p.name}</span>
              </button>
            </li>
          ))}
          <li className="border-t border-white/5">
            <Link
              href="/app/settings"
              className="block px-3 py-2 text-sm text-aurora-300/90 hover:bg-white/5"
              onClick={() => setOpen(false)}
            >
              Edit profiles…
            </Link>
          </li>
        </ul>
      )}
    </div>
  );
}
