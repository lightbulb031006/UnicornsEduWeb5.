import { hasSaleCsHeadAccess } from "@/lib/sale-cs-head-access";
import { hasTrainingAccess } from "@/lib/training-access";
import { Role, type UserInfoDto } from "@/dtos/Auth.dto";
import type { FullProfileDto } from "@/dtos/profile.dto";
import { canPublishNotifications } from "@/lib/notification-publisher-access";
import { isMissingRequiredStaffAchievement } from "@/lib/staff-achievement-requirement";
import { resolveStaffLessonWorkspace } from "@/lib/staff-lesson-workspace";

type StaffShellProfile = FullProfileDto | UserInfoDto | null | undefined;

export type StaffShellRouteFlags = {
  isDashboardRoute: boolean;
  isAssistantDashboardRoute: boolean;
  isProfileRoute: boolean;
  isAssistantUsersRoute: boolean;
  isAssistantStaffsRoute: boolean;
  /** `/staff/staffs/:id` — hồ sơ nhân sự (trưởng ban/phòng xem cấp dưới). */
  isStaffDetailRoute: boolean;
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
  isStaffNotificationManageRoute: boolean;
  isNotesSubjectRoute: boolean;
  isRootStaffProfileRoute: boolean;
  isCustomerCareSelfRoute: boolean;
  isCustomerCareAdminRoute: boolean;
  isAssistantSelfRoute: boolean;
  isAccountantSelfRoute: boolean;
  isCommunicationSelfRoute: boolean;
  isTechnicalSelfRoute: boolean;
  isTrainingSelfRoute: boolean;
  isTrainingHeadSelfRoute: boolean;
  isSaleSelfRoute: boolean;
  isLessonPlanSelfRoute: boolean;
  isLessonPlanAdminDetailRoute: boolean;
  isLessonPlanLegacyRoute: boolean;
  isStaffLessonPlansHomeRoute: boolean;
  isStaffLessonPlansTaskDetailRoute: boolean;
  isLessonPlanManageDetailsRoute: boolean;
  isAssistantAdminLikeRoute: boolean;
  /** Báo cáo tháng, Thống kê học sinh — chỉ Admin (#269). */
  isAdminOnlyReportRoute: boolean;
  isStaffCalendarRoute: boolean;
  isStaffSurveysRoute: boolean;
  isStaffCoursesRoute: boolean;
  isStaffDirectTopUpQueueRoute: boolean;
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
  /** Có đúng role `training` (thu nhập dòng Đào Tạo), khác `isTraining` là quyền Ban Đào Tạo. */
  isTrainingRole: boolean;
  isTrainingHead: boolean;
  isAssistant: boolean;
  isAccountant: boolean;
  isAccountantIncome: boolean;
  isAccountantExpense: boolean;
  isCommunication: boolean;
  isTechnical: boolean;
  isSale: boolean;
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

  const avatarPath = (
    profile as FullProfileDto & { avatarPath?: string | null }
  ).avatarPath;

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
    hasText(staffInfo.bankQrLink) &&
    !isMissingRequiredStaffAchievement(staffInfo)
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
  const isTraining = hasTrainingAccess(staffRoles);
  const isTrainingRole = staffRoles.includes("training");
  const isTrainingHead = staffRoles.includes("training_head");
  const isAssistant = hasSaleCsHeadAccess(staffRoles);
  const isAccountantIncome =
    staffRoles.includes("accountant_income") ||
    staffRoles.includes("accountant");
  const isAccountantExpense = staffRoles.includes("accountant_expense");
  const isAccountant = isAccountantIncome || isAccountantExpense;
  const isCommunication = staffRoles.includes("communication");
  const isTechnical = staffRoles.includes("technical");
  const isSale = staffRoles.includes("sale");

  return {
    roleType,
    staffRoles,
    hasStaffProfile,
    staffProfileComplete,
    canBypassStaffProfileRequirement: isAdmin,
    isStaffOrAdmin,
    shouldRedirectToUserProfile:
      isStaffOrAdmin && !isAdmin && (!hasStaffProfile || !staffProfileComplete),
    isAdmin,
    isTeacher,
    isCustomerCare,
    isTraining,
    isTrainingRole,
    isTrainingHead,
    isAssistant,
    isAccountant,
    isAccountantIncome,
    isAccountantExpense,
    isCommunication,
    isTechnical,
    isSale,
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
  const isStaffDetailRoute = pathname.startsWith("/staff/staffs/");
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
  // #269: Báo cáo tháng, Thống kê học sinh chỉ Admin; Trợ lí / Kế toán thu
  // và mọi staff role khác bị chặn.
  const isAdminOnlyReportRoute =
    pathname.startsWith("/staff/monthly-report") ||
    pathname.startsWith("/staff/student-statistics");
  const isStaffNotificationRoute = pathname.startsWith("/staff/notification");
  const isStaffNotificationManageRoute = pathname.startsWith(
    "/staff/notification/manage",
  );
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
  const isTrainingHeadSelfRoute = pathname.startsWith(
    "/staff/training-head-detail",
  );
  const isSaleSelfRoute = pathname.startsWith("/staff/sale-detail");
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
  const isStaffDirectTopUpQueueRoute = pathname.startsWith(
    "/staff/wallet-direct-topup-requests",
  );
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
    isStaffDetailRoute,
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
    isStaffNotificationManageRoute,
    isNotesSubjectRoute,
    isRootStaffProfileRoute: isDashboardRoute || isProfileRoute,
    isCustomerCareSelfRoute,
    isCustomerCareAdminRoute,
    isAssistantSelfRoute,
    isAccountantSelfRoute,
    isCommunicationSelfRoute,
    isTechnicalSelfRoute,
    isTrainingSelfRoute,
    isTrainingHeadSelfRoute,
    isSaleSelfRoute,
    isLessonPlanSelfRoute,
    isLessonPlanAdminDetailRoute,
    isLessonPlanLegacyRoute,
    isStaffLessonPlansHomeRoute,
    isStaffLessonPlansTaskDetailRoute,
    isLessonPlanManageDetailsRoute,
    isAssistantAdminLikeRoute,
    isAdminOnlyReportRoute,
    isStaffCalendarRoute,
    isStaffSurveysRoute,
    isStaffCoursesRoute,
    isStaffDirectTopUpQueueRoute,
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
    isTrainingRole,
    isTrainingHead,
    isAssistant,
    isAccountant,
    isAccountantIncome,
    isAccountantExpense,
    isCommunication,
    isTechnical,
    isSale,
    isAssistantStaff,
    isLessonPlanner,
  } = context;
  const hasStaffWorkspaceAccess =
    canBypassStaffProfileRequirement ||
    (hasStaffProfile && context.staffProfileComplete);

  const isAllowed = flags.isStaffNotificationManageRoute
    ? hasStaffWorkspaceAccess &&
      isStaffOrAdmin &&
      canPublishNotifications(context.staffRoles, isAdmin)
    : flags.isDashboardRoute ||
        flags.isProfileRoute ||
        flags.isNotesSubjectRoute ||
        flags.isStaffNotificationRoute
      ? hasStaffWorkspaceAccess && isStaffOrAdmin
      : hasStaffWorkspaceAccess && isStaffOrAdmin && isAdmin
        ? true
        : flags.isAdminOnlyReportRoute
          ? false
          : flags.isStaffDirectTopUpQueueRoute
            ? // 14/11: Trưởng phòng Sale & CSKH duyệt hàng chờ nạp thẳng.
              isAssistantStaff
          : flags.isStaffCalendarRoute
            ? hasStaffWorkspaceAccess && (isAdmin || isTeacher || isTraining)
            : flags.isStaffSurveysRoute
                  ? hasStaffWorkspaceAccess &&
                    isStaffOrAdmin &&
                    (isAdmin ||
                      lessonWorkspace.isLessonPlan ||
                      lessonWorkspace.isLessonPlanHead)
                  : flags.isStaffCoursesRoute
                    ? hasStaffWorkspaceAccess &&
                      isStaffOrAdmin &&
                      (lessonWorkspace.isLessonPlan ||
                        lessonWorkspace.isLessonPlanHead)
                    : flags.isStaffClassesRoute
                      ? (hasStaffWorkspaceAccess &&
                          isStaffOrAdmin &&
                          // #272: Trưởng phòng Sale & CSKH xem mọi lớp (không lương gia sư).
                          (isAccountantIncome ||
                            isAccountantExpense ||
                            isTraining ||
                            isAssistant)) ||
                        (flags.isStaffClassDetailRoute &&
                          hasStaffWorkspaceAccess &&
                          (isAdmin ||
                            isTeacher ||
                            isCustomerCare ||
                            isTraining))
                      : flags.isStaffDeductionsRoute
                        ? false
                        : flags.isStaffStudentsRoute
                          ? isAssistantStaff ||
                            (hasStaffWorkspaceAccess &&
                              isStaffOrAdmin &&
                              isAccountantIncome) ||
                            (flags.isStaffStudentDetailRoute &&
                              hasStaffWorkspaceAccess &&
                              isCustomerCare)
                          : flags.isStaffCostsRoute
                            ? hasStaffWorkspaceAccess &&
                              isStaffOrAdmin &&
                              isAccountantExpense
                            : flags.isStaffLessonPlansHomeRoute
                              ? hasStaffWorkspaceAccess &&
                                isStaffOrAdmin &&
                                (lessonWorkspace.canAccessWorkspace ||
                                  isAccountantExpense)
                              : flags.isAssistantStaffsRoute
                                ? (hasStaffWorkspaceAccess &&
                                    isStaffOrAdmin &&
                                    isAccountantExpense) ||
                                  // Trưởng phòng Sale & CSKH: danh sách + hồ sơ đội
                                  // Sale/CSKH (bản giới hạn). Ban Đào Tạo: danh sách
                                  // + hồ sơ gia sư (Trưởng ban thêm Ban Chuyên môn /
                                  // Đào tạo) — thay `/staff/tutors` cũ.
                                  isAssistantStaff ||
                                  (hasStaffWorkspaceAccess &&
                                    isStaffOrAdmin &&
                                    isTraining) ||
                                  // 14/11: Trưởng ban Chuyên môn chỉ vào trang
                                  // danh sách để tạo nhân sự, không xem hồ sơ.
                                  (!flags.isStaffDetailRoute &&
                                    hasStaffWorkspaceAccess &&
                                    isStaffOrAdmin &&
                                    lessonWorkspace.isLessonPlanHead)
                                : flags.isAssistantAdminLikeRoute
                                  ? false
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
                                          (isAccountant || isAccountantExpense)
                                        : flags.isCommunicationSelfRoute
                                          ? hasStaffWorkspaceAccess &&
                                            isStaffOrAdmin &&
                                            (isCommunication ||
                                              isAccountantExpense)
                                          : flags.isTechnicalSelfRoute
                                            ? hasStaffWorkspaceAccess &&
                                              isStaffOrAdmin &&
                                              (isTechnical ||
                                                isAccountantExpense)
                                            : flags.isTrainingSelfRoute
                                              ? hasStaffWorkspaceAccess &&
                                                isStaffOrAdmin &&
                                                (isTrainingRole ||
                                                  isAccountantExpense)
                                              : flags.isTrainingHeadSelfRoute
                                                ? hasStaffWorkspaceAccess &&
                                                  isStaffOrAdmin &&
                                                  (isTrainingHead ||
                                                    isAccountantExpense)
                                                : flags.isSaleSelfRoute
                                                  ? hasStaffWorkspaceAccess &&
                                                    isStaffOrAdmin &&
                                                    (isSale ||
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
                                                              ? isAccountantExpense
                                                              : isLessonPlanner)
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
