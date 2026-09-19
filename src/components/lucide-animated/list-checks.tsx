"use client";

import type { Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import { cn } from "@/lib/utils";

export interface ListChecksIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface ListChecksIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const CHECK_VARIANTS: Variants = {
  normal: { pathLength: 1, opacity: 1 },
  animate: {
    pathLength: [0, 1],
    opacity: [0, 1],
    transition: { duration: 0.35 },
  },
};

const ListChecksIcon = forwardRef<ListChecksIconHandle, ListChecksIconProps>(
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
          <path d="M11 6h9" />
          <path d="M11 12h9" />
          <path d="M11 18h9" />
          <motion.path
            animate={controls}
            d="M4 6l1.5 1.5L8 5"
            initial="normal"
            variants={CHECK_VARIANTS}
          />
          <motion.path
            animate={controls}
            d="M4 12l1.5 1.5L8 11"
            initial="normal"
            variants={CHECK_VARIANTS}
          />
          <motion.path
            animate={controls}
            d="M4 18l1.5 1.5L8 17"
            initial="normal"
            variants={CHECK_VARIANTS}
          />
        </svg>
      </div>
    );
  },
);

ListChecksIcon.displayName = "ListChecksIcon";

export { ListChecksIcon };
