"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ContactMethod, CrmStage, LeadWithOutreach } from "@/lib/types";
import { CrmStagePill, FitMeter, StatusPill, crmStageLabel } from "@/components/ui";
import { Select } from "@/components/ui/Select";
import { CheckIcon, MailIcon, PhoneIcon, TrashIcon, XIcon } from "@/components/icons";
import { displayWebsite } from "@/lib/website";
import { shortLocation } from "@/lib/format-location";
import { useLeadColumnState } from "@/components/studio/LeadColumnsMenu";

const STAGE_OPTIONS: CrmStage[] = [
  "new",
  "contacted",
  "in_conversation",
  "closed",
  "not_interested",
];

/** Pipeline priority (not alphabetical): Closed → In convo → Contacted → New → Not interested. */
const STAGE_ORDER: Record<CrmStage, number> = {
  closed: 0,
  in_conversation: 1,
  contacted: 2,
  new: 3,
  not_interested: 4,
};

type SortKey = "company" | "location" | "contact" | "fit" | "status" | "companyType";

export function LeadTable({
  leads,
  statusFilter,
  onStatusFilterChange,
  onOpen,
  onMoveStage,
  onUpdateLead,
  onDeleteLead,
  onDeleteLeads,
  editLocked = false,
}: {
  leads: LeadWithOutreach[];
  /** Already filtered by Studio; used for header filter menu sync. */
  statusFilter: CrmStage | "all";
  onStatusFilterChange: (v: CrmStage | "all") => void;
  onOpen: (id: string) => void;
  onMoveStage?: (
    leadId: string,
    stage: CrmStage,
    contactMethod?: ContactMethod | null,
  ) => void;
  onUpdateLead?: (
    leadId: string,
    patch: {
      notes?: string | null;
      companyType?: string | null;
      customFields?: Record<string, string>;
    },
  ) => void;
  onDeleteLead?: (leadId: string) => void;
  /** Bulk delete — preferred when selecting multiple. */
  onDeleteLeads?: (leadIds: string[]) => void | Promise<void>;
  /** Soft lock — view OK, edits disabled. */
  editLocked?: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [pipelineMenuOpen, setPipelineMenuOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "fit",
    dir: "desc",
  });
  const menuRef = useRef<HTMLDivElement | null>(null);
  const pipelineMenuRef = useRef<HTMLDivElement | null>(null);
  const { customCols, vis } = useLeadColumnState();
  const visibleCustom = customCols.filter((c) => !!vis.custom[c.id]);
  const canDelete = Boolean(onDeleteLead || onDeleteLeads) && !editLocked;

  const sortedLeads = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...leads].sort((a, b) => {
      let cmp = 0;
      switch (sort.key) {
        case "company":
          cmp = a.company.localeCompare(b.company, undefined, { sensitivity: "base" });
          break;
        case "location":
          cmp = (a.location ?? "").localeCompare(b.location ?? "", undefined, {
            sensitivity: "base",
          });
          break;
        case "contact":
          cmp = (a.emails[0] ?? "").localeCompare(b.emails[0] ?? "", undefined, {
            sensitivity: "base",
          });
          break;
        case "fit":
          cmp = a.fitScore - b.fitScore;
          break;
        case "companyType":
          cmp = (a.companyType ?? "").localeCompare(b.companyType ?? "", undefined, {
            sensitivity: "base",
          });
          break;
        case "status":
          cmp =
            (STAGE_ORDER[a.crmStage ?? "new"] ?? 0) -
            (STAGE_ORDER[b.crmStage ?? "new"] ?? 0);
          break;
      }
      return cmp * dir;
    });
  }, [leads, sort]);

  const allSelected =
    sortedLeads.length > 0 && selected.size === sortedLeads.length;
  const someSelected = selected.size > 0 && !allSelected;

  const toggleSort = (key: SortKey) => {
    setSort((prev) => {
      if (prev.key === key) {
        return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      const dir = key === "fit" ? "desc" : "asc";
      return { key, dir };
    });
  };

  const sortMark = (key: SortKey) =>
    sort.key === key ? (sort.dir === "asc" ? " ↑" : " ↓") : "";

  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(leads.map((l) => l.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (ids.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [leads]);

  useEffect(() => {
    if (!openId && !pipelineMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenId(null);
      }
      if (
        pipelineMenuRef.current &&
        !pipelineMenuRef.current.contains(e.target as Node)
      ) {
        setPipelineMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [openId, pipelineMenuOpen]);

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(sortedLeads.map((l) => l.id)));
  };

  const runBulkDelete = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setDeleting(true);
    try {
      if (onDeleteLeads) await onDeleteLeads(ids);
      else if (onDeleteLead) {
        for (const id of ids) onDeleteLead(id);
      }
      setSelected(new Set());
      setConfirmBulk(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="relative flex max-h-[calc(100dvh-11rem)] flex-col overflow-hidden rounded-xl2 border border-white/10">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/5 px-3 py-2">
        {canDelete && selected.size === 0 ? (
          <p className="text-[11px] text-mist-500">Select rows to delete</p>
        ) : (
          <p className="text-[11px] text-mist-500">
            {leads.length} lead{leads.length === 1 ? "" : "s"}
            {statusFilter !== "all" ? ` · ${crmStageLabel(statusFilter)}` : ""}
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="sticky top-0 z-10 bg-ink-950/95 backdrop-blur-sm">
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-widest text-mist-500">
              {canDelete ? (
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={toggleAll}
                    aria-label={allSelected ? "Deselect all leads" : "Select all leads"}
                    className="rounded border-white/20 bg-ink-900 text-aurora-400 focus:ring-aurora-400/40"
                  />
                </th>
              ) : null}
              <th className="px-5 py-3 font-medium">
                <button
                  type="button"
                  onClick={() => toggleSort("company")}
                  className="inline-flex items-center gap-0.5 uppercase tracking-widest text-mist-500 hover:text-mist-200"
                >
                  Company{sortMark("company")}
                </button>
              </th>
              <th className="px-5 py-3 font-medium">
                <button
                  type="button"
                  onClick={() => toggleSort("companyType")}
                  className="inline-flex items-center gap-0.5 uppercase tracking-widest text-mist-500 hover:text-mist-200"
                >
                  Type{sortMark("companyType")}
                </button>
              </th>
              <th className="px-5 py-3 font-medium">
                <button
                  type="button"
                  onClick={() => toggleSort("location")}
                  className="inline-flex items-center gap-0.5 uppercase tracking-widest text-mist-500 hover:text-mist-200"
                >
                  Location{sortMark("location")}
                </button>
              </th>
              <th className="px-5 py-3 font-medium">
                <button
                  type="button"
                  onClick={() => toggleSort("contact")}
                  className="inline-flex items-center gap-0.5 uppercase tracking-widest text-mist-500 hover:text-mist-200"
                >
                  Contact{sortMark("contact")}
                </button>
              </th>
              <th className="px-5 py-3 font-medium">
                <button
                  type="button"
                  onClick={() => toggleSort("fit")}
                  className="inline-flex items-center gap-0.5 uppercase tracking-widest text-mist-500 hover:text-mist-200"
                >
                  Fit{sortMark("fit")}
                </button>
              </th>
              <th className="relative px-5 py-3 font-medium">
                <div ref={pipelineMenuRef} className="relative inline-block">
                  <button
                    type="button"
                    onClick={() => setPipelineMenuOpen((o) => !o)}
                    className="inline-flex items-center gap-0.5 uppercase tracking-widest text-mist-500 hover:text-mist-200"
                    aria-haspopup="menu"
                    aria-expanded={pipelineMenuOpen}
                    title="Sort or filter by pipeline"
                  >
                    Pipeline{sortMark("status")}
                    <span className="ml-0.5 text-[10px] opacity-70">▾</span>
                  </button>
                  {pipelineMenuOpen ? (
                    <div
                      role="menu"
                      className="absolute left-0 z-30 mt-1 min-w-[11rem] overflow-hidden rounded-xl border border-white/10 bg-ink-900 py-1 shadow-xl"
                    >
                      <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-mist-500">
                        Sort
                      </p>
                      <button
                        type="button"
                        role="menuitem"
                        className="block w-full px-3 py-1.5 text-left text-xs text-mist-200 hover:bg-white/5"
                        onClick={() => {
                          setSort({ key: "status", dir: "asc" });
                          setPipelineMenuOpen(false);
                        }}
                      >
                        Closed → New
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="block w-full px-3 py-1.5 text-left text-xs text-mist-200 hover:bg-white/5"
                        onClick={() => {
                          setSort({ key: "status", dir: "desc" });
                          setPipelineMenuOpen(false);
                        }}
                      >
                        New → Closed
                      </button>
                      <div className="my-1 border-t border-white/5" />
                      <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-mist-500">
                        Filter
                      </p>
                      <button
                        type="button"
                        role="menuitem"
                        className={`block w-full px-3 py-1.5 text-left text-xs hover:bg-white/5 ${
                          statusFilter === "all"
                            ? "font-medium text-aurora-300"
                            : "text-mist-200"
                        }`}
                        onClick={() => {
                          onStatusFilterChange("all");
                          setPipelineMenuOpen(false);
                        }}
                      >
                        All stages
                      </button>
                      {STAGE_OPTIONS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          role="menuitem"
                          className={`block w-full px-3 py-1.5 text-left text-xs hover:bg-white/5 ${
                            statusFilter === s
                              ? "font-medium text-aurora-300"
                              : "text-mist-200"
                          }`}
                          onClick={() => {
                            onStatusFilterChange(s);
                            setPipelineMenuOpen(false);
                          }}
                        >
                          {crmStageLabel(s)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </th>
              <th className="px-5 py-3 font-medium uppercase tracking-widest">
                Email
              </th>
              <th className="px-5 py-3 font-medium">Notes</th>
              {visibleCustom.map((c) => (
                <th key={c.id} className="px-5 py-3 font-medium">
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedLeads.map((l) => {
              const domain = displayWebsite(l.website);
              const loc = shortLocation(l.location) ?? "—";
              const stage = l.crmStage ?? "new";
              const fields = l.customFields ?? {};
              const isChecked = selected.has(l.id);
              return (
                <tr
                  key={l.id}
                  onClick={() => onOpen(l.id)}
                  className={`group cursor-pointer border-b border-white/10 transition-colors last:border-0 hover:bg-white/5 ${
                    isChecked ? "bg-aurora-400/[0.04]" : ""
                  }`}
                >
                  {canDelete ? (
                    <td
                      className="px-3 py-3.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleOne(l.id)}
                        aria-label={`Select ${l.company}`}
                        className="rounded border-white/20 bg-ink-900 text-aurora-400 focus:ring-aurora-400/40"
                      />
                    </td>
                  ) : null}
                  <td className="max-w-[14rem] px-5 py-3.5">
                    <p className="truncate font-medium text-mist-100" title={l.company}>
                      {l.company}
                    </p>
                    {domain && (
                      <p className="truncate text-xs text-mist-500" title={domain}>
                        {domain}
                      </p>
                    )}
                  </td>
                  <td
                    className="max-w-[8rem] px-5 py-3.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {editLocked ? (
                      <span className="truncate text-xs text-mist-300" title={l.companyType ?? undefined}>
                        {l.companyType?.trim() || "—"}
                      </span>
                    ) : (
                      <input
                        defaultValue={l.companyType ?? ""}
                        key={`${l.id}-type-${l.companyType ?? ""}`}
                        onBlur={(e) => {
                          const next = e.target.value.trim();
                          if (next !== (l.companyType ?? "")) {
                            onUpdateLead?.(l.id, { companyType: next || null });
                          }
                        }}
                        placeholder="—"
                        className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-xs text-mist-200 outline-none placeholder:text-mist-600 hover:border-white/10 focus:border-aurora-400/50 focus:bg-ink-950/40"
                      />
                    )}
                  </td>
                  <td className="max-w-[12rem] px-5 py-3.5 text-mist-300">
                    <span className="line-clamp-1" title={l.location ?? undefined}>
                      {loc}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex flex-col gap-1 text-xs">
                      <span
                        className={`inline-flex min-w-0 items-center gap-1 ${
                          l.emails.length ? "text-aurora-300" : "text-mist-500"
                        }`}
                      >
                        <MailIcon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{l.emails[0] ?? "—"}</span>
                      </span>
                      <span
                        className={`inline-flex min-w-0 items-center gap-1 ${
                          l.phones.length ? "text-mist-300" : "text-mist-500"
                        }`}
                      >
                        <PhoneIcon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{l.phones[0] ?? "—"}</span>
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <FitMeter score={l.fitScore} />
                  </td>
                  <td className="relative px-5 py-3.5 whitespace-nowrap">
                    {onMoveStage && !editLocked ? (
                      <div
                        ref={openId === l.id ? menuRef : undefined}
                        className="relative inline-block"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setOpenId((id) => (id === l.id ? null : l.id))
                          }
                          className="rounded-full transition-transform hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-aurora-400/50"
                          aria-haspopup="listbox"
                          aria-expanded={openId === l.id}
                          title="Change stage"
                        >
                          <CrmStagePill stage={stage} />
                        </button>
                        {openId === l.id ? (
                          <ul
                            role="listbox"
                            className="absolute right-0 z-20 mt-1 min-w-[10rem] overflow-hidden rounded-xl border border-white/10 bg-ink-900 py-1 shadow-xl"
                          >
                            {STAGE_OPTIONS.map((s) => (
                              <li key={s}>
                                <button
                                  type="button"
                                  role="option"
                                  aria-selected={s === stage}
                                  className={`block w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-white/5 ${
                                    s === stage
                                      ? "font-medium text-aurora-300"
                                      : "text-mist-200"
                                  }`}
                                  onClick={() => {
                                    setOpenId(null);
                                    if (s !== stage) onMoveStage(l.id, s);
                                  }}
                                >
                                  {crmStageLabel(s)}
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ) : (
                      <CrmStagePill stage={stage} />
                    )}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <StatusPill
                      status={l.outreach?.status ?? l.status}
                    />
                  </td>
                  <td
                    className="max-w-[12rem] px-5 py-3.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {editLocked ? (
                      <span className="truncate text-sm text-mist-300">
                        {l.notes?.trim() || "—"}
                      </span>
                    ) : (
                      <input
                        defaultValue={l.notes ?? ""}
                        key={`${l.id}-notes-${l.notes ?? ""}`}
                        onBlur={(e) => {
                          const next = e.target.value;
                          if (next !== (l.notes ?? "")) {
                            onUpdateLead?.(l.id, { notes: next || null });
                          }
                        }}
                        placeholder="—"
                        className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm text-mist-200 outline-none placeholder:text-mist-600 hover:border-white/10 focus:border-aurora-400/50 focus:bg-ink-950/40"
                      />
                    )}
                  </td>
                  {visibleCustom.map((c) => (
                    <td
                      key={c.id}
                      className="px-5 py-3.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {editLocked ? (
                        <span className="text-sm text-mist-300">
                          {fields[c.id] || "—"}
                        </span>
                      ) : c.type === "select" ? (
                        <Select
                          value={fields[c.id] ?? ""}
                          onChange={(e) =>
                            onUpdateLead?.(l.id, {
                              customFields: { ...fields, [c.id]: e.target.value },
                            })
                          }
                          className="w-full min-w-[6rem] py-1 text-xs"
                        >
                          <option value="">—</option>
                          {(c.options ?? []).map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <input
                          type={c.type === "number" ? "number" : "text"}
                          defaultValue={fields[c.id] ?? ""}
                          key={`${l.id}-${c.id}-${fields[c.id] ?? ""}`}
                          onBlur={(e) => {
                            const next = e.target.value;
                            if (next !== (fields[c.id] ?? "")) {
                              onUpdateLead?.(l.id, {
                                customFields: { ...fields, [c.id]: next },
                              });
                            }
                          }}
                          placeholder="—"
                          className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm text-mist-200 outline-none placeholder:text-mist-600 hover:border-white/10 focus:border-aurora-400/50 focus:bg-ink-950/40"
                        />
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected.size > 0 ? (
        <div className="absolute bottom-4 left-1/2 z-20 flex w-[min(100%-2rem,28rem)] -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-ink-900/95 px-3 py-2 shadow-2xl backdrop-blur-xl animate-float-up">
          {confirmBulk ? (
            <>
              <p className="min-w-0 flex-1 truncate px-1 text-xs text-mist-200">
                Delete{" "}
                <span className="font-semibold text-rose-300">{selected.size}</span>{" "}
                lead{selected.size === 1 ? "" : "s"}? Can&apos;t undo.
              </p>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void runBulkDelete()}
                className="inline-flex items-center gap-1 rounded-full bg-rose-400 px-3 py-1.5 text-xs font-medium text-on-accent disabled:opacity-50"
              >
                <CheckIcon className="h-3 w-3" />
                {deleting ? "Deleting…" : "Confirm"}
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => setConfirmBulk(false)}
                className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-mist-300 hover:bg-white/5"
              >
                Back
              </button>
            </>
          ) : (
            <>
              <p className="min-w-0 flex-1 truncate px-1 text-xs text-mist-200">
                <span className="font-semibold text-aurora-300">{selected.size}</span>{" "}
                selected
              </p>
              <button
                type="button"
                onClick={() => setConfirmBulk(true)}
                className="inline-flex items-center gap-1 rounded-full bg-rose-400/90 px-3 py-1.5 text-xs font-medium text-on-accent hover:bg-rose-400"
              >
                <TrashIcon className="h-3 w-3" />
                Delete
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelected(new Set());
                  setConfirmBulk(false);
                }}
                aria-label="Clear selection"
                className="rounded-full p-1.5 text-mist-500 hover:bg-white/5 hover:text-mist-200"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
