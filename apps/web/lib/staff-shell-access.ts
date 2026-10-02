import { Role, type UserInfoDto } from "@/dtos/Auth.dto";
import type { FullProfileDto } from "@/dtos/profile.dto";
import { resolveStaffLessonWorkspace } from "@/lib/staff-lesson-workspace";

type StaffShellProfile = FullProfileDto | UserInfoDto | null | undefined;

export type StaffShellRouteFlags = {
  isDashboardRoute: boolean;
  isAssistantDashboardRoute: boolean;
  isProfileRoute: boolean;
  isAssistantUsersRoute: boolean;
  isAssistantStaffsRoute: boolean;
  isStaffClassesRoute: boolean;
  isStaffClassDetailRoute: boolean;
  isStaffDeductionsRoute: boolean;
  isStaffSystemSettingsRoute: boolean;
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
  isTrainingSelfRoute: boolean;
  isLessonPlanSelfRoute: boolean;
  isLessonPlanAdminDetailRoute: boolean;
  isLessonPlanLegacyRoute: boolean;
  isStaffLessonPlansHomeRoute: boolean;
  isStaffLessonPlansTaskDetailRoute: boolean;
  isLessonPlanManageDetailsRoute: boolean;
  isAssistantAdminLikeRoute: boolean;
  isStaffCalendarRoute: boolean;
  isStaffSurveysRoute: boolean;
  isStaffCoursesRoute: boolean;
};

