import type {
  ClassContentItemResponseDto,
  ClassContentModuleGroupDto,
} from 'src/dtos/course-content.dto';

export interface GroupableModule {
  id: string;
  title: string;
  /** Thứ tự nhóm của lớp (`class_modules.sort_order`). */
  sortOrder: number;
  /** Lớp đang thêm chuyên đề này. */
  added: boolean;
}

export const UNGROUPED_CONTENT_TITLE = 'Ngoài chuyên đề';

/**
 * Gom nội dung lớp theo chuyên đề. `items` đã sắp bằng `compareClassContentItems`
 * (lý thuyết theo `order`, rồi thực hành theo `sortOrder` item) nên giữ nguyên thứ tự.
 * Nhóm: chỉ chuyên đề lớp đang có (kể cả rỗng), theo thứ tự nhóm của lớp; item của
 * chuyên đề đã gỡ bị bỏ (coi như chưa từng thêm). Item không có chuyên đề vào nhóm cuối
 * `moduleId: null`.
 */
export function groupClassContentByModule(
  items: ClassContentItemResponseDto[],
  modules: GroupableModule[],
): ClassContentModuleGroupDto[] {
  const byModule = new Map<string | null, ClassContentItemResponseDto[]>();
  for (const item of items) {
    const key = item.moduleId ?? null;
    const bucket = byModule.get(key) ?? [];
    bucket.push(item);
    byModule.set(key, bucket);
  }

  const toGroup = (
    moduleId: string | null,
    title: string,
    added: boolean,
  ): ClassContentModuleGroupDto => {
    const groupItems = byModule.get(moduleId) ?? [];
    return {
      moduleId,
      title,
      added,
      theoryItems: groupItems.filter((item) => item.lessonKind === 'theory'),
      practiceItems: groupItems.filter(
        (item) => item.lessonKind === 'practice',
      ),
    };
  };

  const groups = modules
    .filter((module) => module.added)
    .toSorted((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
    .map((module) => toGroup(module.id, module.title, module.added));

  if (byModule.has(null)) {
    groups.push(toGroup(null, UNGROUPED_CONTENT_TITLE, false));
  }
  return groups;
}
