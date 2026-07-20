/**
 * Credentials sign-in via /api/password-login (sets session cookie).
 * Do not use next-auth/react signIn/signOut for account switches — they often
 * leave the previous JWT in place on Cloudflare Workers.
 * Path stays outside `/api/auth/*` (Auth.js catch-all + middleware keep-alive).
 */
export async function signInWithPassword(opts: {
  email: string;
  password: string;
}): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const email = opts.email.trim().toLowerCase();
  if (!email.includes("@") || !opts.password) {
    return { ok: false, error: "Enter email and password." };
  }

  const res = await fetch("/api/password-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({ email, password: opts.password }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    email?: string;
  };

  if (!res.ok) {
    return {
      ok: false,
      error: data.error ?? "Invalid email or password.",
    };
  }

  return { ok: true, email: data.email ?? email };
}

/** Hard navigate so RSC + SessionProvider both pick up the new cookie. */
export function goAfterSignIn(callbackUrl: string) {
  if (typeof window !== "undefined") {
    // Bypass any bfcache / soft navigation that could keep the old session.
    const url = new URL(callbackUrl, window.location.origin);
    url.searchParams.set("_auth", Date.now().toString(36));
    window.location.replace(url.pathname + url.search);
  }
}
