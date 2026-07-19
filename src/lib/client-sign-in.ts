import { signIn, signOut } from "next-auth/react";

/**
 * Credentials sign-in that actually switches accounts.
 * Auth.js does not replace an existing JWT when already signed in — sign out
 * first, then sign in, then verify /api/auth/session matches the email.
 */
export async function signInWithPassword(opts: {
  email: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = opts.email.trim().toLowerCase();
  if (!email.includes("@") || !opts.password) {
    return { ok: false, error: "Enter email and password." };
  }

  await signOut({ redirect: false }).catch(() => undefined);

  const result = await signIn("credentials", {
    email,
    password: opts.password,
    redirect: false,
  });
  if (result?.error) {
    return { ok: false, error: "Invalid email or password." };
  }

  // Confirm the cookie actually flipped (not the previous account).
  const sessionRes = await fetch("/api/auth/session", { cache: "no-store" });
  const session = (await sessionRes.json().catch(() => null)) as {
    user?: { email?: string | null };
  } | null;
  const got = session?.user?.email?.trim().toLowerCase() ?? "";
  if (got !== email) {
    return {
      ok: false,
      error: got
        ? `Still signed in as ${got}. Sign out, then try again.`
        : "Sign-in did not create a session. Try again.",
    };
  }

  return { ok: true };
}

/** Hard navigate so RSC + SessionProvider both pick up the new cookie. */
export function goAfterSignIn(callbackUrl: string) {
  if (typeof window !== "undefined") {
    window.location.assign(callbackUrl);
  }
}
