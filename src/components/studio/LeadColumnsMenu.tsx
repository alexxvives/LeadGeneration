"use client";

import { useEffect, useRef, useState } from "react";
import type { LeadColumnDef } from "@/lib/types";
import { Select } from "@/components/ui/Select";
import { ColumnsIcon, XIcon } from "@/components/icons";
import {
  loadColumnVisibility,
  loadLeadColumns,
  newColumnId,
  saveColumnVisibility,
  saveLeadColumns,
  type ColumnVisibility,
} from "@/lib/lead-columns";

const COLS_CHANGED = "hermes-lead-columns-changed";

export function notifyLeadColumnsChanged(): void {
  window.dispatchEvent(new Event(COLS_CHANGED));
}

export function useLeadColumnState(): {
  customCols: LeadColumnDef[];
  vis: ColumnVisibility;
  refresh: () => void;
} {
  const [customCols, setCustomCols] = useState<LeadColumnDef[]>([]);
  const [vis, setVis] = useState<ColumnVisibility>({ notes: false, custom: {} });

  const refresh = () => {
    setCustomCols(loadLeadColumns());
    setVis(loadColumnVisibility());
  };

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener(COLS_CHANGED, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(COLS_CHANGED, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  return { customCols, vis, refresh };
}

/** Columns picker — place on the same row as Table / Cards / Map. */
export function LeadColumnsMenu() {
  const [open, setOpen] = useState(false);
  const [customCols, setCustomCols] = useState<LeadColumnDef[]>([]);
  const [vis, setVis] = useState<ColumnVisibility>({ notes: false, custom: {} });
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<LeadColumnDef["type"]>("text");
  const [newOptions, setNewOptions] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setCustomCols(loadLeadColumns());
    setVis(loadColumnVisibility());
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setAdding(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function setNotesVisible(on: boolean) {
    const next = { ...vis, notes: on };
    setVis(next);
    saveColumnVisibility(next);
    notifyLeadColumnsChanged();
  }

  function setCustomVisible(id: string, on: boolean) {
    const next = { ...vis, custom: { ...vis.custom, [id]: on } };
    setVis(next);
    saveColumnVisibility(next);
    notifyLeadColumnsChanged();
  }

  function handleAddColumn() {
    const name = newName.trim();
    if (!name) return;
    const options =
      newType === "select"
        ? newOptions
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;
    if (newType === "select" && (!options || options.length === 0)) return;
    const col: LeadColumnDef = {
      id: newColumnId(),
      name,
      type: newType,
      options,
    };
    const nextCols = [...customCols, col];
    setCustomCols(nextCols);
    saveLeadColumns(nextCols);
    setCustomVisible(col.id, true);
    setNewName("");
    setNewOptions("");
    setNewType("text");
    setAdding(false);
    notifyLeadColumnsChanged();
  }

  function removeColumn(id: string) {
    const nextCols = customCols.filter((c) => c.id !== id);
    setCustomCols(nextCols);
    saveLeadColumns(nextCols);
    const rest = { ...vis.custom };
    delete rest[id];
    const nextVis = { ...vis, custom: rest };
    setVis(nextVis);
    saveColumnVisibility(nextVis);
    notifyLeadColumnsChanged();
  }

  return (
    <div ref={wrapRef} className="relative justify-self-end">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-ink-900/60 px-2.5 py-1.5 text-xs text-mist-300 transition-colors hover:border-white/20 hover:text-mist-100"
        aria-expanded={open}
      >
        <ColumnsIcon className="h-3.5 w-3.5" />
        Columns
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-1 w-72 overflow-hidden rounded-xl border border-white/10 bg-ink-900 py-2 shadow-xl">
          <p className="px-3 pb-1.5 text-[10px] uppercase tracking-wider text-mist-500">
            Show columns
          </p>
          <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-mist-200 hover:bg-white/5">
            <input
              type="checkbox"
              checked={vis.notes}
              onChange={(e) => setNotesVisible(e.target.checked)}
              className="rounded border-white/20"
            />
            Notes
          </label>
          {customCols.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-mist-200 hover:bg-white/5"
            >
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!vis.custom[c.id]}
                  onChange={(e) => setCustomVisible(c.id, e.target.checked)}
                  className="rounded border-white/20"
                />
                <span className="truncate">{c.name}</span>
                <span className="text-[10px] uppercase text-mist-500">{c.type}</span>
              </label>
              <button
                type="button"
                className="text-mist-500 hover:text-rose-300"
                title="Remove column"
                onClick={() => removeColumn(c.id)}
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <div className="mt-1 border-t border-white/5 px-3 pt-2">
            {adding ? (
              <div className="space-y-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Column name"
                  autoFocus
                  className="w-full rounded-lg border border-white/10 bg-ink-950/60 px-2.5 py-1.5 text-sm text-mist-100 outline-none focus:border-aurora-400/60"
                />
                <Select
                  value={newType}
                  onChange={(e) =>
                    setNewType(e.target.value as LeadColumnDef["type"])
                  }
                  className="w-full py-1.5 text-sm"
                >
                  <option value="text">Free text</option>
                  <option value="number">Number</option>
                  <option value="select">Dropdown</option>
                </Select>
                {newType === "select" ? (
                  <input
                    value={newOptions}
                    onChange={(e) => setNewOptions(e.target.value)}
                    placeholder="Options, comma-separated"
                    className="w-full rounded-lg border border-white/10 bg-ink-950/60 px-2.5 py-1.5 text-sm text-mist-100 outline-none focus:border-aurora-400/60"
                  />
                ) : null}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleAddColumn}
                    disabled={
                      !newName.trim() ||
                      (newType === "select" && !newOptions.trim())
                    }
                    className="rounded-full bg-aurora-400 px-3 py-1 text-xs font-medium text-on-accent disabled:opacity-40"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdding(false)}
                    className="rounded-full px-3 py-1 text-xs text-mist-400 hover:text-mist-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="text-xs font-medium text-aurora-300 hover:underline"
              >
                + Add column
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
