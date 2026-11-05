import type { SharedMaterialUsage } from "@/dtos/shared-material.dto";

/**
 * "3 tiết thực hành (1 đã giao cho lớp), 2 bài ôn nhẹ" — null khi không ở tiết
 * nào, để câu cảnh báo bỏ hẳn phần số tiết.
 */
export function formatLessonUsage(usage: SharedMaterialUsage): string | null {
  const parts: string[] = [];
  if (usage.lessonCount > 0) {
    parts.push(
      `${usage.lessonCount} tiết thực hành` +
        (usage.assignedLessonCount > 0
          ? ` (${usage.assignedLessonCount} đã giao cho lớp)`
          : ""),
    );
  }
  if (usage.quizLessonCount > 0) {
    parts.push(`${usage.quizLessonCount} bài ôn nhẹ`);
  }
  return parts.length ? parts.join(", ") : null;
}
