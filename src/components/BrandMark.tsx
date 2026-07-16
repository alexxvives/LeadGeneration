export function BrandMark({
  size = "md",
  withWordmark = true,
}: {
  size?: "sm" | "md" | "lg";
  withWordmark?: boolean;
}) {
  const dims = size === "lg" ? "h-10 w-10" : size === "sm" ? "h-6 w-6" : "h-8 w-8";
  const text =
    size === "lg" ? "text-2xl" : size === "sm" ? "text-lg" : "text-[1.35rem]";
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className={`relative grid place-items-center overflow-hidden rounded-xl bg-ink-800 ${dims} ring-1 ring-white/10`}
        aria-hidden
      >
        <span className="absolute inset-0 rounded-xl aurora-glow opacity-70" />
        <svg
          viewBox="0 0 32 32"
          className="relative h-[70%] w-[70%] text-aurora-300"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Navigation beacon — L + rising path */}
          <path
            d="M8 6v16.5c0 1.1.9 2 2 2h10.5"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M14 18.5c2.2-3.4 4.6-5.2 8-5.8"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            opacity="0.85"
          />
          <circle cx="23.5" cy="11.5" r="2.2" fill="currentColor" />
          <circle cx="23.5" cy="11.5" r="3.8" stroke="currentColor" strokeWidth="1" opacity="0.35" />
        </svg>
      </span>
      {withWordmark && (
        <span
          className={`font-brand font-semibold tracking-[-0.03em] text-mist-100 ${text}`}
        >
          Leadify
        </span>
      )}
    </span>
  );
}
