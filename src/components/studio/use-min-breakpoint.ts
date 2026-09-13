"use client";

import { useEffect, useState } from "react";

const QUERIES = {
  sm: "(min-width: 640px)",
  md: "(min-width: 768px)",
  lg: "(min-width: 1024px)",
  xl: "(min-width: 1280px)",
} as const;

/**
 * Tailwind min-width match. First paint is `false` (narrow) so phone chrome
 * does not wait on hydration; desktop snaps to the wide layout after mount.
 */
export function useMinBreakpoint(bp: keyof typeof QUERIES): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(QUERIES[bp]);
    const apply = () => setMatches(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [bp]);
  return matches;
}
