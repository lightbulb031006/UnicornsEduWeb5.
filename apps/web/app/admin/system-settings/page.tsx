"use client";

import { Suspense } from "react";
import { SystemSettingsWorkspace } from "@/components/admin/system-settings/SystemSettingsWorkspace";

export default function AdminSystemSettingsPage() {
  // SystemSettingsWorkspace dùng useSearchParams -> cần <Suspense>.
  return (
    <Suspense fallback={null}>
      <SystemSettingsWorkspace />
    </Suspense>
  );
}
