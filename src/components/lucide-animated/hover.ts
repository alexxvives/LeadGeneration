"use client";

import { useRef } from "react";

/** Imperative handle every lucide-animated icon exposes. */
export type IconMotionHandle = {
  startAnimation: () => void;
  stopAnimation: () => void;
};

/** Drive a lucide-animated icon from a parent hover/focus target. */
export function useIconMotion() {
  const ref = useRef<IconMotionHandle>(null);
  return {
    ref,
    bind: {
      onMouseEnter: () => ref.current?.startAnimation(),
      onMouseLeave: () => ref.current?.stopAnimation(),
      onFocus: () => ref.current?.startAnimation(),
      onBlur: () => ref.current?.stopAnimation(),
    },
  };
}
