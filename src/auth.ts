import NextAuth from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import { D1Adapter } from "@auth/d1-adapter";
import { authConfig } from "@/auth.config";
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
 * otherwise Resend from auth.config. See docs/email-providers.md.
 */
export const { handlers, auth, signIn, signOut } = NextAuth(async () => {
  const binding = await getD1Binding();
  const caps = getCapabilities();
  const smtp = env.smtp();

  const providers = [...authConfig.providers];
  if (caps.smtp && smtp.host && smtp.user) {
    // Prefer Maileroo/SMTP for magic links — insert ahead of Resend if both exist.
    providers.unshift(
      Nodemailer({
        id: "nodemailer",
        name: "Email",
        server: {
          host: smtp.host,
          port: smtp.port,
          auth: { user: smtp.user, pass: smtp.pass },
        },
        from: env.fromEmail(),
      }),
    );
  }

  return {
    ...authConfig,
    providers,
    adapter: binding
      ? D1Adapter(binding as unknown as Parameters<typeof D1Adapter>[0])
      : undefined,
    callbacks: {
      ...authConfig.callbacks,
      async jwt({ token, user }) {
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
