"use client";

import type { Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface ContactIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface ContactIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const CIRCLE_VARIANTS: Variants = {
  normal: { scale: 1 },
  animate: {
    scale: [1, 1.15, 1],
    transition: { duration: 0.35 },
  },
};

const ContactIcon = forwardRef<ContactIconHandle, ContactIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
    const controls = useAnimation();
    const isControlledRef = useRef(false);

    useImperativeHandle(ref, () => ({
      startAnimation: () => controls.start("animate"),
      stopAnimation: () => void controls.start("normal"),
    }));

    const handleMouseEnter = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseEnter?.(e);
        } else {
          controls.start("animate");
        }
      },
      [controls, onMouseEnter],
    );

    const handleMouseLeave = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseLeave?.(e);
        } else {
          controls.start("normal");
        }
      },
      [controls, onMouseLeave],
    );

    return (
      <div
        className={cn(className)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        <svg
          fill="none"
          height={size}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M16 2v2" />
          <path d="M8 2v2" />
          <rect height="18" rx="2" width="18" x="3" y="4" />
          <motion.circle
            animate={controls}
            cx="12"
            cy="11"
            r="2"
            variants={CIRCLE_VARIANTS}
          />
          <path d="M8 17a4 4 0 0 1 8 0" />
        </svg>
      </div>
    );
  },
);

ContactIcon.displayName = "ContactIcon";

export { ContactIcon };
