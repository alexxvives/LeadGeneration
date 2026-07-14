import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authRequired, env } from "@/lib/config";

/**
 * Edge-safe base Auth.js config (used by middleware). Must NOT import
 * Nodemailer/SMTP, Resend email provider, or a DB adapter — those live in
 * src/auth.ts (server only). Email/magic-link providers require an adapter;
 * registering them here caused MissingAdapter noise in middleware.
 */

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

export const authConfig = {
  secret: env.authSecret(),
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers,
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
