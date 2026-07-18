import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authRequired, env } from "@/lib/config";
import { verifyAdminCredentials } from "@/lib/admin";

/**
 * Edge-safe base Auth.js config (used by middleware). Must NOT import
 * Nodemailer/SMTP, Resend email provider, or a DB adapter — those live in
 * src/auth.ts (server only). Email/magic-link providers require an adapter;
 * registering them here caused MissingAdapter noise in middleware.
 *
 * Credentials:
 *  - Always: admin@… + ADMIN_PASSWORD (plan-override operator).
 *  - When !authRequired (local demo): any email (password ignored) — Art. I.2.
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
    const password = String(credentials?.password ?? "");
    if (!email || !email.includes("@")) return null;

    if (verifyAdminCredentials(email, password)) {
      return {
        id: `user_${email}`,
        email,
        name: "Admin",
      };
    }

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
