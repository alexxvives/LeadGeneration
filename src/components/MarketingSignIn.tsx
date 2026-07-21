"use client";

import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AuthModal } from "@/components/AuthModal";
import { ArrowIcon } from "@/components/icons";

type SignInCtx = { openSignIn: () => void };

const Ctx = createContext<SignInCtx>({ openSignIn: () => undefined });

export function useMarketingSignIn(): SignInCtx {
  return useContext(Ctx);
}

/** Same-origin path only (blocks open redirects via ?callbackUrl=). */
function safeCallbackUrl(raw: string | null | undefined): string {
  if (!raw) return "/app";
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  if (typeof window === "undefined") return "/app";
  try {
    const url = new URL(raw);
    if (url.origin !== window.location.origin) return "/app";
    return `${url.pathname}${url.search}` || "/app";
  } catch {
    return "/app";
  }
}

/**
 * Marketing-page sign-in overlay. CTAs + middleware (`/?signin=1`) open this;
 * `/login` redirects here for Auth.js `pages.signIn`.
 */
export function MarketingSignInProvider({
  children,
  authRequired,
  magicLink,
  turnstileSiteKey,
}: {
  children: ReactNode;
  authRequired: boolean;
  magicLink: boolean;
  turnstileSiteKey: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup" | "magic">(
    "signin",
  );
  const [callbackUrl, setCallbackUrl] = useState("/app");

  const openSignIn = useCallback(() => {
    setAuthMode("signin");
    setOpen(true);
  }, []);

  return (
    <Ctx.Provider value={{ openSignIn }}>
      {children}
      <Suspense fallback={null}>
        <SignInQuerySync
          open={open}
          setOpen={setOpen}
          setAuthMode={setAuthMode}
          setCallbackUrl={setCallbackUrl}
        />
      </Suspense>
      <AuthModal
        open={open}
        onClose={() => setOpen(false)}
        authRequired={authRequired}
        credentialsMode={!authRequired}
        magicLink={magicLink}
        turnstileSiteKey={turnstileSiteKey}
        callbackUrl={callbackUrl}
        allowGuest={!authRequired}
        dismissible
        initialMode={authMode}
      />
    </Ctx.Provider>
  );
}

/** Opens modal from `?signin=1` / `?insider=…` and clears those query params. */
function SignInQuerySync({
  open,
  setOpen,
  setAuthMode,
  setCallbackUrl,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  setAuthMode: (m: "signin" | "signup" | "magic") => void;
  setCallbackUrl: (v: string) => void;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const cb = searchParams.get("callbackUrl");
    if (cb) setCallbackUrl(safeCallbackUrl(cb));

    const insider = searchParams.get("insider");
    if (insider) {
      try {
        sessionStorage.setItem("hermes_insider_invite", insider);
      } catch {
        /* ignore */
      }
      setAuthMode("signup");
      setOpen(true);
    } else if (searchParams.get("signin") === "1") {
      setAuthMode("signin");
      setOpen(true);
    }
  }, [searchParams, setOpen, setAuthMode, setCallbackUrl]);

  useEffect(() => {
    if (open) return;
    if (
      !searchParams.get("signin") &&
      !searchParams.get("insider") &&
      !searchParams.get("callbackUrl") &&
      !searchParams.get("authError")
    ) {
      return;
    }
    const next = new URLSearchParams(searchParams.toString());
    next.delete("signin");
    next.delete("insider");
    next.delete("callbackUrl");
    next.delete("authError");
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [open, pathname, router, searchParams]);

  return null;
}

/** Primary marketing CTA — opens overlay when auth is required, else goes to /app. */
export function SignInCta({
  authRequired,
  className,
  children,
}: {
  authRequired: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const { openSignIn } = useMarketingSignIn();

  if (!authRequired) {
    return (
      <a href="/app" className={className}>
        {children ?? (
          <>
            Open the studio
            <ArrowIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </>
        )}
      </a>
    );
  }

  return (
    <button type="button" onClick={openSignIn} className={className}>
      {children ?? (
        <>
          Sign in
          <ArrowIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </>
      )}
    </button>
  );
}
