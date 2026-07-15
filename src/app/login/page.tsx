import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { authRequired, env, getCapabilities } from "@/lib/config";
import { LoginForm } from "./LoginForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  const caps = getCapabilities();

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 aurora-glow opacity-40" />
      <SiteNav
        authRequired={authRequired()}
        credentialsMode={!authRequired()}
        magicLink={caps.smtp || caps.resend}
        turnstileSiteKey={caps.turnstile ? env.turnstileSiteKey() : null}
      />

      <div className="mx-auto grid max-w-md place-items-center px-6 py-10">
        <div className="glass w-full rounded-xl2 p-8">
          <h1 className="font-display text-2xl font-semibold">Sign in to Leadify</h1>
          <p className="mt-2 text-sm text-mist-300">
            {authRequired()
              ? "Enter your email and we’ll send a secure sign-in link."
              : "Local preview — sign in with any email, or continue as guest from the studio."}
          </p>

          <LoginForm
            credentialsMode={!authRequired()}
            magicLink={caps.smtp || caps.resend}
            turnstileSiteKey={caps.turnstile ? env.turnstileSiteKey() : null}
            callbackUrl={callbackUrl ?? "/app"}
            preferSmtp={caps.smtp}
          />
        </div>

        <p className="mt-6 text-center text-sm text-mist-500">
          New here?{" "}
          <Link href="/pricing" className="text-aurora-300 hover:underline">
            See plans
          </Link>{" "}
          · Every plan starts free.
        </p>
      </div>
    </main>
  );
}
