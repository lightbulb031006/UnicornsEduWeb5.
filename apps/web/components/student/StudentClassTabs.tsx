"use client";

import ClassTabList from "@/components/class-timeline/ClassTabList";
import {
  STUDENT_CLASS_TAB_LABELS,
  STUDENT_CLASS_TABS,
  type StudentClassTab,
} from "@/lib/student-class-tabs";

/** Thanh tab Chuyên đề / Buổi học, cùng kiểu pill với tab trang khoá học. */
export default function StudentClassTabs({
  activeTab,
  counts,
  onSelect,
}: {
  activeTab: StudentClassTab;
  /** Thiếu số của tab (đang tải) thì ẩn badge. */
  counts: Partial<Record<StudentClassTab, number>>;
  onSelect: (tab: StudentClassTab) => void;
}) {
  return (
    <ClassTabList
      tabs={STUDENT_CLASS_TABS}
      labels={STUDENT_CLASS_TAB_LABELS}
      activeTab={activeTab}
      counts={counts}
      onSelect={onSelect}
      idPrefix="student-class-tab"
      panelId="student-class-tabpanel"
      ariaLabel="Nội dung lớp học"
    />
  );
}
