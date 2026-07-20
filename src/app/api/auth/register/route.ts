import { NextResponse } from "next/server";
import { registerWithPassword } from "@/lib/auth-users";
import {
  checkAuthRateLimit,
  rateLimitResponse,
} from "@/lib/auth-rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { getCapabilities } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public signup: email + password → Auth.js user with password_hash.
 * Client then calls signIn("credentials").
 */
export async function POST(req: Request) {
  let body: { email?: string; password?: string; turnstileToken?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const rate = await checkAuthRateLimit(req, "register", email || "unknown");
  if (!rate.ok) return rateLimitResponse(rate.retryAfterSec);

  const caps = getCapabilities();
  if (caps.turnstile) {
    const ip =
      req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for");
    const ok = await verifyTurnstile(body.turnstileToken ?? null, ip);
    if (!ok) {
      return NextResponse.json(
        { error: "Verification failed — please try again." },
        { status: 400 },
      );
    }
  }

  const result = await registerWithPassword(
    email,
    String(body.password ?? ""),
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({
    ok: true,
    userId: result.userId,
    created: result.created,
  });
}
