import type { ClassTimelineKind } from "@/dtos/class-timeline.dto";

/** Tab trang lớp học sinh, lưu trên `?tab=` (slug tiếng Việt như `?tab=noi-dung` của khoá). */
export type StudentClassTab = "chuyen-de" | "buoi-hoc";

export const STUDENT_CLASS_TABS: readonly StudentClassTab[] = [
  "chuyen-de",
  "buoi-hoc",
];

export const STUDENT_CLASS_TAB_LABELS: Record<StudentClassTab, string> = {
  "chuyen-de": "Chuyên đề",
  "buoi-hoc": "Buổi học",
};

export const STUDENT_CLASS_TAB_EMPTY_MESSAGES: Record<StudentClassTab, string> =
  {
    "chuyen-de": "Lớp chưa có chuyên đề nào.",
    "buoi-hoc": "Chưa có buổi học hay khảo sát.",
  };

/** Giá trị lạ, thiếu hoặc legacy (`lessons`) → tab mặc định Chuyên đề. */
export function parseStudentClassTab(
  value: string | null | undefined,
): StudentClassTab {
  return value === "buoi-hoc" ? "buoi-hoc" : "chuyen-de";
}

/** Tiết học thuộc tab Chuyên đề; buổi học và khảo sát thuộc tab Buổi học. */
export function studentClassTabOfKind(
  kind: ClassTimelineKind,
): StudentClassTab {
  return kind === "content_item" ? "chuyen-de" : "buoi-hoc";
}
