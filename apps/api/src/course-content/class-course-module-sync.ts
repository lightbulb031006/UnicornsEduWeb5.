import { Prisma } from '../../generated/client';
import { ClassContentHiddenReason, LessonKind } from 'generated/enums';
import { appendClassTimelineContentItems } from 'src/class-timeline/append-timeline-item';

type Tx = Prisma.TransactionClient;

/**
 * Thêm cả chuyên đề (chốt một lần): đưa mọi tiết lý thuyết + thực hành **đang có**
 * (chưa lưu trữ) của chuyên đề vào lớp — tạo `ClassContentItem` + dòng timeline cho
 * tiết còn thiếu, lý thuyết trước rồi thực hành, mỗi loại theo thứ tự tiết. Tiết
 * thực hành thành lần giao với `openAt`/`closeAt` truyền vào. Item đã có (kể cả
 * đang ẩn hoặc đã gỡ — đưa về bằng `restoreClassModuleItems`) giữ nguyên. Idempotent.
 * Trả ID item vừa tạo.
 */
export async function syncClassModuleLessons(
  tx: Tx,
  input: {
    classId: string;
    moduleId: string;
    openAt: Date;
    closeAt: Date | null;
  },
): Promise<string[]> {
  const { classId, moduleId, openAt, closeAt } = input;
  const ordered = await tx.lesson.findMany({
    where: { moduleId, archivedAt: null },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, kind: true },
  });
  if (ordered.length === 0) return [];
  const lessons = [
    ...ordered.filter((lesson) => lesson.kind !== LessonKind.practice),
    ...ordered.filter((lesson) => lesson.kind === LessonKind.practice),
  ];

  const existing = await tx.classContentItem.findMany({
    where: { classId, lessonId: { in: lessons.map((lesson) => lesson.id) } },
    select: { lessonId: true },
  });
  const existingLessonIds = new Set(existing.map((item) => item.lessonId));
  const missing = lessons.filter((lesson) => !existingLessonIds.has(lesson.id));

  const createdItemIds: string[] = [];
  if (missing.length > 0) {
    const maxSort = await tx.classContentItem.aggregate({
      where: { classId },
      _max: { sortOrder: true },
    });
    const baseSort = (maxSort._max.sortOrder ?? -1) + 1;
    // created_at lệch 1ms/tiết: timeline sắp theo thời gian giữ đúng thứ tự tiết.
    const baseMs = Date.now();
    for (const [idx, lesson] of missing.entries()) {
      const created = await tx.classContentItem.create({
        data: {
          classId,
          lessonId: lesson.id,
          kind: 'lesson',
          sortOrder: baseSort + idx,
          createdAt: new Date(baseMs + idx),
          ...(lesson.kind === LessonKind.practice
            ? { openAt, closeAt, shuffleQuestions: true }
            : {}),
        },
        select: { id: true },
      });
      createdItemIds.push(created.id);
    }
    await appendClassTimelineContentItems(tx, classId, createdItemIds);
  }

  return createdItemIds;
}

/**
 * Gỡ khỏi lớp (một tiết hoặc cả chuyên đề): đánh dấu `removedAt` mọi item **còn trong lớp**
 * khớp `where`. Item đang hiện bị ẩn kèm (lý do `module_removed`) cùng dòng timeline để mọi
 * truy vấn `hiddenAt` phía học sinh vẫn đúng; item đang Ẩn tay giữ `manual` để thêm lại vẫn ẩn.
 * Attempt/điểm/lượt xem giữ nguyên. Trả ID item đã gỡ.
 */
