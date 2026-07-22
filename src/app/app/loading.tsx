import { StudioViewSkeleton } from "@/components/studio/skeletons";

/** Route-level fallback while the studio chunk / Suspense boundary resolves. */
export default function AppLoading() {
  return <StudioViewSkeleton view="pipeline" />;
}
