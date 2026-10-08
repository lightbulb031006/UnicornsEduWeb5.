import type { TeacherSurveyWarning } from "@/dtos/survey.dto";

const STAFF_CLASS_DETAIL_PATH = /^\/staff\/classes\/([^/]+)\/?$/;

/** Lớp có ít nhất một bài khảo sát đang trong khung **chặn khảo sát sắp hạn**. */
export function getSurveyBlockedClassIds(warnings: TeacherSurveyWarning[]): Set<string> {
  return new Set(
    warnings
      .filter((warning) => warning.pendingSurveys.some((survey) => survey.blocking))
      .map((warning) => warning.classId),
  );
}

/**
 * Đang ở trang chi tiết của một lớp bị chặn: popup chặn phải nhường chỗ để gia sư
 * nộp khảo sát ngay tại trang đó.
 */
export function isOnSurveyBlockedClassPage(
  pathname: string | null,
  blockedClassIds: Set<string>,
): boolean {
  const match = pathname?.match(STAFF_CLASS_DETAIL_PATH);
  if (!match) return false;
  try {
    return blockedClassIds.has(decodeURIComponent(match[1]));
  } catch {
    return false;
  }
}
