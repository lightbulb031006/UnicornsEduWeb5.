import { Role, type UserInfoDto } from "@/dtos/Auth.dto";
import type { FullProfileDto } from "@/dtos/profile.dto";
import { resolveStaffLessonWorkspace } from "@/lib/staff-lesson-workspace";

type StaffShellProfile = FullProfileDto | UserInfoDto | null | undefined;

export type StaffShellRouteFlags = {
  isDashboardRoute: boolean;
  isAssistantDashboardRoute: boolean;
  isProfileRoute: boolean;
  isDataConsentRoute: boolean;
  isAssistantUsersRoute: boolean;
  isAssistantStaffsRoute: boolean;
  isStaffClassesRoute: boolean;
  isStaffClassDetailRoute: boolean;
  isStaffDeductionsRoute: boolean;
  isStaffCostsRoute: boolean;
  isStaffStudentsRoute: boolean;
  isStaffStudentsListRoute: boolean;
  isStaffStudentDetailRoute: boolean;
  isAssistantHistoryRoute: boolean;
  isStaffNotificationRoute: boolean;
  isNotesSubjectRoute: boolean;
  isRootStaffProfileRoute: boolean;
  isCustomerCareSelfRoute: boolean;
  isCustomerCareAdminRoute: boolean;
  isAssistantSelfRoute: boolean;
  isAccountantSelfRoute: boolean;
  isCommunicationSelfRoute: boolean;
  isTechnicalSelfRoute: boolean;
  isLessonPlanSelfRoute: boolean;
  isLessonPlanAdminDetailRoute: boolean;
  isLessonPlanLegacyRoute: boolean;
  isStaffLessonPlansHomeRoute: boolean;
  isStaffLessonPlansTaskDetailRoute: boolean;
  isLessonPlanManageDetailsRoute: boolean;
  isAssistantAdminLikeRoute: boolean;
  isStaffCalendarRoute: boolean;
};

export type StaffShellAccessContext = {
  roleType: string | undefined;
  staffRoles: string[];
  hasStaffProfile: boolean;
  isStaffOrAdmin: boolean;
  shouldRedirectToUserProfile: boolean;
  isAdmin: boolean;
  isTeacher: boolean;
  isCustomerCare: boolean;
  isAssistant: boolean;
  isAccountant: boolean;
  isCommunication: boolean;
  isTechnical: boolean;
  isAssistantStaff: boolean;
  isLessonPlanner: boolean;
};

export type StaffShellRouteAccess = {
  isAllowed: boolean;
  redirectHref: string | null;
  context: StaffShellAccessContext;
  flags: StaffShellRouteFlags;
};

function getStaffRoles(profile: StaffShellProfile): string[] {
  if (Array.isArray((profile as UserInfoDto | undefined)?.staffRoles)) {
    return (profile as UserInfoDto).staffRoles ?? [];
  }

  return (profile as FullProfileDto | undefined)?.staffInfo?.roles ?? [];
}

function hasLinkedStaffProfile(profile: StaffShellProfile): boolean {
  if (
    typeof (profile as UserInfoDto | undefined)?.hasStaffProfile === "boolean"
  ) {
    return Boolean((profile as UserInfoDto).hasStaffProfile);
  }

  return Boolean((profile as FullProfileDto | undefined)?.staffInfo?.id);
}

function resolveStaffShellContext(
  profile: StaffShellProfile,
): StaffShellAccessContext {
  const roleType = profile?.roleType;
  const staffRoles = getStaffRoles(profile);
  const hasStaffProfile = hasLinkedStaffProfile(profile);
  const effectiveRoleTypes =
    (profile as UserInfoDto | undefined)?.effectiveRoleTypes ?? [];
  const isStaffOrAdmin =
    roleType === "staff" ||
    roleType === "admin" ||
    effectiveRoleTypes.includes(Role.staff) ||
    (hasStaffProfile && roleType !== "guest");
  const isAdmin =
    roleType === "admin" ||
    effectiveRoleTypes.includes(Role.admin) ||
    staffRoles.includes("admin") ||
    (profile as UserInfoDto | undefined)?.access?.admin?.tier === "full";
  const isTeacher = staffRoles.includes("teacher");
  const isCustomerCare = staffRoles.includes("customer_care");
  const isAssistant = staffRoles.includes("assistant");
  const isAccountant = staffRoles.includes("accountant");
  const isCommunication = staffRoles.includes("communication");
  const isTechnical = staffRoles.includes("technical");

  return {
    roleType,
    staffRoles,
    hasStaffProfile,
    isStaffOrAdmin,
    shouldRedirectToUserProfile: isStaffOrAdmin && !hasStaffProfile,
    isAdmin,
    isTeacher,
    isCustomerCare,
    isAssistant,
    isAccountant,
    isCommunication,
    isTechnical,
    isAssistantStaff: hasStaffProfile && isAssistant,
    isLessonPlanner:
      staffRoles.includes("lesson_plan") ||
      staffRoles.includes("lesson_plan_head"),
  };
}

