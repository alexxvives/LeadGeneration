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

/**
 * Marketing-page sign-in overlay. CTAs call openSignIn() instead of navigating
 * to /login (middleware can still send unauthenticated /app traffic to /login).
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

  const openSignIn = useCallback(() => {
    setOpen(true);
  }, []);

  return (
    <Ctx.Provider value={{ openSignIn }}>
      {children}
      <Suspense fallback={null}>
        <SignInQuerySync open={open} setOpen={setOpen} />
      </Suspense>
      <AuthModal
        open={open}
        onClose={() => setOpen(false)}
        authRequired={authRequired}
        credentialsMode={!authRequired}
        magicLink={magicLink}
        turnstileSiteKey={turnstileSiteKey}
        callbackUrl="/app"
        allowGuest={!authRequired}
        dismissible
      />
    </Ctx.Provider>
  );
}

/** Opens modal from `?signin=1` and clears the query when dismissed. */
function SignInQuerySync({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (searchParams.get("signin") === "1") setOpen(true);
  }, [searchParams, setOpen]);

  useEffect(() => {
    if (open || !searchParams.get("signin")) return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete("signin");
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
