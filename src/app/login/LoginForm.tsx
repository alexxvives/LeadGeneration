"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { ArrowIcon, MailIcon } from "@/components/icons";
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

type FormMode = "signin" | "signup" | "magic";

export function LoginForm({
  credentialsMode,
  magicLink,
  turnstileSiteKey,
  callbackUrl,
  preferSmtp = false,
}: {
  credentialsMode: boolean;
  magicLink: boolean;
  turnstileSiteKey: string | null;
  callbackUrl: string;
  preferSmtp?: boolean;
}) {
  const router = useRouter();
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
    renderTurnstile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const usePassword = mode !== "magic";

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
        if (!(await ensureTurnstile())) {
          setBusy(false);
          return;
        }
        const provider = preferSmtp ? "nodemailer" : "resend";
        const fallback = preferSmtp ? "resend" : "nodemailer";
        const primary = await signIn(provider, {
          email: trimmed,
          redirect: false,
          redirectTo: callbackUrl,
        });
        let ok = !primary?.error;
        if (!ok) {
          const secondary = await signIn(fallback, {
            email: trimmed,
            redirect: false,
            redirectTo: callbackUrl,
          });
          ok = !secondary?.error;
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
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: trimmed,
            password,
            turnstileToken: turnstileToken ?? undefined,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Could not create account.");
          return;
        }
      } else if (turnstileSiteKey && !(await ensureTurnstile())) {
        return;
      }

      const result = await signIn("credentials", {
        email: trimmed,
        password,
        redirect: false,
      });
      if (result?.error) {
        setError(
          credentialsMode
            ? "Could not sign in. Check your details and try again."
            : mode === "signup"
              ? "Account created, but sign-in failed. Try signing in."
              : "Invalid email or password.",
        );
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="mt-6 rounded-xl border border-aurora-400/20 bg-aurora-400/5 p-5 text-center">
        <MailIcon className="mx-auto h-6 w-6 text-aurora-300" />
        <p className="mt-3 font-medium text-mist-100">Check your inbox</p>
        <p className="mt-1 text-sm text-mist-300">
          We sent a secure sign-in link to <span className="text-mist-100">{email}</span>.
          After you open it, you can set a password from Create account if you
          want password sign-in next time.
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
    );
  }

  const title =
    mode === "signup" ? "Create account" : mode === "magic" ? "Email sign-in link" : "Sign in";
  const submitLabel =
    mode === "signup" ? "Create account" : mode === "magic" ? "Send sign-in link" : "Sign in";
  const busyLabel =
    mode === "signup" ? "Creating…" : mode === "magic" ? "Sending link…" : "Signing in…";

  return (
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

      {mode === "magic" && !magicLink && (
        <p className="rounded-lg bg-amber-400/10 px-3 py-2 text-sm text-amber-200/80">
          No email sign-in provider is configured. Set SMTP (Maileroo) or{" "}
          <code>RESEND_API_KEY</code>.
        </p>
      )}

      <button
        type="submit"
        disabled={busy || (mode === "magic" && !magicLink)}
        className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-aurora-400 px-6 py-3 font-medium text-on-accent transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? (
          <>
            <Spinner className="h-4 w-4" /> {busyLabel}
          </>
        ) : (
          <>
            {submitLabel}
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

      {mode === "magic" ? null : (
        <p className="sr-only">{title}</p>
      )}
    </form>
  );
}