function resolveStaffShellRouteFlags(pathname: string): StaffShellRouteFlags {
  const isDashboardRoute = pathname === "/staff";
  const isAssistantDashboardRoute = pathname === "/staff/dashboard";
  const isProfileRoute = pathname === "/staff/profile";
  const isDataConsentRoute = pathname === "/staff/data-consent";
  const isAssistantUsersRoute = pathname.startsWith("/staff/users");
  const isAssistantStaffsRoute = pathname.startsWith("/staff/staffs");
  const isStaffClassesRoute = pathname.startsWith("/staff/classes");
  const isStaffClassDetailRoute = pathname.startsWith("/staff/classes/");
  const isStaffDeductionsRoute = pathname.startsWith("/staff/deductions");
  const isStaffCostsRoute = pathname.startsWith("/staff/costs");
  const isStaffStudentsRoute = pathname.startsWith("/staff/students");
  const isStaffStudentsListRoute = pathname === "/staff/students";
  const isStaffStudentDetailRoute = pathname.startsWith("/staff/students/");
  const isAssistantHistoryRoute = pathname.startsWith("/staff/history");
  const isStaffNotificationRoute = pathname.startsWith("/staff/notification");
  const isNotesSubjectRoute = pathname.startsWith("/staff/notes-subject");
  const isCustomerCareSelfRoute = pathname.startsWith(
    "/staff/customer-care-detail",
  );
  const isCustomerCareAdminRoute = pathname.startsWith(
    "/staff/customer-care-detail/",
  );
  const isAssistantSelfRoute = pathname.startsWith("/staff/assistant-detail");
  const isAccountantSelfRoute = pathname.startsWith("/staff/accountant-detail");
  const isCommunicationSelfRoute = pathname.startsWith(
    "/staff/communication-detail",
  );
  const isTechnicalSelfRoute = pathname.startsWith("/staff/technical-detail");
  const isLessonPlanSelfRoute =
    pathname.startsWith("/staff/lesson-plan-detail") ||
    pathname.startsWith("/staff/lesson_plan_detail");
  const isLessonPlanAdminDetailRoute =
    pathname.startsWith("/staff/lesson-plan-detail/") ||
    pathname.startsWith("/staff/lesson_plan_detail/");
  const isLessonPlanLegacyRoute =
    pathname.startsWith("/staff/lesson-plan-tasks") ||
    pathname.startsWith("/staff/lesson-plan-manage-details");
  const isStaffLessonPlansHomeRoute = pathname === "/staff/lesson-plans";
  const isStaffLessonPlansTaskDetailRoute = pathname.startsWith(
    "/staff/lesson-plans/tasks/",
  );
  const isLessonPlanManageDetailsRoute = pathname.startsWith(
    "/staff/lesson-manage-details",
  );
  const isStaffCalendarRoute = pathname.startsWith("/staff/calendar");
  const isAssistantAdminLikeRoute =
    isAssistantDashboardRoute ||
    isAssistantUsersRoute ||
    isAssistantStaffsRoute ||
    isStaffStudentsListRoute ||
    isAssistantHistoryRoute ||
    isCustomerCareAdminRoute ||
    isLessonPlanAdminDetailRoute;

  return {
    isDashboardRoute,
    isAssistantDashboardRoute,
    isProfileRoute,
    isDataConsentRoute,
    isAssistantUsersRoute,
    isAssistantStaffsRoute,
    isStaffClassesRoute,
    isStaffClassDetailRoute,
    isStaffDeductionsRoute,
    isStaffCostsRoute,
    isStaffStudentsRoute,
    isStaffStudentsListRoute,
    isStaffStudentDetailRoute,
    isAssistantHistoryRoute,
    isStaffNotificationRoute,
    isNotesSubjectRoute,
    isRootStaffProfileRoute: isDashboardRoute || isProfileRoute,
    isCustomerCareSelfRoute,
    isCustomerCareAdminRoute,
    isAssistantSelfRoute,
    isAccountantSelfRoute,
    isCommunicationSelfRoute,
    isTechnicalSelfRoute,
    isLessonPlanSelfRoute,
    isLessonPlanAdminDetailRoute,
    isLessonPlanLegacyRoute,
    isStaffLessonPlansHomeRoute,
    isStaffLessonPlansTaskDetailRoute,
    isLessonPlanManageDetailsRoute,
    isAssistantAdminLikeRoute,
    isStaffCalendarRoute,
  };
}

