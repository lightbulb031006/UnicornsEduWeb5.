import type { ClassContentModuleGroupDto } from "@/dtos/class-content.dto";
import type { ClassTimelineItemDto } from "@/dtos/class-timeline.dto";
import { moduleCardKey } from "@/lib/student-module-cards";

/** Chuẩn hoá để so khớp không phân biệt hoa thường, dấu tiếng Việt (kể cả `đ`). */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

/** `keyword` đã chuẩn hoá; rỗng thì mọi chuỗi đều khớp. */
export function matchesSearch(text: string, keyword: string): boolean {
  return !keyword || normalizeSearchText(text).includes(keyword);
}

/**
 * Chữ dùng để tìm thẻ buổi học / khảo sát: tiêu đề + nội dung hiện trên thẻ
 * (bỏ thẻ HTML của rich text để không khớp nhầm tên tag).
 */
export function timelineItemSearchText(item: ClassTimelineItemDto): string {
  const parts = [
    item.title,
    item.session?.lessonContent,
    item.session?.homework,
    item.session?.tutorial,
    item.session?.teacherName,
    item.survey?.surveyName,
  ];
  return parts
    .filter((part): part is string => Boolean(part))
    .join(" ")
    .replace(/<[^>]*>/g, " ");
}

/**
 * Lọc thẻ chuyên đề theo từ khoá đã chuẩn hoá: tên chuyên đề khớp thì giữ đủ tiết,
 * không thì chỉ giữ tiết có tên khớp; thẻ không còn tiết nào khớp bị bỏ.
 */
export function filterModuleGroups(
  groups: ClassContentModuleGroupDto[],
  keyword: string,
): ClassContentModuleGroupDto[] {
  if (!keyword) return groups;
  return groups.flatMap((group) => {
    if (matchesSearch(group.title, keyword)) return [group];
    const theoryItems = group.theoryItems.filter((item) =>
      matchesSearch(item.title, keyword),
    );
    const practiceItems = group.practiceItems.filter((item) =>
      matchesSearch(item.title, keyword),
    );
    return theoryItems.length || practiceItems.length
      ? [{ ...group, theoryItems, practiceItems }]
      : [];
  });
}

/**
 * Thẻ mở khi đang tìm: mọi thẻ khớp đều mở, trừ thẻ người dùng tự thu gọn trong
 * lần tìm này. Không đụng tới thẻ mở đã lưu (`localStorage`).
 */
export function searchOpenModuleKeys(
  groups: ClassContentModuleGroupDto[],
  collapsed: ReadonlySet<string>,
): Set<string> {
  return new Set(
    groups.map(moduleCardKey).filter((key) => !collapsed.has(key)),
  );
}
