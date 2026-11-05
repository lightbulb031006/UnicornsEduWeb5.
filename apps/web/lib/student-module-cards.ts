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

export interface ModuleTocEntry {
  id: string;
  /** Số thứ tự trong chuyên đề, đánh lại từ 1 ở mỗi nhóm. */
  index: number;
  title: string;
  lessonKind: "theory" | "practice" | null;
  locked: boolean;
}

/** Id mục lục của thẻ chuyên đề (có tiền tố để không trùng id tiết). */
export function moduleTocId(key: string) {
  return `module:${key}`;
}

export interface ModuleTocSection {
  key: string;
  /** Id để mục lục cuộn tới thẻ chuyên đề (`moduleTocId`). */
  id: string;
  title: string;
  entries: ModuleTocEntry[];
}

/**
 * Mục lục tab Chuyên đề: mỗi chuyên đề là một nhóm (tên chuyên đề làm đầu
 * nhóm, bấm được), các tiết nằm dưới theo thứ tự thẻ. Chuyên đề chưa có tiết
 * vẫn giữ để học sinh nhảy tới thẻ.
 */
export function buildModuleTocSections(
  groups: ClassContentModuleGroupDto[],
): ModuleTocSection[] {
  return groups.map((group) => {
    const key = moduleCardKey(group);
    return {
      key,
      id: moduleTocId(key),
      title: group.title,
      entries: moduleCardItems(group).map((item, index) => ({
        id: item.id,
        index: index + 1,
        title: item.title,
        lessonKind: item.lessonKind,
        locked: isLockedModuleItem(item),
      })),
    };
  });
}
