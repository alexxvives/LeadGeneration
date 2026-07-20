import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticateWithPassword,
  ensureBootstrapAdmin,
} from "@/lib/auth-users";
import {
  checkAuthRateLimit,
  rateLimitResponse,
} from "@/lib/auth-rate-limit";
import { getD1Binding } from "@/lib/cf";
import { authRequired } from "@/lib/config";
import { getDb } from "@/lib/db";
import { setSessionCookie } from "@/lib/session-cookie";
import { getOrCreateWorkspaceForUser } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * Password login that atomically replaces the Auth.js session cookie.
 *
 * Lives outside `/api/auth/*` so Auth.js `[...nextauth]` never intercepts it,
 * and middleware skips the `auth()` wrapper (that wrapper re-emits the request
 * session and would overwrite this JWT — see LEARNINGS 2026-07-19).
 */
export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid email and password." },
      { status: 400 },
    );
  }

  const email = parsed.data.email.trim().toLowerCase();
  const password = parsed.data.password;

  const rate = await checkAuthRateLimit(req, "password", email);
  if (!rate.ok) return rateLimitResponse(rate.retryAfterSec);

  await ensureBootstrapAdmin().catch((err) => {
    console.error("[password-login] bootstrap admin failed", err);
  });

  let user: Awaited<ReturnType<typeof authenticateWithPassword>> = null;
  try {
    user = await authenticateWithPassword(email, password);
  } catch (err) {
    console.error("[password-login] lookup failed", err);
  }

  if (!user && !authRequired()) {
    user = {
      id: `user_${email}`,
      email,
      name: email.split("@")[0] || null,
      isAdmin: true,
    };
  }

  if (!user) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  const binding = await getD1Binding();
  let workspaceId = "local";
  try {
    const db = getDb(binding);
    const ws = await getOrCreateWorkspaceForUser(db, user.id, user.email);
    workspaceId = ws.id;
  } catch (err) {
    console.error("[password-login] workspace provision failed", err);
    if (authRequired()) {
      return NextResponse.json(
        { error: "Could not open workspace. Try again." },
        { status: 500 },
      );
    }
  }

  const res = NextResponse.json({
    ok: true,
    email: user.email,
    name: user.name,
    isAdmin: user.isAdmin,
  });

  await setSessionCookie(req, res, {
    userId: user.id,
    email: user.email,
    name: user.name ?? user.email.split("@")[0] ?? null,
    workspaceId,
    isAdmin: user.isAdmin,
  });

  return res;
}
