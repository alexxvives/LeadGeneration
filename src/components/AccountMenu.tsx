"use client";

import { signOut } from "next-auth/react";

/** Sign-out control shown in the app header when auth is enforced. */
export function AccountMenu() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      className="rounded-lg px-3 py-1.5 text-mist-300 transition-colors hover:bg-white/5 hover:text-mist-100"
    >
      Sign out
    </button>
  );
}
