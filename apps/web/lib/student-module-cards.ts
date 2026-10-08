import type {
  ClassContentItemDto,
  ClassContentModuleGroupDto,
} from "@/dtos/class-content.dto";
import {
  studentAssignmentHref,
  studentLessonHref,
} from "@/lib/course-content-routes";

/** Key ổn định của thẻ chuyên đề; nhóm ngoài chuyên đề (`moduleId: null`) dùng chung một key. */
export function moduleCardKey(
  group: Pick<ClassContentModuleGroupDto, "moduleId">,
) {
  return group.moduleId ?? "ungrouped";
}

/** localStorage key nhớ thẻ chuyên đề đang mở, tách theo lớp. */
export function openModuleCardsStorageKey(classId: string) {
  return `student-class-open-modules:${classId}`;
}

/** Đọc giá trị đã lưu; thiếu, hỏng JSON hoặc sai kiểu → không thẻ nào mở. */
export function parseOpenModuleCards(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value)
      ? value.filter((key): key is string => typeof key === "string")
      : [];
  } catch {
    return [];
  }
}

export function toggleOpenModuleCard(open: string[], key: string): string[] {
  return open.includes(key)
    ? open.filter((item) => item !== key)
    : [...open, key];
}

/** Tiết thực hành chưa tới `openAt` thì khoá (vẫn hiện trong thẻ). */
export function isLockedModuleItem(item: ClassContentItemDto) {
  return item.lessonKind === "practice" && !item.isOpen;
}

/** Lý thuyết → trang tiết; thực hành → trang bài theo id lần giao. */
export function moduleItemHref(classId: string, item: ClassContentItemDto) {
  return item.lessonKind === "practice"
    ? studentAssignmentHref(classId, item.id)
    : studentLessonHref(classId, item.lessonId);
}

/** Thứ tự hiện trong thẻ: tiết lý thuyết rồi tiết thực hành đã giao. */
export function moduleCardItems(group: ClassContentModuleGroupDto) {
  return [...group.theoryItems, ...group.practiceItems];
}
