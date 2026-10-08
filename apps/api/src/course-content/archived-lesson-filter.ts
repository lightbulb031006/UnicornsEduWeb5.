import type { Prisma } from '../../generated/client';

// Tiết đã lưu trữ (tiết riêng lớp cũ, ADR 2026-10-02) không hiện ở màn nào.
// Dùng NOT để item/dòng timeline không gắn tiết (buổi học, khảo sát) vẫn giữ.
const ARCHIVED_LESSON: Prisma.LessonWhereInput = { archivedAt: { not: null } };

export const NOT_ARCHIVED_CONTENT_ITEM = {
  NOT: { lesson: { is: ARCHIVED_LESSON } },
} satisfies Prisma.ClassContentItemWhereInput;

export const NOT_ARCHIVED_TIMELINE_ITEM = {
  NOT: { classContentItem: { is: { lesson: { is: ARCHIVED_LESSON } } } },
} satisfies Prisma.ClassTimelineItemWhereInput;
