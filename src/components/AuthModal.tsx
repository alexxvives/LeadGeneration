"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { ArrowIcon, MailIcon, XIcon } from "@/components/icons";
import { PasswordField } from "@/components/PasswordField";
import { Spinner } from "@/components/ui";

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: { sitekey: string; callback: (token: string) => void; "expired-callback"?: () => void },
  ) => string;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * Sign-in / sign-up gate for the studio. When auth is not enforced the
 * user can continue as a guest; when AUTH_SECRET is set, signing in is required.
 */
export function AuthModal({
  open,
  onClose,
  authRequired,
  credentialsMode,
  magicLink,
  turnstileSiteKey,
  callbackUrl = "/app",
  allowGuest = true,
}: {
  open: boolean;
  onClose: () => void;
  authRequired: boolean;
  credentialsMode: boolean;
  magicLink: boolean;
  turnstileSiteKey: string | null;
  callbackUrl?: string;
  allowGuest?: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const rendered = useRef(false);

  const renderTurnstile = () => {
    if (!turnstileSiteKey || rendered.current || !widgetRef.current || !window.turnstile) return;
    rendered.current = true;
    window.turnstile.render(widgetRef.current, {
      sitekey: turnstileSiteKey,
      callback: (token) => setTurnstileToken(token),
      "expired-callback": () => setTurnstileToken(null),
    });
  };

  useEffect(() => {
    if (!open) return;
    rendered.current = false;
    setError(null);
    setSent(false);
    const t = setTimeout(renderTurnstile, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !authRequired) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, authRequired, onClose]);

  if (!open) return null;

  const useCredentials = credentialsMode;

  const goStudio = () => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("leadify_guest", "1");
      sessionStorage.removeItem("lodestar_guest");
    }
    onClose();
    router.push(callbackUrl);
    router.refresh();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    try {
      if (turnstileSiteKey) {
        if (!turnstileToken) {
          setError("Please complete the verification challenge.");
          setBusy(false);
          return;
        }
        const res = await fetch("/api/turnstile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: turnstileToken }),
        });
        if (!res.ok) {
          setError("Verification failed — please try again.");
          setBusy(false);
          return;
        }
      }

      if (useCredentials) {
        const result = await signIn("credentials", {
          email: trimmed,
          password,
          redirect: false,
        });
        if (result?.error) {
          setError("Could not sign in. Check your details and try again.");
        } else {
          goStudio();
        }
      } else if (magicLink) {
        const viaSmtp = await signIn("nodemailer", {
          email: trimmed,
          redirect: false,
          redirectTo: callbackUrl,
        });
        let ok = !viaSmtp?.error;
        if (!ok) {
          const viaResend = await signIn("resend", {
            email: trimmed,
            redirect: false,
            redirectTo: callbackUrl,
          });
          ok = !viaResend?.error;
        }
        if (ok) setSent(true);
        else {
          setError(
            "Could not send a sign-in link. Check SMTP/Maileroo or RESEND_API_KEY, then try again.",
          );
        }
      } else {
        setError("No sign-in provider configured. Set SMTP (Maileroo) or AUTH_RESEND_KEY.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm"
        onClick={() => {
          if (!authRequired) onClose();
        }}
      />
      <div className="relative w-full max-w-md animate-float-up rounded-xl2 border border-white/10 bg-ink-900 p-6 shadow-2xl shadow-black/40 sm:p-8">
        {!authRequired && (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 rounded-lg p-1.5 text-mist-500 transition-colors hover:bg-white/5 hover:text-mist-100"
            aria-label="Close"
          >
            <XIcon className="h-4 w-4" />
          </button>
        )}

        <p className="text-xs uppercase tracking-widest text-aurora-300">Welcome</p>
        <h2 id="auth-modal-title" className="mt-2 font-display text-2xl font-semibold text-mist-100">
          {authRequired ? "Sign in to open the studio" : "Open the lead studio"}
        </h2>
        <p className="mt-2 text-sm text-mist-300">
          {authRequired
            ? "Use your email to continue. Nothing sends without your approval."
            : "Local studio is open — continue as a guest, or sign in to try the auth flow."}
        </p>

        {sent ? (
          <div className="mt-6 rounded-xl border border-aurora-400/20 bg-aurora-400/5 p-5 text-center">
            <MailIcon className="mx-auto h-6 w-6 text-aurora-300" />
            <p className="mt-3 font-medium text-mist-100">Check your inbox</p>
            <p className="mt-1 text-sm text-mist-300">
              We sent a secure sign-in link to <span className="text-mist-100">{email}</span>.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            {turnstileSiteKey && (
              <Script
                src="https://challenges.cloudflare.com/turnstile/v0/api.js"
                strategy="afterInteractive"
                onLoad={renderTurnstile}
              />
            )}

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-mist-100">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                placeholder="you@company.com"
                className="w-full rounded-lg border border-white/10 bg-ink-900/60 px-4 py-3 text-mist-100 outline-none transition-colors placeholder:text-mist-500 focus:border-aurora-400/60"
              />
            </label>

            {useCredentials && (
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-mist-100">
                  Password{" "}
                  <span className="font-normal text-mist-500">(any value — local only)</span>
                </span>
                <PasswordField
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </label>
            )}

            {turnstileSiteKey && <div ref={widgetRef} className="min-h-[65px]" />}

            {error && (
              <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>
            )}

            <button
              type="submit"
              disabled={busy || (!useCredentials && !magicLink)}
              className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-aurora-400 px-6 py-3 font-medium text-ink-950 transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Spinner className="h-4 w-4" /> Signing in…
                </>
              ) : (
                <>
                  {useCredentials ? "Sign in" : "Send magic link"}
                  <ArrowIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>
          </form>
        )}

        {allowGuest && !sent && (
          <button
            type="button"
            onClick={goStudio}
            className="mt-4 w-full rounded-full border border-white/10 px-6 py-3 text-sm font-medium text-mist-100 transition-colors hover:bg-white/5"
          >
            Continue as guest
          </button>
        )}
      </div>
    </div>
  );
}
