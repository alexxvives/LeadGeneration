import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import ResendProvider from "next-auth/providers/resend";
import { authRequired, env } from "@/lib/config";

/**
 * Edge-safe base Auth.js config (used by middleware). Must NOT import
 * Nodemailer/SMTP — that lives in src/auth.ts (server only).
 *
 * Magic-link: Resend is registered here when present (fetch-based, edge-safe).
 * Maileroo/SMTP Nodemailer is added in auth.ts and takes precedence for sends.
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
if (env.authResendKey()) {
  providers.push(
    ResendProvider({
      id: "resend",
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
