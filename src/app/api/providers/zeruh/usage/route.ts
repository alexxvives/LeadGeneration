import { NextResponse } from "next/server";
import { env, getCapabilities } from "@/lib/config";

/**
 * Proxy verify-provider credit balance. Never exposes the API key.
 * Prefer MyEmailVerifier (getcredits); else Zeruh account endpoint.
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

function empty(provider: "myemailverifier" | "zeruh", error?: string) {
  return NextResponse.json({
    available: false,
    provider,
    remainingCredits: null,
    permanentCredits: null,
    recurringCredits: null,
    dailyFreeHint: provider === "myemailverifier" ? 100 : null,
    ...(error ? { error } : {}),
  });
}

export async function GET() {
  const caps = getCapabilities();
  if (!caps.emailVerify) {
    return empty("zeruh");
  }

  const mev = env.myEmailVerifierKey();
  if (mev) {
    try {
      const res = await fetch(
        `https://client.myemailverifier.com/verifier/getcredits/${encodeURIComponent(mev)}`,
        {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(10_000),
          cache: "no-store",
        },
      );
      const text = await res.text().catch(() => "");
      if (!res.ok) {
        return empty(
          "myemailverifier",
          `MyEmailVerifier credits unavailable (${res.status}): ${text.slice(0, 120)}`,
        );
      }
      let credits: number | null = null;
      try {
        const json = JSON.parse(text) as { credits?: string | number };
        const n = Number(json.credits);
        credits = Number.isFinite(n) ? n : null;
      } catch {
        return empty("myemailverifier", "Could not parse credits response");
      }
      return NextResponse.json({
        available: credits != null,
        provider: "myemailverifier" as const,
        remainingCredits: credits,
        permanentCredits: credits,
        recurringCredits: null,
        dailyFreeHint: 100,
      });
    } catch (e) {
      return empty(
        "myemailverifier",
        e instanceof Error ? e.message : "Failed to fetch credits",
      );
    }
  }

  const key = env.zeruhVerifyKey();
  if (!key) {
    return empty("zeruh");
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
      return empty(
        "zeruh",
        `Zeruh usage unavailable (${res.status}): ${text.slice(0, 120)}`,
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
      dailyFreeHint: null,
    });
  } catch (e) {
    return empty(
      "zeruh",
      e instanceof Error ? e.message : "Failed to fetch usage",
    );
  }
}
