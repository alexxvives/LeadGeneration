import NextAuth from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import ResendProvider from "next-auth/providers/resend";
import { D1Adapter } from "@auth/d1-adapter";
import { authConfig } from "@/auth.config";
import { magicLinkEmail } from "@/lib/auth-email";
import { getD1Binding } from "@/lib/cf";
import { getDb } from "@/lib/db";
import { env, getCapabilities } from "@/lib/config";
import { getOrCreateWorkspaceForUser } from "@/lib/workspace";

/**
 * Full server-side Auth.js instance (Node/Worker runtime only). This is where
 * the DB lives: the D1 adapter (for magic-link verification tokens + users) and
 * the workspace-provisioning jwt callback. Imported by the /api/auth route and
 * by server helpers (getCtx) — NEVER by middleware, so `fs`/DB stay out of the
 * edge bundle.
 *
 * Magic-link preference: Maileroo via SMTP (Nodemailer) when configured,
 * otherwise Resend. Email providers are registered only when a D1 adapter is
 * available (Auth.js requires an adapter for email login). See docs/email-providers.md.
 */
export const { handlers, auth, signIn, signOut } = NextAuth(async () => {
  const binding = await getD1Binding();
  const caps = getCapabilities();
  const smtp = env.smtp();
  const adapter = binding
    ? D1Adapter(binding as unknown as Parameters<typeof D1Adapter>[0])
    : undefined;

  const providers = [...authConfig.providers];

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
        subject: `Sign in to Leadify`,
        html,
        text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Resend magic-link failed (${res.status}): ${body.slice(0, 200)}`);
    }
  };

  // Email/magic-link providers need an adapter for verification tokens.
  if (adapter) {
    if (caps.smtp && smtp.host && smtp.user) {
      providers.unshift(
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
              subject: "Sign in to Leadify",
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
            // Never fail sign-in because workspace provisioning hiccuped —
            // getCtx() will retry on the next authenticated request.
            console.error("[auth] workspace provision failed", err);
            if (user.id) token.userId = user.id as string;
            if (user.email) token.email = user.email;
          }
        }
        return token;
      },
    },
  };
});
