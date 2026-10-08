import type { CourseWorkspaceRouteBase } from "@/dtos/course-workspace.dto";
import type { StudentClassTab } from "@/lib/student-class-tabs";

/**
 * Next.js page hrefs for the course content tree (admin / staff / student).
 *
 * Keep this module separate from `content-api-paths.ts` (Axios endpoints).
 */

/**
 * Đổi query trên cùng trang khoá (tab, chuyên đề) ngay lập tức.
 * `router.replace` chờ RSC nên trang cũ đứng yên đến khi server trả lời.
 * `history.replaceState` được Next.js đồng bộ vào `useSearchParams` mà không giữ UI cũ.
 */
export function replaceCourseWorkspaceUrl(href: string) {
  window.history.replaceState(null, "", href);
}

export function courseDetailHref(
  routeBase: CourseWorkspaceRouteBase,
  courseId: string,
  query?: { tab?: string; module?: string | null },
): string {
  const params = new URLSearchParams();
  if (query?.tab) params.set("tab", query.tab);
  if (query?.module) params.set("module", query.module);
  const qs = params.toString();
  return `${routeBase}/courses/${courseId}${qs ? `?${qs}` : ""}`;
}

export function moduleLessonsHref(
  routeBase: CourseWorkspaceRouteBase,
  courseId: string,
  moduleId: string,
): string {
  return courseDetailHref(routeBase, courseId, {
    tab: "noi-dung",
    module: moduleId,
  });
}

export function newLessonHref(
  routeBase: CourseWorkspaceRouteBase,
  courseId: string,
  moduleId: string,
): string {
  return `${routeBase}/courses/${courseId}/modules/${moduleId}/lessons/new`;
}

export function lessonHref(
  routeBase: CourseWorkspaceRouteBase,
  courseId: string,
  moduleId: string,
  lessonId: string,
): string {
  return `${routeBase}/courses/${courseId}/modules/${moduleId}/lessons/${lessonId}`;
}

export function studentClassTabHref(
  classId: string,
  tab: StudentClassTab,
): string {
  return `/student/classes/${classId}?tab=${tab}`;
}

/** Link quay lại từ trang tiết học / bài thực hành → tab Chuyên đề. */
export function studentClassLessonsHref(classId: string): string {
  return studentClassTabHref(classId, "chuyen-de");
}

export function studentLessonHref(classId: string, lessonId: string): string {
  return `/student/classes/${classId}/lessons/${lessonId}`;
}

export function studentAssignmentHref(
  classId: string,
  classContentItemId: string,
): string {
  return `/student/classes/${classId}/assignments/${classContentItemId}`;
}
