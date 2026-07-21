import { redirect } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Legacy Auth.js / middleware sign-in URL. Real UI is the landing AuthModal
 * (`/?signin=1`). Keep this route so `pages.signIn: "/login"` and old links work.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;
  const next = new URLSearchParams();
  next.set("signin", "1");
  if (callbackUrl) next.set("callbackUrl", callbackUrl);
  if (error) next.set("authError", error);
  redirect(`/?${next.toString()}`);
}
