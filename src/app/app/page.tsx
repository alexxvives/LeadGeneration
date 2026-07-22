import { Suspense } from "react";
import { Studio } from "@/components/studio/Studio";
import { StudioViewSkeleton } from "@/components/studio/skeletons";

export const dynamic = "force-dynamic";

export default function StudioPage() {
  return (
    <Suspense fallback={<StudioViewSkeleton view="pipeline" />}>
      <Studio />
    </Suspense>
  );
}
