import { NextResponse } from "next/server";
import { verifyTurnstile } from "@/lib/turnstile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public pre-login endpoint: verifies a Turnstile token before the client
 * initiates sign-in. No-ops (returns ok) when Turnstile is not configured, so
 * local dev is unaffected.
 */
export async function POST(req: Request) {
  let token: string | null = null;
  try {
    const body = (await req.json()) as { token?: string };
    token = body.token ?? null;
  } catch {
    token = null;
  }
  const ip =
    req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for");
  const ok = await verifyTurnstile(token, ip);
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}
