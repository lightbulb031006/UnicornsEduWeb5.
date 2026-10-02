import { resolveAdminShellAccess } from "@/lib/admin-shell-access";
import type { UserInfoDto } from "@/dtos/Auth.dto";
import type { FullProfileDto } from "@/dtos/profile.dto";
import {
  COURSE_WORKSPACE_TAB_IDS,
  isCourseWorkspaceTabId,
  type CourseWorkspaceRouteBase,
  type CourseWorkspaceTabId,
} from "@/dtos/course-workspace.dto";

export type CourseWorkspaceCapabilities = {
  routeBase: CourseWorkspaceRouteBase;
  listHref: string;
  detailHref: (courseId: string) => string;
  canEnterWorkspace: boolean;
  canViewAllCourses: boolean;
  canMutateCourses: boolean;
  canViewContentTab: boolean;
  canMutateContent: boolean;
  canViewQuestionTab: boolean;
  canMutateQuestions: boolean;
  canViewSettingsTab: boolean;
  canMutateDifficultyLevels: boolean;
  canViewLessonPlanTeam: boolean;
  canMutateLessonPlanTeam: boolean;
  visibleTabIds: CourseWorkspaceTabId[];
};

export type CourseWorkspaceTabResolve =
  | { status: "missing"; tab: CourseWorkspaceTabId | null }
  | { status: "ok"; tab: CourseWorkspaceTabId }
  | { status: "unknown"; tab: null }
  | { status: "forbidden"; tab: null };

function andShell(flag: boolean, allowedOnThisShell: boolean): boolean {
  return flag && allowedOnThisShell;
}

export function resolveCourseWorkspaceCapabilities(
  profile: FullProfileDto | UserInfoDto | null | undefined,
  routeBase: CourseWorkspaceRouteBase,
): CourseWorkspaceCapabilities {
  const access = resolveAdminShellAccess(profile);
  const isAdminOrAssistant = access.isAdmin || access.isAssistant;
  const isLessonPlanHead = access.isLessonPlanHead;
  const isLessonPlanMember = access.staffRoles.includes("lesson_plan");

  const profileCanEnter =
    isAdminOrAssistant || isLessonPlanHead || isLessonPlanMember;
  const profileCanMutateCourses = isAdminOrAssistant || isLessonPlanHead;
  const profileCanViewAllCourses = isAdminOrAssistant || isLessonPlanHead;
  const profileCanUseAcademicTabs =
    isAdminOrAssistant || isLessonPlanHead || isLessonPlanMember;
  const profileCanMutateTeam = isAdminOrAssistant || isLessonPlanHead;

  // `/admin` is admin/assistant only. `/staff` never turns a false profile flag true.
  const allowedOnThisShell =
    routeBase === "/admin" ? isAdminOrAssistant : profileCanEnter;

  const canEnterWorkspace = andShell(profileCanEnter, allowedOnThisShell);
  const canViewContentTab = andShell(
    profileCanUseAcademicTabs,
    allowedOnThisShell,
  );
  const canViewQuestionTab = andShell(
    profileCanUseAcademicTabs,
    allowedOnThisShell,
  );
  const canViewSettingsTab = canViewQuestionTab;

  const visibleTabIds = COURSE_WORKSPACE_TAB_IDS.filter((tabId) => {
    if (tabId === "noi-dung") return canViewContentTab;
    if (tabId === "cau-hoi") return canViewQuestionTab;
    return canViewSettingsTab;
  });

  return {
    routeBase,
    listHref: `${routeBase}/courses`,
    detailHref: (courseId: string) => `${routeBase}/courses/${courseId}`,
    canEnterWorkspace,
    canViewAllCourses: andShell(profileCanViewAllCourses, allowedOnThisShell),
    canMutateCourses: andShell(profileCanMutateCourses, allowedOnThisShell),
    canViewContentTab,
    canMutateContent: canViewContentTab,
    canViewQuestionTab,
    canMutateQuestions: canViewQuestionTab,
    canViewSettingsTab,
    canMutateDifficultyLevels: canViewSettingsTab,
    canViewLessonPlanTeam: canViewSettingsTab,
    canMutateLessonPlanTeam: andShell(profileCanMutateTeam, allowedOnThisShell),
    visibleTabIds,
  };
}

export function resolveCourseWorkspaceTab(
  tabParam: string | null,
  visibleTabIds: CourseWorkspaceTabId[],
): CourseWorkspaceTabResolve {
  if (!tabParam) {
    return { status: "missing", tab: visibleTabIds[0] ?? null };
  }
  if (!isCourseWorkspaceTabId(tabParam)) {
    return { status: "unknown", tab: null };
  }
  if (!visibleTabIds.includes(tabParam)) {
    return { status: "forbidden", tab: null };
  }
  return { status: "ok", tab: tabParam };
}