export async function removeClassContentItems(
  tx: Tx,
  input: {
    classId: string;
    where: Prisma.ClassContentItemWhereInput;
    removedAt: Date;
    hiddenByStaffId: string | null;
  },
): Promise<string[]> {
  const { classId, where, removedAt, hiddenByStaffId } = input;
  const items = await tx.classContentItem.findMany({
    where: { ...where, classId, removedAt: null },
    select: { id: true, hiddenAt: true },
  });
  const itemIds = items.map((item) => item.id);
  if (itemIds.length === 0) return [];
  const visibleIds = items
    .filter((item) => item.hiddenAt === null)
    .map((item) => item.id);
  await tx.classContentItem.updateMany({
    where: { id: { in: itemIds } },
    data: { removedAt },
  });
  if (visibleIds.length > 0) {
    await tx.classContentItem.updateMany({
      where: { id: { in: visibleIds } },
      data: {
        hiddenAt: removedAt,
        hiddenByStaffId,
        hiddenReason: ClassContentHiddenReason.module_removed,
      },
    });
    await tx.classTimelineItem.updateMany({
      where: { classContentItemId: { in: visibleIds } },
      data: { hiddenAt: removedAt, hiddenByStaffId },
    });
  }
  return itemIds;
}

/**
 * Thêm lại tiết/chuyên đề: đưa item đã gỡ khớp `where` về lớp (xoá `removedAt`). Chỉ item
 * bị ẩn **do gỡ** hiện lại; item từng Ẩn tay (`manual`) vẫn ẩn. Tiết đã lưu trữ bỏ qua.
 * Trả ID item đã đưa về.
 */
export async function restoreRemovedClassContentItems(
  tx: Tx,
  input: { classId: string; where: Prisma.ClassContentItemWhereInput },
): Promise<string[]> {
  const { classId, where } = input;
  const items = await tx.classContentItem.findMany({
    where: {
      ...where,
      classId,
      removedAt: { not: null },
      NOT: { lesson: { is: { archivedAt: { not: null } } } },
    },
    select: { id: true, hiddenReason: true },
  });
  const itemIds = items.map((item) => item.id);
  if (itemIds.length === 0) return [];
  const unhideIds = items
    .filter(
      (item) => item.hiddenReason === ClassContentHiddenReason.module_removed,
    )
    .map((item) => item.id);
  await tx.classContentItem.updateMany({
    where: { id: { in: itemIds } },
    data: { removedAt: null },
  });
  if (unhideIds.length > 0) {
    await tx.classContentItem.updateMany({
      where: { id: { in: unhideIds } },
      data: { hiddenAt: null, hiddenByStaffId: null, hiddenReason: null },
    });
    await tx.classTimelineItem.updateMany({
      where: { classContentItemId: { in: unhideIds } },
      data: { hiddenAt: null, hiddenByStaffId: null },
    });
  }
  return itemIds;
}

/** Gỡ cả chuyên đề: gỡ mọi item còn trong lớp của chuyên đề (lý thuyết lẫn lần giao). */
export function removeClassModuleItems(
  tx: Tx,
  input: {
    classId: string;
    moduleId: string;
    removedAt: Date;
    hiddenByStaffId: string | null;
  },
): Promise<string[]> {
  const { moduleId, ...rest } = input;
  return removeClassContentItems(tx, {
    ...rest,
    where: { lesson: { is: { moduleId } } },
  });
}

/** Thêm lại chuyên đề: đưa về mọi item đã gỡ của chuyên đề. */
export function restoreClassModuleItems(
  tx: Tx,
  input: { classId: string; moduleId: string },
): Promise<string[]> {
  return restoreRemovedClassContentItems(tx, {
    classId: input.classId,
    where: { lesson: { is: { moduleId: input.moduleId } } },
  });
}

/**
 * Bảo đảm lớp có dòng thứ tự nhóm cho chuyên đề. Chuyên đề mới vào lớp đứng đầu
 * danh sách nhóm (`sortOrder = min − 1`); dòng đã có giữ nguyên vị trí.
 */
export async function ensureClassModuleGroupOnTop(
  tx: Tx,
  classId: string,
  moduleId: string,
): Promise<void> {
  const existing = await tx.classModule.findUnique({
    where: { classId_moduleId: { classId, moduleId } },
    select: { id: true },
  });
  if (existing) return;
  const min = await tx.classModule.aggregate({
    where: { classId },
    _min: { sortOrder: true },
  });
  await tx.classModule.create({
    data: { classId, moduleId, sortOrder: (min._min.sortOrder ?? 1) - 1 },
  });
}
