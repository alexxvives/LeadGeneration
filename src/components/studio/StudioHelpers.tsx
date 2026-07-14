"use client";

import Image from "next/image";
import { Spinner } from "@/components/ui";
import { SparkIcon } from "@/components/icons";

export function LayoutToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 font-medium transition-colors ${
        active ? "bg-white/10 text-mist-100" : "text-mist-500 hover:text-mist-300"
      }`}
    >
      {children}
    </button>
  );
}

export function EmptyState({
  onLoadDemo,
  running,
}: {
  onLoadDemo: () => void;
  running: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl2 border border-white/10">
      <Image
        src="/images/empty-aurora.jpg"
        alt=""
        width={1600}
        height={900}
        className="h-72 w-full object-cover opacity-60 sm:h-[22rem]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/70 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-8">
        <SparkIcon className="h-7 w-7 text-aurora-300" />
        <h2 className="mt-3 font-display text-2xl font-semibold">Your board is clear</h2>
        <p className="mt-1 max-w-lg text-mist-300">
          Run a live search above, or load sample leads to try the approve → send flow
          without spending provider credits.
        </p>
        <button
          type="button"
          onClick={onLoadDemo}
          disabled={running}
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-aurora-400 px-5 py-2.5 text-sm font-medium text-ink-950 transition-transform hover:scale-[1.03] disabled:opacity-50"
        >
          {running ? <Spinner className="h-4 w-4" /> : <SparkIcon className="h-4 w-4" />}
          Load demo data
        </button>
      </div>
    </div>
  );
}
