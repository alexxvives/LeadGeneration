import { NextResponse } from "next/server";
import { getLatestBoard } from "@/lib/service";
import { getCapabilities } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const board = await getLatestBoard();
  return NextResponse.json({ ...board, capabilities: getCapabilities() });
}
