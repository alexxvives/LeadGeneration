import { StarIcon } from "./icons";

export function BrandMark({
  size = "md",
  withWordmark = true,
}: {
  size?: "sm" | "md" | "lg";
  withWordmark?: boolean;
}) {
  const dims = size === "lg" ? "h-10 w-10" : size === "sm" ? "h-6 w-6" : "h-8 w-8";
  const text = size === "lg" ? "text-2xl" : size === "sm" ? "text-lg" : "text-xl";
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className={`relative grid place-items-center rounded-xl bg-ink-800 ${dims} ring-1 ring-white/10`}
      >
        <span className="absolute inset-0 rounded-xl aurora-glow opacity-80" />
        <StarIcon className="relative h-1/2 w-1/2 text-aurora-300" />
      </span>
      {withWordmark && (
        <span className={`font-display font-semibold tracking-tight ${text}`}>
          Leadify
        </span>
      )}
    </span>
  );
}
