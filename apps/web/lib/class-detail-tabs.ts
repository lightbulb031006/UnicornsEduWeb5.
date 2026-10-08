/**
 * Tab trang chi tiết lớp admin/staff, lưu trên `?tab=` (cùng slug với tab lớp học sinh).
 * Khác học sinh: staff xem Buổi học trước, nên Buổi học là tab đầu và mặc định.
 */
export type ClassDetailTab = "buoi-hoc" | "chuyen-de";

export const CLASS_DETAIL_TABS: readonly ClassDetailTab[] = [
  "buoi-hoc",
  "chuyen-de",
];

export const CLASS_DETAIL_TAB_LABELS: Record<ClassDetailTab, string> = {
  "buoi-hoc": "Buổi học",
  "chuyen-de": "Chuyên đề",
};

/** Giá trị lạ hoặc thiếu → Buổi học. `content` là slug cũ của tab nội dung. */
export function parseClassDetailTab(
  value: string | null | undefined,
): ClassDetailTab {
  return value === "chuyen-de" || value === "content" ? "chuyen-de" : "buoi-hoc";
}

export function staffClassDetailHref(
  classId: string,
  tab: ClassDetailTab = "buoi-hoc",
): string {
  return `/staff/classes/${classId}?tab=${tab}`;
}
