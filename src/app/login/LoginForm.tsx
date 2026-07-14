"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { ArrowIcon, MailIcon } from "@/components/icons";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const rendered = useRef(false);

  // Explicitly render the Turnstile widget once its script is ready.
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

  const useCredentials = credentialsMode; // dev uses password; prod uses magic link

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
      // Turnstile bot check (production only — no-op when not configured).
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
          router.push(callbackUrl);
          router.refresh();
        }
      } else {
        const provider = preferSmtp ? "nodemailer" : "resend";
        const primary = await signIn(provider, {
          email: trimmed,
          redirect: false,
          redirectTo: callbackUrl,
        });
        if (primary?.error && preferSmtp) {
          await signIn("resend", {
            email: trimmed,
            redirect: false,
            redirectTo: callbackUrl,
          });
        } else if (primary?.error && !preferSmtp) {
          await signIn("nodemailer", {
            email: trimmed,
            redirect: false,
            redirectTo: callbackUrl,
          });
        }
        setSent(true);
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
        </p>
      </div>
    );
  }

  return (
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
            <span className="font-normal text-mist-500">(any value — dev mode)</span>
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-lg border border-white/10 bg-ink-900/60 px-4 py-3 text-mist-100 outline-none transition-colors placeholder:text-mist-500 focus:border-aurora-400/60"
          />
        </label>
      )}

      {turnstileSiteKey && <div ref={widgetRef} className="min-h-[65px]" />}

      {error && (
        <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>
      )}

      {!useCredentials && !magicLink && (
        <p className="rounded-lg bg-amber-400/10 px-3 py-2 text-sm text-amber-200/80">
          No sign-in provider is configured. Set SMTP (Maileroo recommended) or{" "}
          <code>AUTH_RESEND_KEY</code> to enable magic-link login.
        </p>
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
  );
}
