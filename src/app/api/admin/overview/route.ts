import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { authRequired } from "@/lib/config";
import { getCtx } from "@/lib/request-context";
import { getAdminPlatformStats } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (authRequired()) {
      const session = await auth();
      if (!isAdminEmail(session?.user?.email)) {
        return NextResponse.json({ error: "Admin only" }, { status: 403 });
      }
    }
    const ctx = await getCtx();
    const stats = await getAdminPlatformStats(ctx);
    return NextResponse.json(stats);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Admin overview failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
