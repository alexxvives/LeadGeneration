import NextAuth from "next-auth";
import { D1Adapter } from "@auth/d1-adapter";
import { authConfig } from "@/auth.config";
import { getD1Binding } from "@/lib/cf";
import { getDb } from "@/lib/db";
import { getOrCreateWorkspaceForUser } from "@/lib/workspace";

/**
 * Full server-side Auth.js instance (Node/Worker runtime only). This is where
 * the DB lives: the D1 adapter (for magic-link verification tokens + users) and
 * the workspace-provisioning jwt callback. Imported by the /api/auth route and
 * by server helpers (getCtx) — NEVER by middleware, so `fs`/DB stay out of the
 * edge bundle.
 *
 * Lazy (async) config so the D1 binding is resolved per request via
 * getCloudflareContext(). In local dev there is no binding → no adapter (the
 * Credentials provider needs none) and workspaces live in the JSON store.
 */
export const { handlers, auth, signIn, signOut } = NextAuth(async () => {
  const binding = await getD1Binding();
  return {
    ...authConfig,
    // The adapter's D1Database type comes from @cloudflare/workers-types /
    // @miniflare; ours is a structural subset. Cast at the boundary.
    adapter: binding
      ? D1Adapter(binding as unknown as Parameters<typeof D1Adapter>[0])
      : undefined,
    callbacks: {
      ...authConfig.callbacks,
      async jwt({ token, user }) {
        // `user` is only set at sign-in. Provision (or find) the default
        // workspace once, then cache its id on the token for every later
        // request — so middleware never needs the DB.
        if (user) {
          const db = getDb(binding);
          const email = user.email ?? null;
          const userId = (user.id as string | undefined) ?? `user_${email ?? "unknown"}`;
          const ws = await getOrCreateWorkspaceForUser(db, userId, email);
          token.workspaceId = ws.id;
          token.userId = userId;
        }
        return token;
      },
    },
  };
});
