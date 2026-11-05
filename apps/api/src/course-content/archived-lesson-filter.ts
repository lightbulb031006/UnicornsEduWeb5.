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

// Item còn trong tập tiết của lớp: chưa gỡ khỏi lớp và tiết chưa lưu trữ. Item đã gỡ
// biến mất ở mọi phía (kể cả gia sư/admin); Ẩn tay vẫn hiện với gia sư.
export const PRESENT_CONTENT_ITEM = {
  removedAt: null,
  ...NOT_ARCHIVED_CONTENT_ITEM,
} satisfies Prisma.ClassContentItemWhereInput;

export const PRESENT_TIMELINE_ITEM = {
  NOT: {
    classContentItem: {
      is: {
        OR: [{ removedAt: { not: null } }, { lesson: { is: ARCHIVED_LESSON } }],
      },
    },
  },
} satisfies Prisma.ClassTimelineItemWhereInput;
