import { Suspense } from "react";
import { Studio } from "@/components/studio/Studio";
import { Spinner } from "@/components/ui";

export default function StudioPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-[60vh] place-items-center">
          <Spinner className="h-8 w-8 text-aurora-400" />
        </div>
      }
    >
      <Studio />
    </Suspense>
  );
}
