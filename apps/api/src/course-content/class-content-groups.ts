import type {
  ClassContentItemResponseDto,
  ClassContentModuleGroupDto,
} from 'src/dtos/course-content.dto';

export const UNGROUPED_CONTENT_TITLE = 'Ngoài chuyên đề';

/**
 * Gom nội dung lớp theo chuyên đề. Nhóm lấy từ **tập tiết của lớp** (ADR
 * 2026-10-18-class-content-as-lesson-set): chuyên đề hiện khi lớp có ít nhất một tiết của nó.
 * Item đã gỡ khỏi lớp (`removedAt`) bị lọc từ truy vấn nên không tới đây.
 * `items` đã sắp bằng `compareClassContentItems` nên giữ nguyên thứ tự trong nhóm.
 * Thứ tự nhóm theo `groupOrder` (`class_modules.sort_order`); nhóm chưa có thứ tự đứng
 * đầu. Item không có chuyên đề vào nhóm cuối `moduleId: null`.
 */
export function groupClassContentByModule(
  items: ClassContentItemResponseDto[],
  groupOrder: ReadonlyMap<string, number>,
): ClassContentModuleGroupDto[] {
  const byModule = new Map<
    string | null,
    { title: string; items: ClassContentItemResponseDto[] }
  >();
  for (const item of items) {
    const key = item.moduleId ?? null;
    const bucket = byModule.get(key) ?? {
      title: item.moduleTitle ?? UNGROUPED_CONTENT_TITLE,
      items: [],
    };
    bucket.items.push(item);
    byModule.set(key, bucket);
  }

  const toGroup = (moduleId: string | null): ClassContentModuleGroupDto => {
    const bucket = byModule.get(moduleId)!;
    return {
      moduleId,
      title: moduleId === null ? UNGROUPED_CONTENT_TITLE : bucket.title,
      added: moduleId !== null,
      theoryItems: bucket.items.filter((item) => item.lessonKind === 'theory'),
      practiceItems: bucket.items.filter(
        (item) => item.lessonKind === 'practice',
      ),
    };
  };

  const rank = (moduleId: string) =>
    groupOrder.get(moduleId) ?? Number.NEGATIVE_INFINITY;
  const groups = [...byModule.keys()]
    .filter((moduleId): moduleId is string => moduleId !== null)
    .toSorted((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map(toGroup);

  if (byModule.has(null)) groups.push(toGroup(null));
  return groups;
}
