import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Nodemailer from "next-auth/providers/nodemailer";
import ResendProvider from "next-auth/providers/resend";
import { D1Adapter } from "@auth/d1-adapter";
import { authConfig } from "@/auth.config";
import {
  authenticateWithPassword,
  ensureBootstrapAdmin,
  findAuthUserByEmail,
} from "@/lib/auth-users";
import { magicLinkEmail } from "@/lib/auth-email";
import { getD1Binding } from "@/lib/cf";
import { getDb } from "@/lib/db";
import { authRequired, env, getCapabilities } from "@/lib/config";
import { getOrCreateWorkspaceForUser } from "@/lib/workspace";

/**
 * Full server-side Auth.js instance (Node/Worker runtime only). This is where
 * the DB lives: the D1 adapter (for magic-link verification tokens + users) and
 * the workspace-provisioning jwt callback. Imported by the /api/auth route and
 * by server helpers (getCtx) — NEVER by middleware, so `fs`/DB stay out of the
 * edge bundle.
 *
 * Sign-in: per-user password hash (incl. bootstrap admin with is_admin), or
 * local any-email when !authRequired. Magic link is forgot-password fallback.
 */
export const { handlers, auth, signIn, signOut } = NextAuth(async () => {
  const binding = await getD1Binding();
  const caps = getCapabilities();
  const smtp = env.smtp();
  const adapter = binding
    ? D1Adapter(binding as unknown as Parameters<typeof D1Adapter>[0])
    : undefined;

  // First request after deploy: ensure hashed admin row exists (no env secrets).
  await ensureBootstrapAdmin().catch((err) => {
    console.error("[auth] bootstrap admin failed", err);
  });

  const passwordCredentials = Credentials({
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

      let user: Awaited<ReturnType<typeof authenticateWithPassword>> = null;
      try {
        user = await authenticateWithPassword(email, password);
      } catch (err) {
        console.error("[auth] password lookup failed", err);
      }
      if (user) {
        return {
          id: user.id,
          email: user.email,
          name: user.name ?? user.email.split("@")[0],
          isAdmin: user.isAdmin,
        };
      }

      // Local / zero-key demo — any email, password ignored.
      if (!authRequired()) {
        return {
          id: `user_${email}`,
          email,
          name: email.split("@")[0],
          isAdmin: true,
        };
      }

      return null;
    },
  });

  const providers: NextAuthConfig["providers"] = [passwordCredentials];

  const sendVerificationRequest = async ({
    identifier,
    url,
    provider,
  }: {
    identifier: string;
    url: string;
    provider: { from?: string };
  }) => {
    const { host } = new URL(url);
    const { html, text } = magicLinkEmail({ url, host, email: identifier });
    const from = provider.from ?? env.authFromEmail();
    const key = env.authResendKey();
    if (!key) throw new Error("RESEND_API_KEY is not configured");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [identifier],
        subject: `Sign in to HERMES mail`,
        html,
        text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Resend magic-link failed (${res.status}): ${body.slice(0, 200)}`);
    }
  };

  if (adapter) {
    if (caps.smtp && smtp.host && smtp.user) {
      providers.push(
        Nodemailer({
          id: "nodemailer",
          name: "Email",
          server: {
            host: smtp.host,
            port: smtp.port,
            auth: { user: smtp.user, pass: smtp.pass },
          },
          from: env.authFromEmail(),
          sendVerificationRequest: async ({ identifier, url, provider }) => {
            const { host } = new URL(url);
            const { html, text } = magicLinkEmail({ url, host, email: identifier });
            const nodemailer = await import("nodemailer");
            const transport = nodemailer.createTransport(provider.server as object);
            await transport.sendMail({
              to: identifier,
              from: provider.from,
              subject: "Sign in to HERMES mail",
              text,
              html,
            });
          },
        }),
      );
    }
    if (env.authResendKey()) {
      providers.push(
        ResendProvider({
          id: "resend",
          apiKey: env.authResendKey(),
          from: env.authFromEmail(),
          sendVerificationRequest,
        }),
      );
    }
  }

  return {
    ...authConfig,
    providers,
    adapter,
    callbacks: {
      ...authConfig.callbacks,
      async jwt({ token, user }) {
        if (user) {
          try {
            const db = getDb(binding);
            const email = user.email ?? null;
            const userId =
              (user.id as string | undefined) ?? `user_${email ?? "unknown"}`;
            const ws = await getOrCreateWorkspaceForUser(db, userId, email);
            token.workspaceId = ws.id;
            token.userId = userId;
          } catch (err) {
            console.error("[auth] workspace provision failed", err);
            if (user.id) token.userId = user.id as string;
            if (user.email) token.email = user.email;
          }

          const fromUser = (user as { isAdmin?: boolean }).isAdmin;
          if (typeof fromUser === "boolean") {
            token.isAdmin = fromUser;
          } else if (user.email) {
            const row = await findAuthUserByEmail(user.email).catch(() => null);
            token.isAdmin = Boolean(row?.isAdmin);
          } else {
            token.isAdmin = false;
          }
        }
        return token;
      },
    },
  };
});
