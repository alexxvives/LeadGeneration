import { env, getCapabilities } from "@/lib/config";

/**
 * Verify a Cloudflare Turnstile token server-side. Only meaningful when
 * Turnstile is configured; callers should gate on getCapabilities().turnstile
 * so local dev (no keys) is never blocked.
 */
export async function verifyTurnstile(
  token: string | null | undefined,
  remoteIp?: string | null,
): Promise<boolean> {
  if (!getCapabilities().turnstile) return true; // not configured → no-op pass
  if (!token) return false;

  const form = new URLSearchParams();
  form.set("secret", env.turnstileSecretKey());
  form.set("response", token);
  if (remoteIp) form.set("remoteip", remoteIp);

  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body: form },
    );
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
