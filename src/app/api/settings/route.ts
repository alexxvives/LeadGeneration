import { NextResponse } from "next/server";
import { env, getCapabilities } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only settings status. We NEVER return actual secret values — only
// whether each capability is configured, plus non-secret display settings.
export async function GET() {
  return NextResponse.json({
    capabilities: getCapabilities(),
    identity: {
      fromName: env.fromName(),
      fromEmail: env.fromEmail(),
      replyTo: env.replyTo() || null,
      physicalAddress: env.physicalAddress(),
      sendRatePerMinute: env.sendRatePerMinute(),
      maxLeadsPerRun: env.maxLeadsPerRun(),
      contactFormAutomationEnabled: env.contactFormAutomationEnabled(),
    },
  });
}
