"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { api, QuotaExceededError, type BoardResponse } from "@/lib/client-api";
import type { LeadWithOutreach, PlanId } from "@/lib/types";
import { SearchPanel, type SearchValues } from "./SearchPanel";
import { LeadCard } from "./LeadCard";
import { LeadTable } from "./LeadTable";
import { LeadDrawer } from "./LeadDrawer";
import { UpgradeModal } from "./UpgradeModal";
import { Spinner } from "@/components/ui";
import { ArrowIcon, CheckIcon, SparkIcon } from "@/components/icons";

type Toast = { id: number; kind: "ok" | "err"; text: string };
type UpgradePrompt = { kind: "leads" | "sends"; planId: PlanId };

export function Studio() {
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"board" | "queue">("board");
  const [layout, setLayout] = useState<"cards" | "table">("cards");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [upgrade, setUpgrade] = useState<UpgradePrompt | null>(null);

  const toast = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  // Quota rejections (402) surface an upgrade modal instead of a plain error.
  const handleError = useCallback(
    (e: unknown) => {
      if (e instanceof QuotaExceededError) {
        setUpgrade({ kind: e.kind, planId: e.planId });
      } else {
        toast("err", (e as Error).message);
      }
    },
    [toast],
  );

  const refresh = useCallback(async () => {
    const data = await api.board();
    setBoard(data);
    return data;
  }, []);

  useEffect(() => {
    refresh()
      .catch((e) => toast("err", e.message))
      .finally(() => setLoading(false));
  }, [refresh, toast]);

  // Celebrate a completed Stripe upgrade (success_url = /app?upgraded=1).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("upgraded") === "1") {
      toast("ok", "Upgrade complete — your new plan is active.");
      window.history.replaceState({}, "", "/app");
    }
  }, [toast]);

  const runSearch = async (v: SearchValues) => {
    setRunning(true);
    try {
      await api.createRun({
        niche: v.niche,
        location: v.location,
        offerNotes: v.offerNotes,
        searchStrategy: v.searchStrategy,
      });
      const data = await refresh();
      const n = data.leads.length;
      toast(
        "ok",
        `${data.run?.mode === "live" ? "Live search" : "Demo search"} complete — ${n} lead${n === 1 ? "" : "s"} charted.`,
      );
      setView("board");
    } catch (e) {
      handleError(e);
    } finally {
      setRunning(false);
    }
  };

  const patchLeadLocal = (leadId: string, next: Partial<LeadWithOutreach>) => {
    setBoard((b) =>
      b ? { ...b, leads: b.leads.map((l) => (l.id === leadId ? { ...l, ...next } : l)) } : b,
    );
  };

  const onDraft = async (leadId: string) => {
    try {
      const { outreach } = await api.draft(leadId);
      patchLeadLocal(leadId, { outreach, status: "queued" });
      toast("ok", "Draft written. Review before approving.");
    } catch (e) {
      toast("err", (e as Error).message);
    }
  };

  const findLeadByOutreach = (outreachId: string) =>
    board?.leads.find((l) => l.outreach?.id === outreachId);

  const onSaveDraft = async (
    outreachId: string,
    patch: { subject: string; body: string; toEmail: string | null },
  ) => {
    try {
      const { outreach } = await api.updateOutreach(outreachId, patch);
      const lead = findLeadByOutreach(outreachId);
      if (lead) patchLeadLocal(lead.id, { outreach });
      toast("ok", "Edits saved.");
    } catch (e) {
      toast("err", (e as Error).message);
    }
  };

  const onDecide = async (outreachId: string, decision: "approved" | "rejected") => {
    try {
      const { outreach } = await api.updateOutreach(outreachId, { decision });
      const lead = findLeadByOutreach(outreachId);
      if (lead) {
        patchLeadLocal(lead.id, {
          outreach,
          status: decision === "approved" ? "approved" : "rejected",
        });
      }
      toast("ok", decision === "approved" ? "Approved — ready to send." : "Rejected.");
    } catch (e) {
      toast("err", (e as Error).message);
    }
  };

  const onSend = async (outreachId: string) => {
    try {
      await api.send(outreachId);
      await refresh();
      toast("ok", board?.capabilities.canSendEmail ? "Email sent." : "Sent in demo mode (not delivered).");
    } catch (e) {
      handleError(e);
    }
  };

  const selected = board?.leads.find((l) => l.id === selectedId) ?? null;

  const queue = useMemo(
    () => board?.leads.filter((l) => ["queued", "approved", "sent", "failed"].includes(l.status)) ?? [],
    [board],
  );
  const approvedCount = queue.filter((l) => l.status === "approved").length;

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Spinner className="h-8 w-8 text-aurora-400" />
      </div>
    );
  }

  const hasLeads = (board?.leads.length ?? 0) > 0;

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      {/* Heading + mode */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">Lead studio</h1>
          <p className="mt-1 text-mist-500">
            {hasLeads
              ? `${board!.leads.length} prospects${board!.run?.niche ? ` for “${board!.run.niche}”` : ""}`
              : "Chart your first search to fill the board."}
          </p>
        </div>
        {board && <ModeBanner board={board} />}
      </div>

      {/* Search */}
      <div className="mb-8">
        <SearchPanel onSearch={runSearch} running={running} compact={hasLeads} />
      </div>

      {hasLeads && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ViewTab active={view === "board"} onClick={() => setView("board")}>
              Board
            </ViewTab>
            <ViewTab active={view === "queue"} onClick={() => setView("queue")}>
              Approval queue
              {queue.length > 0 && (
                <span className="ml-2 rounded-full bg-amber-400/20 px-1.5 text-xs text-amber-300">
                  {queue.length}
                </span>
              )}
            </ViewTab>
          </div>
          {view === "board" && (
            <div className="glass inline-flex items-center rounded-full p-1 text-sm">
              <LayoutToggle active={layout === "cards"} onClick={() => setLayout("cards")}>
                Cards
              </LayoutToggle>
              <LayoutToggle active={layout === "table"} onClick={() => setLayout("table")}>
                Table
              </LayoutToggle>
            </div>
          )}
        </div>
      )}

      {!hasLeads ? (
        <EmptyState />
      ) : view === "board" ? (
        layout === "cards" ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {board!.leads.map((lead, i) => (
              <LeadCard key={lead.id} lead={lead} index={i} onOpen={() => setSelectedId(lead.id)} />
            ))}
          </div>
        ) : (
          <LeadTable leads={board!.leads} onOpen={(id) => setSelectedId(id)} />
        )
      ) : (
        <QueueView
          leads={queue}
          approvedCount={approvedCount}
          onOpen={(id) => setSelectedId(id)}
          onSend={onSend}
          canSend={board!.capabilities.canSendEmail}
        />
      )}

      {selected && board && (
        <LeadDrawer
          lead={selected}
          capabilities={board.capabilities}
          onClose={() => setSelectedId(null)}
          onDraft={onDraft}
          onSaveDraft={onSaveDraft}
          onDecide={onDecide}
          onSend={onSend}
        />
      )}

      {upgrade && (
        <UpgradeModal
          kind={upgrade.kind}
          planId={upgrade.planId}
          onClose={() => setUpgrade(null)}
        />
      )}

      {/* Toasts */}
      <div className="pointer-events-none fixed bottom-6 right-6 z-[60] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-float-up pointer-events-auto flex items-center gap-2 rounded-xl px-4 py-3 text-sm shadow-xl ring-1 ${
              t.kind === "ok"
                ? "bg-ink-800 text-aurora-200 ring-aurora-400/25"
                : "bg-ink-800 text-rose-200 ring-rose-400/30"
            }`}
          >
            {t.kind === "ok" ? <CheckIcon className="h-4 w-4" /> : <span>⚠</span>}
            {t.text}
          </div>
        ))}
      </div>
    </main>
  );
}

function ModeBanner({ board }: { board: BoardResponse }) {
  const live = board.capabilities.canSearchLive;
  const ws = board.workspace;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {ws?.metered && (
        <span className="glass inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm">
          <span className="font-medium capitalize text-aurora-300">{ws.planId}</span>
          <span className="text-mist-500">·</span>
          <span className="text-mist-300 tabular-nums">
            {ws.leadsUsed}/{ws.leadsLimit} leads
          </span>
        </span>
      )}
      <div className="glass flex items-center gap-3 rounded-full px-4 py-2 text-sm">
        <span
          className={`h-2 w-2 rounded-full ${live ? "bg-aurora-400 pulse-ring" : "bg-amber-400"}`}
        />
        <span className="text-mist-300">
          {live ? "Live search enabled" : "Demo mode — sample leads"}
        </span>
        <span className="text-mist-500">·</span>
        <span className="text-mist-300">
          {board.capabilities.canSendEmail ? "Email live" : "Email demo"}
        </span>
      </div>
    </div>
  );
}

function ViewTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-medium transition-colors ${
        active ? "bg-white/10 text-mist-100" : "text-mist-500 hover:text-mist-300"
      }`}
    >
      {children}
    </button>
  );
}

function LayoutToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 font-medium transition-colors ${
        active ? "bg-white/10 text-mist-100" : "text-mist-500 hover:text-mist-300"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="relative overflow-hidden rounded-xl2 border border-white/10">
      <Image
        src="/images/empty-aurora.jpg"
        alt=""
        width={1600}
        height={900}
        className="h-72 w-full object-cover opacity-60 sm:h-96"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/60 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-8">
        <SparkIcon className="h-7 w-7 text-aurora-300" />
        <h2 className="mt-3 font-display text-2xl font-semibold">Your board is a clear sky</h2>
        <p className="mt-1 max-w-md text-mist-300">
          Describe an ideal customer above and Lodestar will chart a constellation
          of fit-scored prospects, ready for outreach.
        </p>
      </div>
    </div>
  );
}

function QueueView({
  leads,
  approvedCount,
  onOpen,
  onSend,
  canSend,
}: {
  leads: LeadWithOutreach[];
  approvedCount: number;
  onOpen: (id: string) => void;
  onSend: (outreachId: string) => Promise<void>;
  canSend: boolean;
}) {
  const [sendingAll, setSendingAll] = useState(false);

  const sendAllApproved = async () => {
    setSendingAll(true);
    // Sequential so per-lead status + rate limiting stay honest.
    for (const l of leads.filter((x) => x.status === "approved" && x.outreach)) {
      await onSend(l.outreach!.id);
    }
    setSendingAll(false);
  };

  if (leads.length === 0) {
    return (
      <div className="glass rounded-xl2 p-10 text-center text-mist-300">
        Nothing queued yet. Open a lead and draft outreach to start the approval flow.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {approvedCount > 0 && (
        <div className="glass flex items-center justify-between rounded-xl2 p-4">
          <p className="text-sm text-mist-300">
            <span className="font-semibold text-aurora-300">{approvedCount}</span> approved and
            ready to send.
          </p>
          <button
            onClick={sendAllApproved}
            disabled={sendingAll}
            className="inline-flex items-center gap-2 rounded-full bg-aurora-400 px-5 py-2.5 text-sm font-medium text-ink-950 transition-transform hover:scale-105 disabled:opacity-50"
          >
            {sendingAll ? <Spinner className="h-4 w-4" /> : <ArrowIcon className="h-4 w-4" />}
            {canSend ? "Send all approved" : "Send all (demo)"}
          </button>
        </div>
      )}
      <div className="overflow-hidden rounded-xl2 border border-white/10">
        {leads.map((l, i) => (
          <button
            key={l.id}
            onClick={() => onOpen(l.id)}
            className={`flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-white/5 ${
              i > 0 ? "border-t border-white/5" : ""
            }`}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{l.company}</p>
              <p className="truncate text-sm text-mist-500">
                {l.outreach?.subject ?? "—"}
              </p>
            </div>
            <span className="hidden text-sm text-mist-500 sm:block">
              {l.outreach?.toEmail ?? "no email"}
            </span>
            <StatusPillInline status={l.status} />
          </button>
        ))}
      </div>
    </div>
  );
}

function StatusPillInline({ status }: { status: LeadWithOutreach["status"] }) {
  const map: Record<string, string> = {
    queued: "text-amber-300",
    approved: "text-aurora-300",
    sent: "text-aurora-300",
    failed: "text-rose-300",
  };
  const label: Record<string, string> = {
    queued: "In review",
    approved: "Approved",
    sent: "Sent",
    failed: "Failed",
  };
  return <span className={`text-sm font-medium ${map[status] ?? "text-mist-500"}`}>{label[status] ?? status}</span>;
}
