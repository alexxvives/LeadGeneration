"use client";

import { signOut } from "next-auth/react";

/** Sign-out control shown in the studio sidebar when auth is enforced. */
export function AccountMenu() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-mist-300 transition-colors hover:bg-white/5 hover:text-mist-100"
    >
      Sign out
    </button>
  );
}
