"use client";

import type { LeadWithOutreach } from "@/lib/types";
import { FitMeter, StatusPill } from "@/components/ui";
import { MailIcon, PhoneIcon } from "@/components/icons";

export function LeadTable({
  leads,
  onOpen,
}: {
  leads: LeadWithOutreach[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl2 border border-white/10">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
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
              const domain = l.website?.replace(/^https?:\/\//, "").replace(/\/$/, "");
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
                  <td className="px-5 py-3.5 text-mist-300">{l.location ?? "—"}</td>
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
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <StatusPill status={l.status} />
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
