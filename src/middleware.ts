import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import type { NextMiddleware } from "next/server";
import { authConfig } from "@/auth.config";
import { getD1Binding } from "@/lib/cf";
import { authRequired, env } from "@/lib/config";

// Edge instance built from the DB-free base config (no adapter, no `fs`).
const { auth } = NextAuth(authConfig);

// Routes that atomically rewrite the session cookie. The Auth.js `auth()`
// wrapper re-emits the *request* session onto the response ("keep alive"),
// which overwrites a freshly set account-switch JWT. Skip the wrapper here.
const SESSION_WRITE_PATHS = new Set([
  "/api/auth/password-login",
  "/api/password-login",
]);

// Routes that are reachable without a session.
const PUBLIC_PREFIXES = [
  "/login",
  "/pricing",
  "/how-it-works",
  "/ethics",
  "/deliverability",
  "/api/auth",
  "/api/password-login",
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

const authMiddleware = auth((req) => {
  const { pathname } = req.nextUrl;

  // Zero-key demo / local dev: auth is not enforced, so the whole app is open
  // (constitution Art. I.2). Enforcement turns on only when AUTH_SECRET is set.
  if (!authRequired()) return NextResponse.next();

  if (isPublic(pathname)) return NextResponse.next();

  // Headless smoke bypass — never when a D1 binding exists (audit C2.7).
  // Binding resolution is async; sync path only allows non-production.
  const smokeKey = env.smokeApiKey();
  if (
    smokeKey &&
    process.env.NODE_ENV !== "production" &&
    req.headers.get("x-smoke-key") === smokeKey
  ) {
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
}) as unknown as NextMiddleware;

export default async function middleware(
  ...args: Parameters<NextMiddleware>
): Promise<Awaited<ReturnType<NextMiddleware>>> {
  const req = args[0];
  if (SESSION_WRITE_PATHS.has(req.nextUrl.pathname)) {
    return NextResponse.next();
  }

  // Fail closed: Workers + D1 without AUTH_SECRET must not open the app.
  if (!authRequired()) {
    const binding = await getD1Binding();
    if (binding) {
      console.error(
        "[middleware] D1 binding present but AUTH_SECRET missing — 503",
      );
      return NextResponse.json(
        { error: "Server misconfigured: AUTH_SECRET missing" },
        { status: 503 },
      );
    }
  }

  return authMiddleware(...args);
}

export const config = {
  // Run on everything except Next internals and static image assets.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.png|images/|.*\\.(?:png|jpg|jpeg|webp|svg|ico)$).*)",
  ],
};
