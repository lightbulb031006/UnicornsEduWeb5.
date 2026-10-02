export const COURSE_WORKSPACE_TAB_IDS = [
  "noi-dung",
  "cau-hoi",
  "cai-dat",
] as const;

export type CourseWorkspaceTabId = (typeof COURSE_WORKSPACE_TAB_IDS)[number];

export const COURSE_WORKSPACE_TAB_LABELS: Record<CourseWorkspaceTabId, string> = {
  "noi-dung": "Nội dung",
  "cau-hoi": "Câu hỏi",
  "cai-dat": "Cài đặt",
};

export const LEGACY_EXAM_TAB_ID = "de-thi";

export function isCourseWorkspaceTabId(
  value: string,
): value is CourseWorkspaceTabId {
  return (COURSE_WORKSPACE_TAB_IDS as readonly string[]).includes(value);
}

export type CourseWorkspaceRouteBase = "/admin" | "/staff";
