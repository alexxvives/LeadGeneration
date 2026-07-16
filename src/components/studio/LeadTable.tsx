"use client";

import { useEffect, useRef, useState } from "react";
import type { ContactMethod, CrmStage, LeadWithOutreach } from "@/lib/types";
import { CrmStagePill, FitMeter, crmStageLabel } from "@/components/ui";
import { MailIcon, PhoneIcon } from "@/components/icons";
import { displayWebsite } from "@/lib/website";
import { shortLocation } from "@/lib/search/enrich";

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
}: {
  leads: LeadWithOutreach[];
  onOpen: (id: string) => void;
  onMoveStage?: (
    leadId: string,
    stage: CrmStage,
    contactMethod?: ContactMethod | null,
  ) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

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
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => {
              const domain = displayWebsite(l.website);
              const loc = shortLocation(l.location) ?? "—";
              const stage = l.crmStage ?? "new";
              return (
                <tr
                  key={l.id}
                  onClick={() => onOpen(l.id)}
                  className="cursor-pointer border-b border-white/5 transition-colors last:border-0 hover:bg-white/5"
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
