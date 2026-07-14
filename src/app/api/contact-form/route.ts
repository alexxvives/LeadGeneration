import { NextResponse } from "next/server";
import { env } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CONTACT-FORM AUTOMATION — STUB / DEMO ONLY.
 *
 * This endpoint deliberately DOES NOT submit anything to any third-party site.
 * It is gated behind the ENABLE_CONTACT_FORM_AUTOMATION flag (OFF by default)
 * and, even when enabled, only returns a simulated preview of what *would* be
 * submitted.
 *
 * ⚠️ LEGAL / ToS REVIEW REQUIRED BEFORE BUILDING THIS FOR REAL:
 *  - Auto-submitting contact forms may violate the target site's Terms of
 *    Service and anti-bot measures, and can run afoul of computer-misuse and
 *    anti-spam laws (CAN-SPAM, CASL, GDPR, etc.).
 *  - Do NOT wire this to real form submission without explicit, per-lead human
 *    approval AND a documented legal review. Keep a human in the loop.
 */
export async function POST(req: Request) {
  if (!env.contactFormAutomationEnabled()) {
    return NextResponse.json(
      {
        enabled: false,
        message:
          "Contact-form automation is disabled. It is a demo-only stub and is OFF by default.",
      },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const { url, message } = (body ?? {}) as { url?: string; message?: string };

  // Simulated preview only — nothing is actually submitted.
  return NextResponse.json({
    enabled: true,
    simulated: true,
    wouldSubmitTo: url ?? "(no url provided)",
    previewPayload: {
      name: env.fromName(),
      email: env.fromEmail(),
      message: message ?? "(draft message)",
    },
    warning:
      "SIMULATION ONLY. No form was submitted. Requires ToS/legal review + per-lead human approval before real use.",
  });
}
