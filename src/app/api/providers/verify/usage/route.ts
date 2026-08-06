import { NextResponse } from "next/server";
import { env, getCapabilities } from "@/lib/config";

/**
 * Proxy MyEmailVerifier credit balance. Never exposes the API key.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function empty(error?: string) {
  return NextResponse.json({
    available: false,
    provider: "myemailverifier" as const,
    remainingCredits: null,
    permanentCredits: null,
    recurringCredits: null,
    dailyFreeHint: 100,
    ...(error ? { error } : {}),
  });
}

export async function GET() {
  const caps = getCapabilities();
  if (!caps.emailVerify) {
    return empty();
  }

  const mev = env.myEmailVerifierKey();
  if (!mev) {
    return empty();
  }

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
        `MyEmailVerifier credits unavailable (${res.status}): ${text.slice(0, 120)}`,
      );
    }
    let credits: number | null = null;
    try {
      const json = JSON.parse(text) as { credits?: string | number };
      const n = Number(json.credits);
      credits = Number.isFinite(n) ? n : null;
    } catch {
      return empty("Could not parse credits response");
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
    return empty(e instanceof Error ? e.message : "Failed to fetch credits");
  }
}
