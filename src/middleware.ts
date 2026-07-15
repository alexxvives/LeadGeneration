import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import { authRequired, env } from "@/lib/config";

// Edge instance built from the DB-free base config (no adapter, no `fs`).
const { auth } = NextAuth(authConfig);

// Routes that are reachable without a session.
const PUBLIC_PREFIXES = [
  "/login",
  "/pricing",
  "/how-it-works",
  "/ethics",
  "/deliverability",
  "/api/auth",
  "/api/webhooks/stripe",
  "/api/webhooks/resend",
  "/api/webhooks/maileroo",
  "/api/turnstile",
];

function isPublic(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Zero-key demo / local dev: auth is not enforced, so the whole app is open
  // (constitution Art. I.2). Enforcement turns on only when AUTH_SECRET is set.
  if (!authRequired()) return NextResponse.next();

  if (isPublic(pathname)) return NextResponse.next();

  // Headless smoke-test bypass so the API can be exercised even with auth on.
  const smokeKey = env.smokeApiKey();
  if (smokeKey && req.headers.get("x-smoke-key") === smokeKey) {
    return NextResponse.next();
  }

  if (!req.auth) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  // Run on everything except Next internals and static image assets.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|images/).*)",
  ],
};
