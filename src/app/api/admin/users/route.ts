import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminSession } from "@/lib/admin";
import { getCtx } from "@/lib/request-context";
import { listAdminUsers } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth().catch(() => null);
    if (!isAdminSession(session)) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }
    const ctx = await getCtx();
    const users = await listAdminUsers(ctx);
    return NextResponse.json({ users });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Admin users failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
