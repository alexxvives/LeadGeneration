"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { WorkspaceSummary } from "@/lib/types";

/** Warn before the hard cap — first 402 should not be the first signal. */
export const QUOTA_WARN_RATIO = 0.8;

export type QuotaPressure = {
  leads: boolean;
  verifies: boolean;
  any: boolean;
};

export function quotaPressure(
  ws: WorkspaceSummary | null | undefined,
): QuotaPressure {
  const none = { leads: false, verifies: false, any: false };
  if (!ws?.metered) return none;
  const leads =
    ws.planId !== "insider" &&
    ws.leadsLimit > 0 &&
    ws.leadsUsed / ws.leadsLimit >= QUOTA_WARN_RATIO;
  const verifies =
    ws.verifiesLimit > 0 &&
    ws.verifiesUsed / ws.verifiesLimit >= QUOTA_WARN_RATIO;
  return { leads, verifies, any: leads || verifies };
}

const QuotaHintContext = createContext<{
  warn: boolean;
  setWarn: (next: boolean) => void;
}>({ warn: false, setWarn: () => {} });

export function QuotaHintProvider({ children }: { children: ReactNode }) {
  const [warn, setWarn] = useState(false);
  const value = useMemo(() => ({ warn, setWarn }), [warn]);
  return (
    <QuotaHintContext.Provider value={value}>{children}</QuotaHintContext.Provider>
  );
}

export function useQuotaHint() {
  return useContext(QuotaHintContext);
}
