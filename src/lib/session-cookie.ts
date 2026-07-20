import { encode } from "next-auth/jwt";
import { NextResponse } from "next/server";
import { env } from "@/lib/config";

const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days (Auth.js default)

export type SessionIdentity = {
  userId: string;
  email: string;
  name: string | null;
  workspaceId: string;
  isAdmin: boolean;
};

function useSecureCookies(req: Request): boolean {
  try {
    if (new URL(req.url).protocol === "https:") return true;
  } catch {
    /* ignore */
  }
  return env.appUrl().toLowerCase().startsWith("https://");
}

function cookieBaseNames(secure: boolean): string[] {
  const primary = secure
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
  const secondary = secure
    ? "authjs.session-token"
    : "__Secure-authjs.session-token";
  return [primary, secondary];
}

/** Unchunked + chunked names Auth.js may have written. */
function allSessionCookieNames(secure: boolean): string[] {
  const names: string[] = [];
  for (const base of cookieBaseNames(secure)) {
    names.push(base);
    for (let i = 0; i < 8; i++) names.push(`${base}.${i}`);
  }
  return names;
}

function serializeCookie(
  name: string,
  value: string,
  opts: { maxAge: number; secure: boolean },
): string {
  // Auth.js writes the JWE raw (no encodeURIComponent) — match that or decode fails.
  const parts = [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${opts.maxAge}`,
  ];
  if (opts.maxAge <= 0) {
    parts.push("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  }
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}

/**
 * Clear every Auth.js session cookie variant, then set a fresh JWT for
 * `identity`. Used when client-side signIn/signOut cannot replace an existing
 * session (common on Workers with chunked `__Secure-` cookies).
 */
export async function setSessionCookie(
  req: Request,
  res: NextResponse,
  identity: SessionIdentity,
): Promise<void> {
  const secure = useSecureCookies(req);
  const cookieName = secure
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
  const secret = env.authSecret();

  // Prefer raw Set-Cookie append — NextResponse.cookies can collapse multiples.
  for (const name of allSessionCookieNames(secure)) {
    res.headers.append(
      "Set-Cookie",
      serializeCookie(name, "", {
        maxAge: 0,
        secure: name.startsWith("__Secure-") || name.startsWith("__Host-"),
      }),
    );
  }

  const jwt = await encode({
    token: {
      email: identity.email,
      name: identity.name,
      sub: identity.userId,
      userId: identity.userId,
      workspaceId: identity.workspaceId,
      isAdmin: identity.isAdmin,
    },
    secret,
    salt: cookieName,
    maxAge: SESSION_MAX_AGE,
  });

  // Chunk if needed (Auth.js ~4KB limit).
  const CHUNK = 3500;
  if (jwt.length <= CHUNK) {
    res.headers.append(
      "Set-Cookie",
      serializeCookie(cookieName, jwt, { maxAge: SESSION_MAX_AGE, secure }),
    );
    return;
  }

  const parts = Math.ceil(jwt.length / CHUNK);
  for (let i = 0; i < parts; i++) {
    res.headers.append(
      "Set-Cookie",
      serializeCookie(
        `${cookieName}.${i}`,
        jwt.slice(i * CHUNK, (i + 1) * CHUNK),
        { maxAge: SESSION_MAX_AGE, secure },
      ),
    );
  }
}
