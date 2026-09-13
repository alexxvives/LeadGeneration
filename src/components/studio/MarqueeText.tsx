"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Spotify-style ping-pong: overflow text eases left, pauses, then back. */
export function MarqueeText({
  children,
  className = "",
  title,
}: {
  children: string;
  className?: string;
  title?: string;
}) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);
  const [duration, setDuration] = useState(8);

  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    const text = textRef.current;
    if (!wrap || !text) return;
    const overflow = text.scrollWidth - wrap.clientWidth;
    setShift(overflow > 4 ? overflow : 0);
    setDuration(Math.max(6, overflow / 24));
  }, []);

  useEffect(() => {
    measure();
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    if (textRef.current) ro.observe(textRef.current);
    return () => ro.disconnect();
  }, [children, measure]);

  return (
    <span
      ref={wrapRef}
      title={title ?? children}
      className={`block min-w-0 overflow-hidden whitespace-nowrap ${className}`}
    >
      <span
        ref={textRef}
        className={shift > 0 ? "inline-block animate-marquee-x" : "inline-block"}
        style={
          shift > 0
            ? {
                ["--marquee-shift" as string]: `-${shift}px`,
                ["--marquee-duration" as string]: `${duration}s`,
              }
            : undefined
        }
      >
        {children}
      </span>
    </span>
  );
}
