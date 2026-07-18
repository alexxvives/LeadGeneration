import Image from "next/image";

export function BrandMark({
  size = "md",
  withWordmark = true,
}: {
  size?: "sm" | "md" | "lg";
  withWordmark?: boolean;
}) {
  const dims =
    size === "lg" ? "h-12 w-12" : size === "sm" ? "h-7 w-7" : "h-9 w-9";
  const px = size === "lg" ? 48 : size === "sm" ? 28 : 36;
  const text =
    size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-[1.25rem]";
  const mailText =
    size === "lg" ? "text-sm" : size === "sm" ? "text-[10px]" : "text-xs";

  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className={`relative grid place-items-center overflow-hidden ${dims}`}
        aria-hidden
      >
        <Image
          src="/hermesmail_logo.png"
          alt=""
          width={px}
          height={px}
          className="h-full w-full object-contain"
          priority
          unoptimized
        />
      </span>
      {withWordmark && (
        <span className={`font-brand leading-none ${text}`}>
          <span className="font-semibold tracking-[0.04em] text-mist-100">
            HERMES
          </span>
          <span
            className={`ml-1.5 font-semibold tracking-[0.04em] text-aurora-300 ${mailText}`}
          >
            mail
          </span>
        </span>
      )}
    </span>
  );
}
