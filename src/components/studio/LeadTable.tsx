"use client";

import { useEffect, useRef, useState } from "react";
import type { ContactMethod, CrmStage, LeadWithOutreach } from "@/lib/types";
import { CrmStagePill, FitMeter, crmStageLabel } from "@/components/ui";
import { Select } from "@/components/ui/Select";
import { MailIcon, PhoneIcon, TrashIcon } from "@/components/icons";
import { displayWebsite } from "@/lib/website";
import { shortLocation } from "@/lib/search/enrich";
import { useLeadColumnState } from "@/components/studio/LeadColumnsMenu";

const STAGE_OPTIONS: CrmStage[] = [
  "new",
  "contacted",
  "in_conversation",
  "closed",
  "not_interested",
  "discarded",
];

export function LeadTable({
  leads,
  onOpen,
  onMoveStage,
  onUpdateLead,
  onDeleteLead,
}: {
  leads: LeadWithOutreach[];
  onOpen: (id: string) => void;
  onMoveStage?: (
    leadId: string,
    stage: CrmStage,
    contactMethod?: ContactMethod | null,
  ) => void;
  onUpdateLead?: (
    leadId: string,
    patch: { notes?: string | null; customFields?: Record<string, string> },
  ) => void;
  onDeleteLead?: (leadId: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const { customCols, vis } = useLeadColumnState();
  const visibleCustom = customCols.filter((c) => !!vis.custom[c.id]);

  useEffect(() => {
    if (!openId) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenId(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [openId]);

  return (
    <div className="flex max-h-[calc(100dvh-11rem)] flex-col overflow-hidden rounded-xl2 border border-white/10">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="sticky top-0 z-10 bg-ink-950/95 backdrop-blur-sm">
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-widest text-mist-500">
              <th className="px-5 py-3 font-medium">Company</th>
              <th className="px-5 py-3 font-medium">Location</th>
              <th className="px-5 py-3 font-medium">Contact</th>
              <th className="px-5 py-3 font-medium">Fit</th>
              <th className="px-5 py-3 font-medium">Status</th>
              {vis.notes ? (
                <th className="px-5 py-3 font-medium">Notes</th>
              ) : null}
              {visibleCustom.map((c) => (
                <th key={c.id} className="px-5 py-3 font-medium">
                  {c.name}
                </th>
              ))}
              {onDeleteLead ? <th className="w-10 px-2 py-3" aria-label="Actions" /> : null}
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => {
              const domain = displayWebsite(l.website);
              const loc = shortLocation(l.location) ?? "—";
              const stage = l.crmStage ?? "new";
              const fields = l.customFields ?? {};
              return (
                <tr
                  key={l.id}
                  onClick={() => onOpen(l.id)}
                  className="group cursor-pointer border-b border-white/5 transition-colors last:border-0 hover:bg-white/5"
                >
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-mist-100">{l.company}</p>
                    {domain && <p className="text-xs text-mist-500">{domain}</p>}
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
                    {onMoveStage ? (
                      <div
                        ref={openId === l.id ? menuRef : undefined}
                        className="relative inline-block"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => setOpenId((id) => (id === l.id ? null : l.id))}
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
                  {vis.notes ? (
                    <td
                      className="max-w-[14rem] px-5 py-3.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        defaultValue={l.notes ?? ""}
                        key={`${l.id}-notes-${l.notes ?? ""}`}
                        onBlur={(e) => {
                          const next = e.target.value || null;
                          if (next !== (l.notes ?? null)) {
                            onUpdateLead?.(l.id, { notes: next });
                          }
                        }}
                        placeholder="—"
                        className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm text-mist-200 outline-none placeholder:text-mist-600 hover:border-white/10 focus:border-aurora-400/50 focus:bg-ink-950/40"
                      />
                    </td>
                  ) : null}
                  {visibleCustom.map((c) => (
                    <td
                      key={c.id}
                      className="max-w-[12rem] px-5 py-3.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {c.type === "select" ? (
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
                  {onDeleteLead ? (
                    <td
                      className="px-2 py-3.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        title="Delete lead"
                        onClick={() => {
                          if (
                            confirm(
                              `Delete ${l.company}? This cannot be undone.`,
                            )
                          ) {
                            onDeleteLead(l.id);
                          }
                        }}
                        className="rounded-lg p-1.5 text-mist-600 opacity-0 transition-opacity hover:bg-rose-400/10 hover:text-rose-300 group-hover:opacity-100 focus:opacity-100"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