export type StaffShellAccessContext = {
  roleType: string | undefined;
  staffRoles: string[];
  hasStaffProfile: boolean;
  staffProfileComplete: boolean;
  canBypassStaffProfileRequirement: boolean;
  isStaffOrAdmin: boolean;
  shouldRedirectToUserProfile: boolean;
  isAdmin: boolean;
  isTeacher: boolean;
  isCustomerCare: boolean;
  isTraining: boolean;
  isAssistant: boolean;
  isAccountant: boolean;
  isAccountantIncome: boolean;
  isAccountantExpense: boolean;
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

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidCccd(value: string | null | undefined): boolean {
  return typeof value === "string" && /^\d{12}$/.test(value.trim());
}

function isCompleteFullProfileStaffInfo(profile: FullProfileDto): boolean {
  const staffInfo = profile.staffInfo;
  if (!staffInfo) return false;

  const avatarPath = (profile as FullProfileDto & { avatarPath?: string | null })
    .avatarPath;

  return (
    hasText(profile.first_name) &&
    hasText(profile.last_name) &&
    hasText(profile.email) &&
    hasText(profile.phone) &&
    hasText(profile.province) &&
    (hasText(avatarPath) || hasText(profile.avatarUrl)) &&
    hasText(profile.dataConsentAcceptedAt) &&
    hasText(profile.dataConsentVersion) &&
    profile.requiresStaffDataConsent !== true &&
    isValidCccd(staffInfo.cccdNumber) &&
    hasText(staffInfo.ethnicity) &&
    hasText(staffInfo.gender) &&
    hasText(staffInfo.currentAddress) &&
    hasText(staffInfo.cccdIssuedDate) &&
    hasText(staffInfo.cccdIssuedPlace) &&
    hasText(staffInfo.birthDate) &&
    hasText(staffInfo.university) &&
    hasText(staffInfo.highSchool) &&
    hasText(staffInfo.bankAccount) &&
    hasText(staffInfo.bankQrLink)
  );
}

function hasCompletedStaffProfile(profile: StaffShellProfile): boolean {
  if (!hasLinkedStaffProfile(profile)) return false;

  const sessionProfile = profile as UserInfoDto | undefined;
  if (typeof sessionProfile?.access?.staff?.profileComplete === "boolean") {
    return sessionProfile.access.staff.profileComplete;
  }

  if (typeof sessionProfile?.staffProfileComplete === "boolean") {
    return sessionProfile.staffProfileComplete;
  }

  return isCompleteFullProfileStaffInfo(profile as FullProfileDto);
}

function buildUserProfileRequirementHref(pathname: string): string {
  const params = new URLSearchParams({
    profile_required: "1",
    from: pathname,
  });
  return `/user-profile?${params.toString()}`;
}

function resolveStaffShellContext(
  profile: StaffShellProfile,
): StaffShellAccessContext {
  const roleType = profile?.roleType;
  const staffRoles = getStaffRoles(profile);
  const hasStaffProfile = hasLinkedStaffProfile(profile);
  const staffProfileComplete = hasCompletedStaffProfile(profile);
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
  const isTraining = staffRoles.includes("training");
  const isAssistant = staffRoles.includes("assistant");
  const isAccountantIncome =
    staffRoles.includes("accountant_income") || staffRoles.includes("accountant");
  const isAccountantExpense = staffRoles.includes("accountant_expense");
  const isAccountant = isAccountantIncome || isAccountantExpense;
  const isCommunication = staffRoles.includes("communication");
  const isTechnical = staffRoles.includes("technical");

  return {
    roleType,
    staffRoles,
    hasStaffProfile,
    staffProfileComplete,
    canBypassStaffProfileRequirement: isAdmin,
    isStaffOrAdmin,
    shouldRedirectToUserProfile:
      isStaffOrAdmin &&
      !isAdmin &&
      (!hasStaffProfile || !staffProfileComplete),
    isAdmin,
    isTeacher,
    isCustomerCare,
    isTraining,
    isAssistant,
    isAccountant,
    isAccountantIncome,
    isAccountantExpense,
    isCommunication,
    isTechnical,
    isAssistantStaff: hasStaffProfile && staffProfileComplete && isAssistant,
    isLessonPlanner:
      staffRoles.includes("lesson_plan") ||
      staffRoles.includes("lesson_plan_head"),
  };
}

function resolveStaffShellRouteFlags(pathname: string): StaffShellRouteFlags {
  const isDashboardRoute = pathname === "/staff";
  const isAssistantDashboardRoute = pathname === "/staff/dashboard";
  const isProfileRoute = pathname === "/staff/profile";
  const isAssistantUsersRoute = pathname.startsWith("/staff/users");
  const isAssistantStaffsRoute = pathname.startsWith("/staff/staffs");
  const isStaffClassesRoute = pathname.startsWith("/staff/classes");
  const isStaffClassDetailRoute = pathname.startsWith("/staff/classes/");
  const isStaffSystemSettingsRoute = pathname.startsWith(
    "/staff/system-settings",
  );
  const isStaffDeductionsRoute =
    pathname.startsWith("/staff/deductions") || isStaffSystemSettingsRoute;
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
  const isTrainingSelfRoute = pathname.startsWith("/staff/training-detail");
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
  const isStaffSurveysRoute = pathname.startsWith("/staff/surveys");
  const isStaffCoursesRoute = pathname.startsWith("/staff/courses");
  const isAssistantAdminLikeRoute =
    isAssistantDashboardRoute ||
    isAssistantUsersRoute ||
    isAssistantStaffsRoute ||
    isStaffStudentsListRoute ||
    isAssistantHistoryRoute;

  return {
    isDashboardRoute,
    isAssistantDashboardRoute,
    isProfileRoute,
    isAssistantUsersRoute,
    isAssistantStaffsRoute,
    isStaffClassesRoute,
    isStaffClassDetailRoute,
    isStaffDeductionsRoute,
    isStaffSystemSettingsRoute,
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
    isTrainingSelfRoute,
    isLessonPlanSelfRoute,
    isLessonPlanAdminDetailRoute,
    isLessonPlanLegacyRoute,
    isStaffLessonPlansHomeRoute,
    isStaffLessonPlansTaskDetailRoute,
    isLessonPlanManageDetailsRoute,
    isAssistantAdminLikeRoute,
    isStaffCalendarRoute,
    isStaffSurveysRoute,
    isStaffCoursesRoute,
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
    canBypassStaffProfileRequirement,
    isStaffOrAdmin,
    isAdmin,
    isTeacher,
    isCustomerCare,
    isTraining,
    isAssistant,
    isAccountant,
    isAccountantIncome,
    isAccountantExpense,
    isCommunication,
    isTechnical,
    isAssistantStaff,
    isLessonPlanner,
  } = context;
  const hasStaffWorkspaceAccess =
    canBypassStaffProfileRequirement ||
    (hasStaffProfile && context.staffProfileComplete);

  const isAllowed =
    flags.isDashboardRoute ||
    flags.isProfileRoute ||
    flags.isNotesSubjectRoute ||
    flags.isStaffNotificationRoute
      ? hasStaffWorkspaceAccess && isStaffOrAdmin
      : hasStaffWorkspaceAccess && isStaffOrAdmin && isAdmin
        ? true
                    : flags.isStaffCalendarRoute
            ? hasStaffWorkspaceAccess &&
              (isAdmin || isAssistantStaff || isTeacher || isTraining)
          : flags.isStaffSurveysRoute
            ? hasStaffWorkspaceAccess &&
              isStaffOrAdmin &&
              (isAdmin ||
                isAssistantStaff ||
                lessonWorkspace.isLessonPlan ||
                lessonWorkspace.isLessonPlanHead)
          : flags.isStaffCoursesRoute
            ? hasStaffWorkspaceAccess &&
              isStaffOrAdmin &&
              (lessonWorkspace.isLessonPlan || lessonWorkspace.isLessonPlanHead)
          : flags.isStaffClassesRoute
            ? isAssistantStaff ||
              (hasStaffWorkspaceAccess &&
                isStaffOrAdmin &&
                (isAccountantIncome || isAccountantExpense || isTraining)) ||
              (flags.isStaffClassDetailRoute &&
                hasStaffWorkspaceAccess &&
                (isAdmin || isTeacher || isCustomerCare || isTraining))
            : flags.isStaffDeductionsRoute
              ? isAssistantStaff
              : flags.isStaffStudentsRoute
                ? isAssistantStaff ||
                  (hasStaffWorkspaceAccess &&
                    isStaffOrAdmin &&
                    isAccountantIncome) ||
                  (flags.isStaffStudentDetailRoute &&
                    hasStaffWorkspaceAccess &&
                    isCustomerCare)
                : flags.isStaffCostsRoute
                  ? isAssistantStaff ||
                    (hasStaffWorkspaceAccess &&
                      isStaffOrAdmin &&
                      isAccountantExpense)
                  : flags.isStaffLessonPlansHomeRoute
                    ? hasStaffWorkspaceAccess &&
                      isStaffOrAdmin &&
                      (lessonWorkspace.canAccessWorkspace ||
                        isAccountantExpense)
                    : flags.isAssistantStaffsRoute
                      ? isAssistantStaff ||
                        (hasStaffWorkspaceAccess &&
                          isStaffOrAdmin &&
                          isAccountantExpense)
                      : flags.isAssistantAdminLikeRoute
                        ? isAssistantStaff
                        : flags.isCustomerCareSelfRoute
                          ? flags.isCustomerCareAdminRoute
                            ? isAssistantStaff ||
                              (hasStaffWorkspaceAccess &&
                                isStaffOrAdmin &&
                                isAccountantExpense)
                            : hasStaffWorkspaceAccess &&
                              isStaffOrAdmin &&
                              isCustomerCare
                          : flags.isAssistantSelfRoute
                            ? hasStaffWorkspaceAccess &&
                              isStaffOrAdmin &&
                              (isAssistant ||
                                isAssistantStaff ||
                                isAccountantExpense)
                            : flags.isAccountantSelfRoute
                              ? hasStaffWorkspaceAccess &&
                                isStaffOrAdmin &&
                                (isAccountant ||
                                  isAssistantStaff ||
                                  isAccountantExpense)
                              : flags.isCommunicationSelfRoute
                                ? hasStaffWorkspaceAccess &&
                                  isStaffOrAdmin &&
                                  (isCommunication ||
                                    isAssistantStaff ||
                                    isAccountantExpense)
                                : flags.isTechnicalSelfRoute
                                  ? hasStaffWorkspaceAccess &&
                                    isStaffOrAdmin &&
                                    (isTechnical ||
                                      isAssistantStaff ||
                                      isAccountantExpense)
                                  : flags.isTrainingSelfRoute
                                    ? hasStaffWorkspaceAccess &&
                                      isStaffOrAdmin &&
                                      (isTraining ||
                                        isAssistantStaff ||
                                        isAccountantExpense)
                                    : flags.isLessonPlanLegacyRoute
                                      ? hasStaffWorkspaceAccess &&
                                        isStaffOrAdmin &&
                                        lessonWorkspace.canAccessWorkspace
                                      : flags.isStaffLessonPlansTaskDetailRoute
                                        ? hasStaffWorkspaceAccess &&
                                          isStaffOrAdmin &&
                                          (lessonWorkspace.canAccessTaskDetail ||
                                            isAccountantExpense)
                                        : flags.isLessonPlanManageDetailsRoute
                                          ? hasStaffWorkspaceAccess &&
                                            isStaffOrAdmin &&
                                            (lessonWorkspace.canAccessManageDetails ||
                                              isAccountantExpense)
                                          : flags.isLessonPlanSelfRoute
                                            ? hasStaffWorkspaceAccess &&
                                              isStaffOrAdmin &&
                                              (flags.isLessonPlanAdminDetailRoute
                                                ? isAssistantStaff ||
                                                  isAccountantExpense
                                                : isLessonPlanner ||
                                                  isAssistantStaff)
                                            : false;

  const redirectHref = isAllowed
    ? null
    : context.shouldRedirectToUserProfile
        ? buildUserProfileRequirementHref(pathname)
        : isAssistantStaff
          ? "/staff"
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
