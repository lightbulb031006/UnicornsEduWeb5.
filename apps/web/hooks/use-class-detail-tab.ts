"use client";

import { useCallback, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { replaceCourseWorkspaceUrl } from "@/lib/course-content-routes";
import {
  parseClassDetailTab,
  type ClassDetailTab,
} from "@/lib/class-detail-tabs";

/** Tab trang chi tiết lớp admin/staff đồng bộ `?tab=`, không thêm mục lịch sử trình duyệt. */
export function useClassDetailTab(): [ClassDetailTab, (tab: ClassDetailTab) => void] {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlTab = parseClassDetailTab(searchParams.get("tab"));
  // Đổi tab ngay khi bấm, không chờ Next.js commit URL.
  const [pendingTab, setPendingTab] = useState<ClassDetailTab | null>(null);
  if (pendingTab !== null && pendingTab === urlTab) {
    setPendingTab(null);
  }
  const activeTab = pendingTab ?? urlTab;

  const selectTab = useCallback(
    (tab: ClassDetailTab) => {
      if (tab === activeTab) return;
      const next = new URLSearchParams(searchParams.toString());
      next.set("tab", tab);
      setPendingTab(tab);
      replaceCourseWorkspaceUrl(`${pathname}?${next.toString()}`);
    },
    [activeTab, pathname, searchParams],
  );

  return [activeTab, selectTab];
}
