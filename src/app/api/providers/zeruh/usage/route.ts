import { NextResponse } from "next/server";
import { env, getCapabilities } from "@/lib/config";

/**
 * Proxy Zeruh account credits. Never exposes the API key — only remaining
 * permanent + recurring credits. Demo mode (no key) returns { available: false }.
 *
 * Zeruh: 1 credit = 1 email verification. Account endpoint:
 * https://api.zeruh.com/v1/account
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ZeruhAccountPayload = {
  success?: boolean;
  data?: {
    permanent_credits?: number;
    recurring_credits?: number;
  };
};

export async function GET() {
  const caps = getCapabilities();
  if (!caps.emailVerify) {
    return NextResponse.json({
      available: false,
      provider: "zeruh" as const,
      remainingCredits: null,
      permanentCredits: null,
      recurringCredits: null,
    });
  }

  const key = env.emailVerifyKey();
  if (!key) {
    return NextResponse.json({
      available: false,
      provider: "zeruh" as const,
      remainingCredits: null,
      permanentCredits: null,
      recurringCredits: null,
    });
  }

  try {
    const res = await fetch("https://api.zeruh.com/v1/account", {
      method: "GET",
      headers: {
        "X-Api-Key": key,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        {
          available: false,
          provider: "zeruh" as const,
          remainingCredits: null,
          permanentCredits: null,
          recurringCredits: null,
          error: `Zeruh usage unavailable (${res.status}): ${text.slice(0, 120)}`,
        },
        { status: 200 },
      );
    }
    const json = (await res.json()) as ZeruhAccountPayload;
    const permanent =
      typeof json.data?.permanent_credits === "number"
        ? json.data.permanent_credits
        : null;
    const recurring =
      typeof json.data?.recurring_credits === "number"
        ? json.data.recurring_credits
        : null;
    const remaining =
      permanent != null || recurring != null
        ? (permanent ?? 0) + (recurring ?? 0)
        : null;

    return NextResponse.json({
      available: remaining != null,
      provider: "zeruh" as const,
      remainingCredits: remaining,
      permanentCredits: permanent,
      recurringCredits: recurring,
    });
  } catch (e) {
    return NextResponse.json({
      available: false,
      provider: "zeruh" as const,
      remainingCredits: null,
      permanentCredits: null,
      recurringCredits: null,
      error: e instanceof Error ? e.message : "Failed to fetch usage",
    });
  }
}
