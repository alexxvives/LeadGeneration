import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminSession } from "@/lib/admin";
import { env } from "@/lib/config";
import { createInsiderInviteToken } from "@/lib/insider-invite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin-only: generate a signup URL that provisions Insider plan. */
export async function POST() {
  const session = await auth().catch(() => null);
  if (!isAdminSession(session)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  try {
    const token = createInsiderInviteToken();
    const base = env.appUrl().replace(/\/+$/, "");
    const url = `${base}/?insider=${encodeURIComponent(token)}`;
    return NextResponse.json({
      url,
      expiresInDays: 30,
      note: "Anyone who signs up via this link gets the Insider plan. Assign existing users via Users → Plan.",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not create invite" },
      { status: 500 },
    );
  }
}
