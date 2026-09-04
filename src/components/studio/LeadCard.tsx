"use client";

import type { LeadWithOutreach } from "@/lib/types";
import { CrmStagePill } from "@/components/ui";
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
  // Stagger only the first row — animating 2k cards freezes the tab.
  const animateIn = index < 12;
  return (
    <button
      type="button"
      onClick={onOpen}
      style={animateIn ? { animationDelay: `${Math.min(index * 40, 400)}ms` } : undefined}
      className={`glass card-hover group flex w-full flex-col rounded-xl p-3 text-left ${
        animateIn ? "animate-float-up" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-display text-base font-semibold leading-tight">
            {lead.company || "Untitled"}
          </h3>
          {domain ? (
            <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-mist-500">
              <GlobeIcon className="h-3 w-3 shrink-0" />
              {domain}
            </span>
          ) : null}
        </div>
        <CrmStagePill stage={lead.crmStage ?? "new"} />
      </div>

      {lead.aboutBlurb ? (
        <p className="mt-2 line-clamp-2 text-xs leading-snug text-mist-300">
          {lead.aboutBlurb}
        </p>
      ) : null}

      {lead.tags.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {lead.tags.slice(0, 2).map((t) => (
            <span
              key={t}
              className="rounded-full px-1.5 py-0.5 text-[10px] ring-1 ring-inset pill-neutral"
            >
              {t}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-2 flex items-center gap-2.5 text-mist-500">
        <span
          className={`inline-flex items-center gap-1 text-[11px] tabular-nums ${
            lead.emails.length ? "text-aurora-300" : ""
          }`}
          title={lead.emails[0] ?? "No email found"}
        >
          <MailIcon className="h-3.5 w-3.5" />
          {lead.emails.length || "—"}
        </span>
        <span
          className={`inline-flex items-center gap-1 text-[11px] tabular-nums ${
            lead.phones.length ? "text-mist-300" : ""
          }`}
        >
          <PhoneIcon className="h-3.5 w-3.5" />
          {lead.phones.length || "—"}
        </span>
      </div>
    </button>
  );
}
