import { SettingsSkeleton } from "@/components/studio/skeletons";

export default function SettingsLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading settings">
      <SettingsSkeleton />
    </div>
  );
}
