"use client";

import type { LeadWithOutreach } from "@/lib/types";
import { CrmStagePill, FitMeter } from "@/components/ui";
import { GlobeIcon, MailIcon, PhoneIcon } from "@/components/icons";
import { displayWebsite } from "@/lib/website";

export function LeadCard({
  lead,
  index,
  onOpen,
}: {
  lead: LeadWithOutreach;
  index: number;
  onOpen: () => void;
}) {
  const domain = displayWebsite(lead.website);
  return (
    <button
      onClick={onOpen}
      style={{ animationDelay: `${Math.min(index * 40, 400)}ms` }}
      className="glass card-hover animate-float-up group flex w-full flex-col rounded-xl2 p-5 text-left"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-display text-lg font-semibold leading-tight">
            {lead.company}
          </h3>
          {domain ? (
            <span className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-mist-500">
              <GlobeIcon className="h-3.5 w-3.5 shrink-0" />
              {domain}
            </span>
          ) : null}
        </div>
        <CrmStagePill stage={lead.crmStage ?? "new"} />
      </div>

      {lead.aboutBlurb && (
        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-mist-300">
          {lead.aboutBlurb}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-1.5">
        {lead.tags.slice(0, 3).map((t) => (
          <span
            key={t}
            className="rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset pill-neutral"
          >
            {t}
          </span>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3 text-mist-500">
        <span
          className={`inline-flex items-center gap-1 text-xs ${lead.emails.length ? "text-aurora-300" : ""}`}
          title={lead.emails[0] ?? "No email found"}
        >
          <MailIcon className="h-4 w-4" />
          {lead.emails.length || "—"}
        </span>
        <span
          className={`inline-flex items-center gap-1 text-xs ${lead.phones.length ? "text-mist-300" : ""}`}
        >
          <PhoneIcon className="h-4 w-4" />
          {lead.phones.length || "—"}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-4">
        <FitMeter score={lead.fitScore} />
        <span className="text-xs font-medium text-aurora-300 opacity-0 transition-opacity group-hover:opacity-100">
          Open →
        </span>
      </div>
    </button>
  );
}
