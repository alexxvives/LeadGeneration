import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import ResendProvider from "next-auth/providers/resend";
import { authRequired, env } from "@/lib/config";

/**
 * Edge-safe base Auth.js config, shared by middleware and the full server
 * config (src/auth.ts). It MUST NOT import the DB (JsonStore pulls in `fs`,
 * which is illegal in the edge/middleware bundle). Anything that touches the
 * database — workspace provisioning, the D1 adapter — lives in src/auth.ts,
 * which is only imported by the Node/Worker route handler + server helpers.
 *
 * Session strategy is JWT (ADR 0007): no session table, no per-request DB
 * round-trip, and it plays nicely with Cloudflare Workers + the Credentials
 * provider used for local dev.
 */

// Local-dev credentials provider: accepts any email + password so `npm run dev`
// works with zero external keys. It is ONLY registered when auth is NOT enforced
// (i.e. AUTH_SECRET unset), so it can never become an any-password backdoor in
// production. Production uses the Resend magic-link provider below.
const devCredentials = Credentials({
  id: "credentials",
  name: "Dev login",
  credentials: {
    email: { label: "Email", type: "email" },
    password: { label: "Password", type: "password" },
  },
  authorize: async (credentials) => {
    const email = String(credentials?.email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) return null;
    return {
      id: `user_${email}`,
      email,
      name: email.split("@")[0],
    };
  },
});

const providers: NextAuthConfig["providers"] = [];
if (!authRequired()) {
  providers.push(devCredentials);
}
if (env.authResendKey()) {
  providers.push(
    ResendProvider({
      apiKey: env.authResendKey(),
      from: env.fromEmail(),
    }),
  );
}

export const authConfig = {
  secret: env.authSecret(),
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers,
  callbacks: {
    // Surface workspace + user id onto the session for the app to consume.
    // The values are put on the token by the DB-aware jwt callback in
    // src/auth.ts at sign-in; here we only read them (edge-safe, no DB).
    session({ session, token }) {
      if (typeof token.workspaceId === "string") session.workspaceId = token.workspaceId;
      if (typeof token.userId === "string") session.userId = token.userId;
      return session;
    },
  },
} satisfies NextAuthConfig;

declare module "next-auth" {
  interface Session {
    workspaceId?: string;
    userId?: string;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    workspaceId?: string;
    userId?: string;
  }
}
