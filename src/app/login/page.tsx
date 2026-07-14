import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
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
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-6 py-16">
      <div className="pointer-events-none absolute inset-0 -z-10 aurora-glow opacity-40" />
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Link href="/">
            <BrandMark size="lg" />
          </Link>
        </div>

        <div className="glass rounded-xl2 p-8">
          <h1 className="font-display text-2xl font-semibold">Sign in to Lodestar</h1>
          <p className="mt-2 text-sm text-mist-300">
            {authRequired()
              ? "Enter your email and we'll send you a secure sign-in link."
              : "Local dev mode — sign in with any email to open the studio."}
          </p>

          <LoginForm
            credentialsMode={!authRequired()}
            magicLink={caps.resend}
            turnstileSiteKey={caps.turnstile ? env.turnstileSiteKey() : null}
            callbackUrl={callbackUrl ?? "/app"}
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
