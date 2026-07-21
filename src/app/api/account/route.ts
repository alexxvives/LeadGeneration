import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { authRequired } from "@/lib/config";
import { getCtx } from "@/lib/request-context";
import { deleteOwnAccount } from "@/lib/service";
import { isAuthError, isNotFoundError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Self-serve account deletion. Wipes workspace data + Auth.js user.
 * Blocked when auth is not required (local demo) to avoid nuking local workspace.
 */
export async function DELETE() {
  try {
    if (!authRequired()) {
      return NextResponse.json(
        { error: "Account deletion is only available on the live app." },
        { status: 400 },
      );
    }
    const session = await auth().catch(() => null);
    if (!session?.user) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }
    const ctx = await getCtx();
    await deleteOwnAccount(ctx);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (isNotFoundError(err)) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
