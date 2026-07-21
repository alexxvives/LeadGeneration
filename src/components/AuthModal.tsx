"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { signIn } from "next-auth/react";
import { ArrowIcon, MailIcon, XIcon } from "@/components/icons";
import { PasswordField } from "@/components/PasswordField";
import { Spinner } from "@/components/ui";
import { goAfterSignIn, signInWithPassword } from "@/lib/client-sign-in";

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

type FormMode = "signin" | "signup" | "magic";

/**
 * Sign-in / sign-up gate for the studio. Password is primary; magic link is
 * forgot-password. When auth is not enforced the user can continue as a guest.
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
  /** When true, backdrop / Esc / X always dismiss (marketing overlay). */
  dismissible,
  /** Prefer signup (e.g. Insider invite link). */
  initialMode = "signin",
}: {
  open: boolean;
  onClose: () => void;
  authRequired: boolean;
  credentialsMode: boolean;
  magicLink: boolean;
  turnstileSiteKey: string | null;
  callbackUrl?: string;
  allowGuest?: boolean;
  dismissible?: boolean;
  initialMode?: FormMode;
}) {
  const canDismiss = dismissible ?? !authRequired;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<FormMode>("signin");
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
    setMode(initialMode);
    const t = setTimeout(renderTurnstile, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialMode]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && canDismiss) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, canDismiss, onClose]);

  if (!open) return null;

  const usePassword = mode !== "magic";

  const goStudio = () => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("hermes_guest", "1");
      sessionStorage.removeItem("leadify_guest");
      sessionStorage.removeItem("lodestar_guest");
    }
    goAfterSignIn(callbackUrl);
  };

  const ensureTurnstile = async (): Promise<boolean> => {
    if (!turnstileSiteKey) return true;
    if (!turnstileToken) {
      setError("Please complete the verification challenge.");
      return false;
    }
    const res = await fetch("/api/turnstile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: turnstileToken }),
    });
    if (!res.ok) {
      setError("Verification failed — please try again.");
      return false;
    }
    return true;
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
    if (usePassword && !password) {
      setError("Enter your password.");
      return;
    }
    if (mode === "signup" && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "magic") {
        if (!magicLink) {
          setError("No sign-in provider configured. Set SMTP (Maileroo) or RESEND_API_KEY.");
          return;
        }
        if (!(await ensureTurnstile())) return;
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
        return;
      }

      if (mode === "signup") {
        let insiderToken: string | undefined;
        try {
          insiderToken =
            sessionStorage.getItem("hermes_insider_invite") ?? undefined;
        } catch {
          insiderToken = undefined;
        }
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: trimmed,
            password,
            turnstileToken: turnstileToken ?? undefined,
            insiderToken,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          insider?: boolean;
        };
        if (!res.ok) {
          setError(data.error ?? "Could not create account.");
          return;
        }
        // Force product tour for new accounts even if this browser skipped it as guest.
        try {
          sessionStorage.setItem("hermes_force_tutorial", "1");
          if (data.insider) {
            sessionStorage.removeItem("hermes_insider_invite");
          }
        } catch {
          /* ignore */
        }
      } else if (turnstileSiteKey && !(await ensureTurnstile())) {
        return;
      }

      const result = await signInWithPassword({ email: trimmed, password });
      if (!result.ok) {
        setError(
          mode === "signup"
            ? "Account created, but sign-in failed. Try signing in."
            : credentialsMode
              ? result.error === "Invalid email or password."
                ? "Could not sign in. Check your details and try again."
                : result.error
              : result.error,
        );
      } else {
        goStudio();
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
          if (canDismiss) onClose();
        }}
      />
      <div className="relative w-full max-w-md animate-float-up rounded-xl2 border border-white/10 bg-ink-900 p-6 shadow-2xl shadow-black/40 sm:p-8">
        {canDismiss && (
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
            ? "Email and password. Nothing sends without your approval."
            : "Local studio is open — continue as a guest, or sign in to try the auth flow."}
        </p>

        {sent ? (
          <div className="mt-6 rounded-xl border border-aurora-400/20 bg-aurora-400/5 p-5 text-center">
            <MailIcon className="mx-auto h-6 w-6 text-aurora-300" />
            <p className="mt-3 font-medium text-mist-100">Check your inbox</p>
            <p className="mt-1 text-sm text-mist-300">
              We sent a secure sign-in link to <span className="text-mist-100">{email}</span>.
            </p>
            <button
              type="button"
              onClick={() => {
                setSent(false);
                setMode("signin");
              }}
              className="mt-4 text-sm text-aurora-300 hover:underline"
            >
              Back to password sign-in
            </button>
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

            {mode !== "magic" ? (
              <div className="flex rounded-full border border-white/10 bg-ink-900/60 p-1 text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setMode("signin");
                  }}
                  className={`flex-1 rounded-full px-3 py-1.5 font-medium transition-colors ${
                    mode === "signin"
                      ? "bg-aurora-400 text-on-accent"
                      : "text-mist-300 hover:text-mist-100"
                  }`}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setMode("signup");
                  }}
                  className={`flex-1 rounded-full px-3 py-1.5 font-medium transition-colors ${
                    mode === "signup"
                      ? "bg-aurora-400 text-on-accent"
                      : "text-mist-300 hover:text-mist-100"
                  }`}
                >
                  Create account
                </button>
              </div>
            ) : (
              <p className="text-sm text-mist-300">
                We’ll email a one-time link — use this if you forgot your password.
              </p>
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

            {usePassword && (
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-mist-100">
                  Password{" "}
                  {credentialsMode ? (
                    <span className="font-normal text-mist-500">(any value — local only)</span>
                  ) : mode === "signup" ? (
                    <span className="font-normal text-mist-500">(min 8 characters)</span>
                  ) : null}
                </span>
                <PasswordField
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  required
                />
              </label>
            )}

            {turnstileSiteKey && <div ref={widgetRef} className="min-h-[65px]" />}

            {error && (
              <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>
            )}

            <button
              type="submit"
              disabled={busy || (mode === "magic" && !magicLink)}
              className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-aurora-400 px-6 py-3 font-medium text-on-accent transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Spinner className="h-4 w-4" />{" "}
                  {mode === "signup"
                    ? "Creating…"
                    : mode === "magic"
                      ? "Sending link…"
                      : "Signing in…"}
                </>
              ) : (
                <>
                  {mode === "signup"
                    ? "Create account"
                    : mode === "magic"
                      ? "Send sign-in link"
                      : "Sign in"}
                  <ArrowIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>

            {magicLink ? (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMode(mode === "magic" ? "signin" : "magic");
                }}
                className="w-full text-center text-sm text-mist-400 transition-colors hover:text-aurora-300"
              >
                {mode === "magic"
                  ? "Back to password sign-in"
                  : "Forgot password? Email me a sign-in link"}
              </button>
            ) : null}
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
