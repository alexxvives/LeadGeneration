"use client";

import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Mount children into a phone top-bar hole (`studio-phone-search` / `studio-phone-live`). */
export function PhoneTopBarSlot({
  id,
  children,
}: {
  id: "studio-phone-search" | "studio-phone-live";
  children: ReactNode;
}) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setEl(document.getElementById(id));
  }, [id]);
  if (!el) return null;
  return createPortal(children, el);
}
