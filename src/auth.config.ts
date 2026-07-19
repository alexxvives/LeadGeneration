import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authRequired, env } from "@/lib/config";

/**
 * Edge-safe base Auth.js config (used by middleware). Must NOT import
 * Nodemailer/SMTP, Resend email provider, or a DB adapter — those live in
 * src/auth.ts (server only). Email/magic-link providers require an adapter;
 * registering them here caused MissingAdapter noise in middleware.
 *
 * Credentials (edge-safe stub for middleware; full password check lives in
 * src/auth.ts against D1 / local auth-users store):
 *  - When !authRequired (local demo): any email (password ignored) — Art. I.2.
 *  - Production: authorize returns null here; real check is in auth.ts.
 */

const credentialsProvider = Credentials({
  id: "credentials",
  name: "Password",
  credentials: {
    email: { label: "Email", type: "email" },
    password: { label: "Password", type: "password" },
  },
  authorize: async (credentials) => {
    const email = String(credentials?.email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) return null;

    // Local / zero-key demo — any email, password ignored.
    if (!authRequired()) {
      return {
        id: `user_${email}`,
        email,
        name: email.split("@")[0],
      };
    }

    return null;
  },
});

export const authConfig = {
  secret: env.authSecret(),
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [credentialsProvider],
  callbacks: {
    session({ session, token }) {
      if (typeof token.workspaceId === "string") {
        session.workspaceId = token.workspaceId;
      } else {
        Reflect.deleteProperty(session, "workspaceId");
      }
      if (typeof token.userId === "string") {
        session.userId = token.userId;
      } else {
        Reflect.deleteProperty(session, "userId");
      }
      session.isAdmin = token.isAdmin === true;
      // Always mirror JWT identity — never leave a prior account's email/name.
      if (session.user) {
        session.user.email =
          typeof token.email === "string" ? token.email : "";
        session.user.name =
          typeof token.name === "string" ? token.name : null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

declare module "next-auth" {
  interface Session {
    workspaceId?: string;
    userId?: string;
    /** Platform admin (users.is_admin) — plan override / admin APIs. */
    isAdmin?: boolean;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    workspaceId?: string;
    userId?: string;
    isAdmin?: boolean;
  }
}

