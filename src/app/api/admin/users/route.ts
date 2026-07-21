import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { isAdminSession } from "@/lib/admin";
import { getCtx } from "@/lib/request-context";
import {
  deleteWorkspaceAccount,
  listAdminUsers,
  setFindLeadsEnabled,
} from "@/lib/service";
import { isNotFoundError } from "@/lib/errors";

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

const DeleteBody = z.object({
  workspaceId: z.string().min(1),
});

/** Admin: permanently delete a user workspace + auth identity. */
export async function DELETE(req: Request) {
  try {
    const session = await auth().catch(() => null);
    if (!isAdminSession(session)) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }
    const parsed = DeleteBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
    }
    const ctx = await getCtx();
    if (parsed.data.workspaceId === ctx.workspaceId) {
      return NextResponse.json(
        { error: "Cannot delete your own admin workspace from Users" },
        { status: 400 },
      );
    }
    await deleteWorkspaceAccount(ctx, parsed.data.workspaceId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (isNotFoundError(err)) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

const PatchBody = z.object({
  workspaceId: z.string().min(1),
  findLeadsEnabled: z.boolean(),
});

/** Admin: toggle Find leads for a workspace. */
export async function PATCH(req: Request) {
  try {
    const session = await auth().catch(() => null);
    if (!isAdminSession(session)) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }
    const parsed = PatchBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "workspaceId and findLeadsEnabled required" },
        { status: 400 },
      );
    }
    const ctx = await getCtx();
    await setFindLeadsEnabled(
      ctx,
      parsed.data.workspaceId,
      parsed.data.findLeadsEnabled,
    );
    return NextResponse.json({
      ok: true,
      workspaceId: parsed.data.workspaceId,
      findLeadsEnabled: parsed.data.findLeadsEnabled,
    });
  } catch (err) {
    if (isNotFoundError(err)) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    const message = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
