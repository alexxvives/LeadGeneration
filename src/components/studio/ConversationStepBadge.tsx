import type { SVGProps } from "react";
import type { ConversationBucket } from "@/lib/types";
import { conversationBucketMeta } from "@/lib/conversation-steps";
import { DemoIcon } from "@/components/icons";

function StepGlyph({
  bucket,
  ...props
}: SVGProps<SVGSVGElement> & { bucket: ConversationBucket }) {
  if (bucket === "waiting_on_demo") return <DemoIcon {...props} />;
  if (bucket === "reviewing_contract") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
        <path d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5Z" />
        <path d="M14 3.5V8h4.5M8 12h8M8 16h5" strokeLinecap="round" />
      </svg>
    );
  }
  if (bucket === "onboarding") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
        <rect x="4" y="3.5" width="16" height="17" rx="2" />
        <path d="M8 8h8M8 12h8M8 16h4" strokeLinecap="round" />
      </svg>
    );
  }
  if (bucket === "pending_delivery") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
        <path d="M3.5 8.5 12 4.5l8.5 4v7L12 19.5l-8.5-4v-7Z" strokeLinejoin="round" />
        <path d="M12 12.5v7M3.5 8.5 12 12.5l8.5-4" strokeLinejoin="round" />
      </svg>
    );
  }
  if (bucket === "unresponsive") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v4.5l3 2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M8.5 12.5 11 15l4.5-5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Colored mark for the in-conversation bucket a lead is in. */
export function ConversationStepBadge({
  bucket,
}: {
  bucket: ConversationBucket;
}) {
  const meta = conversationBucketMeta(bucket);
  return (
    <span
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${meta.bubbleClass}`}
      title={meta.label}
      aria-label={meta.label}
    >
      <StepGlyph bucket={bucket} className="h-3.5 w-3.5" />
    </span>
  );
}
