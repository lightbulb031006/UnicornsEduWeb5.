import { Prisma } from '../../generated/client';
import { ClassContentHiddenReason, LessonKind } from 'generated/enums';
import { appendClassTimelineContentItems } from 'src/class-timeline/append-timeline-item';

type Tx = Prisma.TransactionClient;

/**
 * Đưa mọi tiết lý thuyết (chưa lưu trữ) của một chuyên đề vào nội dung lớp:
 * tạo `ClassContentItem` + dòng timeline cho tiết còn thiếu, theo thứ tự tiết.
 * Item đã có (kể cả đang ẩn) giữ nguyên. Idempotent; tiết thực hành không bị đụng tới.
 * Trả ID item vừa tạo.
 */
export async function syncClassModuleTheoryLessons(
  tx: Tx,
  input: { classId: string; moduleId: string },
): Promise<string[]> {
  const { classId, moduleId } = input;
  const lessons = await tx.lesson.findMany({
    where: { moduleId, kind: LessonKind.theory, archivedAt: null },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });
  if (lessons.length === 0) return [];

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
 * Gỡ chuyên đề: ẩn mềm mọi item đang hiện của chuyên đề trong lớp (lý thuyết lẫn lần giao
 * thực hành) cùng dòng timeline, lý do `module_removed`. Attempt/điểm giữ nguyên.
 */
export async function hideClassModuleItems(
  tx: Tx,
  input: {
    classId: string;
    moduleId: string;
    hiddenAt: Date;
    hiddenByStaffId: string | null;
  },
): Promise<string[]> {
  const { classId, moduleId, hiddenAt, hiddenByStaffId } = input;
  const items = await tx.classContentItem.findMany({
    where: { classId, hiddenAt: null, lesson: { moduleId } },
    select: { id: true },
  });
  const itemIds = items.map((item) => item.id);
  if (itemIds.length === 0) return [];
  await tx.classContentItem.updateMany({
    where: { id: { in: itemIds } },
    data: {
      hiddenAt,
      hiddenByStaffId,
      hiddenReason: ClassContentHiddenReason.module_removed,
    },
  });
  await tx.classTimelineItem.updateMany({
    where: { classContentItemId: { in: itemIds } },
    data: { hiddenAt, hiddenByStaffId },
  });
  return itemIds;
}

/**
 * Thêm lại chuyên đề: chỉ hiện lại item bị ẩn **do gỡ chuyên đề**. Item gia sư tự ẩn
 * (`manual`) và tiết đã lưu trữ giữ nguyên.
 */
export async function restoreClassModuleItems(
  tx: Tx,
  input: { classId: string; moduleId: string },
): Promise<string[]> {
  const { classId, moduleId } = input;
  const items = await tx.classContentItem.findMany({
    where: {
      classId,
      hiddenReason: ClassContentHiddenReason.module_removed,
      lesson: { moduleId, archivedAt: null },
    },
    select: { id: true },
  });
  const itemIds = items.map((item) => item.id);
  if (itemIds.length === 0) return [];
  await tx.classContentItem.updateMany({
    where: { id: { in: itemIds } },
    data: { hiddenAt: null, hiddenByStaffId: null, hiddenReason: null },
  });
  await tx.classTimelineItem.updateMany({
    where: { classContentItemId: { in: itemIds } },
    data: { hiddenAt: null, hiddenByStaffId: null },
  });
  return itemIds;
}

/** Tiết lý thuyết mới vào chuyên đề → có mặt trên mọi lớp đã thêm chuyên đề đó. */
export async function syncNewTheoryLessonToClasses(
  tx: Tx,
  moduleId: string,
): Promise<void> {
  const classModules = await tx.classModule.findMany({
    where: { moduleId },
    select: { classId: true },
  });
  for (const { classId } of classModules) {
    await syncClassModuleTheoryLessons(tx, { classId, moduleId });
  }
}
