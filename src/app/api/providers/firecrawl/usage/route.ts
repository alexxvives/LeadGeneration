import { NextResponse } from "next/server";
import { env, getCapabilities } from "@/lib/config";
import { parseFirecrawlCredits } from "@/lib/search/firecrawl";

/**
 * Proxy Firecrawl team credit usage. Never exposes the API key — only remaining
 * credits (and plan allotment when the API returns it). Demo mode (no key)
 * returns { available: false }.
 *
 * Firecrawl bills in credits (search/scrape), not LLM tokens.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FirecrawlUsagePayload = {
  success?: boolean;
  data?: {
    remaining_credits?: unknown;
    remainingCredits?: unknown;
    plan_credits?: unknown;
    planCredits?: unknown;
    billing_period_start?: string | null;
    billing_period_end?: string | null;
  };
};

export async function GET() {
  const caps = getCapabilities();
  if (!caps.firecrawl) {
    return NextResponse.json({
      available: false,
      provider: "firecrawl" as const,
      remainingCredits: null,
      planCredits: null,
    });
  }

  try {
    const key = env.firecrawlKey();
    const urls = [
      "https://api.firecrawl.dev/v2/team/credit-usage",
      "https://api.firecrawl.dev/v1/team/credit-usage",
    ] as const;
    let lastError = "";
    for (const url of urls) {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        lastError = `Firecrawl usage unavailable (${res.status}): ${text.slice(0, 120)}`;
        continue;
      }
      const json = (await res.json()) as FirecrawlUsagePayload;
      const remaining =
        parseFirecrawlCredits(json.data?.remaining_credits) ??
        parseFirecrawlCredits(json.data?.remainingCredits);
      const plan =
        parseFirecrawlCredits(json.data?.plan_credits) ??
        parseFirecrawlCredits(json.data?.planCredits);
      if (remaining == null) {
        lastError = "Firecrawl usage payload had no remaining credits";
        continue;
      }
      return NextResponse.json({
        available: true,
        provider: "firecrawl" as const,
        remainingCredits: remaining,
        planCredits: plan,
      });
    }
    return NextResponse.json(
      {
        available: false,
        provider: "firecrawl" as const,
        remainingCredits: null,
        planCredits: null,
        error: lastError || "Firecrawl usage unavailable",
      },
      { status: 200 },
    );
  } catch (e) {
    return NextResponse.json({
      available: false,
      provider: "firecrawl" as const,
      remainingCredits: null,
      planCredits: null,
      error: e instanceof Error ? e.message : "Failed to fetch usage",
    });
  }
}