export function resolveStaffShellRouteAccess(
  profile: StaffShellProfile,
  pathname: string,
): StaffShellRouteAccess {
  const context = resolveStaffShellContext(profile);
  const flags = resolveStaffShellRouteFlags(pathname);
  const lessonWorkspace = resolveStaffLessonWorkspace(profile);

  const {
    hasStaffProfile,
    isStaffOrAdmin,
    isAdmin,
    isTeacher,
    isCustomerCare,
    isAssistant,
    isAccountant,
    isCommunication,
    isTechnical,
    isAssistantStaff,
    isLessonPlanner,
  } = context;

  const isAllowed = flags.isDataConsentRoute
    ? hasStaffProfile && isStaffOrAdmin
    : flags.isDashboardRoute ||
        flags.isProfileRoute ||
        flags.isNotesSubjectRoute ||
        flags.isStaffNotificationRoute
      ? hasStaffProfile && isStaffOrAdmin
      : hasStaffProfile && isStaffOrAdmin && isAdmin
        ? true
        : flags.isStaffCalendarRoute
          ? hasStaffProfile && (isAdmin || isAssistantStaff || isTeacher)
          : flags.isStaffClassesRoute
            ? isAssistantStaff ||
              (hasStaffProfile && isStaffOrAdmin && isAccountant) ||
              (flags.isStaffClassDetailRoute &&
                hasStaffProfile &&
                (isAdmin || isTeacher || isCustomerCare))
            : flags.isStaffDeductionsRoute
              ? isAssistantStaff ||
                (hasStaffProfile && isStaffOrAdmin && isAccountant)
              : flags.isStaffStudentsRoute
                ? isAssistantStaff ||
                  (hasStaffProfile && isStaffOrAdmin && isAccountant) ||
                  (flags.isStaffStudentDetailRoute &&
                    hasStaffProfile &&
                    isCustomerCare)
                : flags.isStaffCostsRoute
                  ? isAssistantStaff ||
                    (hasStaffProfile && isStaffOrAdmin && isAccountant)
                  : flags.isStaffLessonPlansHomeRoute
                    ? hasStaffProfile &&
                      isStaffOrAdmin &&
                      lessonWorkspace.canAccessWorkspace
                    : flags.isAssistantStaffsRoute
                      ? isAssistantStaff ||
                        (hasStaffProfile && isStaffOrAdmin && isAccountant)
                      : flags.isAssistantAdminLikeRoute
                        ? isAssistantStaff
                        : flags.isCustomerCareSelfRoute
                          ? flags.isCustomerCareAdminRoute
                            ? isAssistantStaff
                            : hasStaffProfile &&
                              isStaffOrAdmin &&
                              isCustomerCare
                          : flags.isAssistantSelfRoute
                            ? hasStaffProfile &&
                              isStaffOrAdmin &&
                              (isAssistant || isAssistantStaff)
                            : flags.isAccountantSelfRoute
                              ? hasStaffProfile &&
                                isStaffOrAdmin &&
                                (isAccountant || isAssistantStaff)
                              : flags.isCommunicationSelfRoute
                                ? hasStaffProfile &&
                                  isStaffOrAdmin &&
                                  (isCommunication || isAssistantStaff)
                                : flags.isTechnicalSelfRoute
                                  ? hasStaffProfile &&
                                    isStaffOrAdmin &&
                                    (isTechnical || isAssistantStaff)
                                  : flags.isLessonPlanLegacyRoute
                                    ? hasStaffProfile &&
                                      isStaffOrAdmin &&
                                      lessonWorkspace.canAccessWorkspace
                                    : flags.isStaffLessonPlansTaskDetailRoute
                                      ? hasStaffProfile &&
                                        isStaffOrAdmin &&
                                        lessonWorkspace.canAccessTaskDetail
                                      : flags.isLessonPlanManageDetailsRoute
                                        ? hasStaffProfile &&
                                          isStaffOrAdmin &&
                                          lessonWorkspace.canAccessManageDetails
                                        : flags.isLessonPlanSelfRoute
                                          ? hasStaffProfile &&
                                            isStaffOrAdmin &&
                                            (flags.isLessonPlanAdminDetailRoute
                                              ? isAssistantStaff
                                              : isLessonPlanner ||
                                                isAssistantStaff)
                                          : false;

  const redirectHref = isAllowed
    ? null
    : isAssistantStaff
      ? "/staff"
      : context.shouldRedirectToUserProfile
        ? "/user-profile"
        : !isStaffOrAdmin
          ? "/"
          : null;

  return {
    isAllowed,
    redirectHref,
    context,
    flags,
  };
}
