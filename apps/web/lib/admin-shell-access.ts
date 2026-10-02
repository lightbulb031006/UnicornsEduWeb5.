import { Role, type UserInfoDto } from "@/dtos/Auth.dto";
import type { FullProfileDto } from "@/dtos/profile.dto";

export type AdminShellAccess = {
  isAdmin: boolean;
  isAssistant: boolean;
  isAccountant: boolean;
  isAccountantIncome: boolean;
  isAccountantExpense: boolean;
  isCustomerCare: boolean;
  isLessonPlanHead: boolean;
  staffId: string | null;
  staffRoles: string[];
};

export type StudentAdminCapabilities = {
  isCustomerCareReadOnlyView: boolean;
  canManageStudent: boolean;
  canEditStudentProfile: boolean;
  canEditCustomerCareProfitPercent: boolean;
  canCreateWalletQr: boolean;
  canDirectlyAdjustWallet: boolean;
  canDirectlyWithdrawWallet: boolean;
  canRequestDirectTopUp: boolean;
  canEditStudentClassTuition: boolean;
  canDeleteStudent: boolean;
};

export type UserAdminCapabilities = {
  canManageUsers: boolean;
  canDeleteUser: boolean;
  hideAdminRoleOptions: boolean;
};

export const ACCOUNTANT_INCOME_VISIBLE_HREFS = new Set([
  "/admin/classes",
  "/admin/students",
]);

export const ACCOUNTANT_EXPENSE_VISIBLE_HREFS = new Set([
  "/admin/classes",
  "/admin/staffs",
  "/admin/costs",
  "/admin/lesson-plans",
]);

export const ACCOUNTANT_VISIBLE_HREFS = new Set([
  ...ACCOUNTANT_INCOME_VISIBLE_HREFS,
  ...ACCOUNTANT_EXPENSE_VISIBLE_HREFS,
]);

export function getAccountantVisibleAdminHrefs(
  access: Pick<AdminShellAccess, "isAccountantIncome" | "isAccountantExpense">,
): Set<string> {
  const hrefs = new Set<string>();

  if (access.isAccountantIncome) {
    ACCOUNTANT_INCOME_VISIBLE_HREFS.forEach((href) => hrefs.add(href));
  }

  if (access.isAccountantExpense) {
    ACCOUNTANT_EXPENSE_VISIBLE_HREFS.forEach((href) => hrefs.add(href));
  }

  return hrefs;
}

const ACCOUNTANT_INCOME_ALLOWED_ROUTE_PATTERNS = [
  /^\/admin\/dashboard$/,
  /^\/admin\/classes(?:\/[^/]+)?$/,
  /^\/admin\/students(?:\/[^/]+)?$/,
  /^\/admin\/accountant_detail$/,
] as const;

const ACCOUNTANT_EXPENSE_ALLOWED_ROUTE_PATTERNS = [
  /^\/admin\/classes(?:\/[^/]+)?$/,
  /^\/admin\/staffs(?:\/[^/]+)?$/,
  /^\/admin\/costs$/,
  /^\/admin\/lesson-plans$/,
  /^\/admin\/lesson-plans\/tasks\/[^/]+$/,
  /^\/admin\/accountant_detail$/,
  /^\/admin\/assistant_detail$/,
  /^\/admin\/communication_detail$/,
  /^\/admin\/technical_detail$/,
  /^\/admin\/training_detail$/,
  /^\/admin\/customer_care_detail\/[^/]+$/,
  /^\/admin\/lesson_plan_detail\/[^/]+$/,
] as const;

const ACCOUNTANT_ALLOWED_ROUTE_PATTERNS = [
  ...ACCOUNTANT_INCOME_ALLOWED_ROUTE_PATTERNS,
  ...ACCOUNTANT_EXPENSE_ALLOWED_ROUTE_PATTERNS,
] as const;

export const LESSON_MANAGEMENT_ROUTE_PREFIXES = [
  "/admin/lesson-plans",
  "/admin/lesson-manage-details",
  "/admin/lessons",
] as const;

export const STRICT_ADMIN_ROUTE_PREFIXES = [
  "/admin/wallet-direct-topup-requests",
  "/admin/surveys",
] as const;

export function resolveAdminShellAccess(
  profile?: FullProfileDto | UserInfoDto | null,
): AdminShellAccess {
  const staffRoles = Array.isArray((profile as UserInfoDto | undefined)?.staffRoles)
    ? (profile as UserInfoDto).staffRoles ?? []
    : (profile as FullProfileDto | undefined)?.staffInfo?.roles ?? [];
  const effectiveRoleTypes =
    (profile as UserInfoDto | undefined)?.effectiveRoleTypes ?? [];
  const hasStaffProfile =
    typeof (profile as UserInfoDto | undefined)?.hasStaffProfile === "boolean"
      ? Boolean((profile as UserInfoDto).hasStaffProfile)
      : Boolean((profile as FullProfileDto | undefined)?.staffInfo?.id);
  const isStaff =
    profile?.roleType === "staff" ||
    effectiveRoleTypes.includes(Role.staff) ||
    (hasStaffProfile && profile?.roleType !== "guest");
  const adminTier = (profile as UserInfoDto | undefined)?.access?.admin?.tier;
  const isAccountantIncome =
    isStaff &&
    hasStaffProfile &&
    (staffRoles.includes("accountant") ||
      staffRoles.includes("accountant_income"));
  const isAccountantExpense =
    isStaff && hasStaffProfile && staffRoles.includes("accountant_expense");
  const isAccountant =
    adminTier === "accountant" || isAccountantIncome || isAccountantExpense;

  return {
    isAdmin:
      adminTier === "full" ||
      profile?.roleType === "admin" ||
      (isStaff && hasStaffProfile && staffRoles.includes("admin")),
    isAssistant:
      adminTier === "assistant" ||
      (isStaff && hasStaffProfile && staffRoles.includes("assistant")),
    isAccountant,
    isAccountantIncome,
    isAccountantExpense,
    isCustomerCare: isStaff && hasStaffProfile && staffRoles.includes("customer_care"),
    isLessonPlanHead:
      adminTier === "lesson_plan_head" ||
      isStaff && hasStaffProfile && staffRoles.includes("lesson_plan_head"),
    staffId:
      (profile as FullProfileDto | undefined)?.staffInfo?.id ??
      (hasStaffProfile ? "linked" : null),
    staffRoles,
  };
}

export function isAccountantAllowedAdminRoute(pathname: string): boolean {
  return ACCOUNTANT_ALLOWED_ROUTE_PATTERNS.some((pattern) =>
    pattern.test(pathname),
  );
}

export function isAccountantIncomeAllowedAdminRoute(pathname: string): boolean {
  return ACCOUNTANT_INCOME_ALLOWED_ROUTE_PATTERNS.some((pattern) =>
    pattern.test(pathname),
  );
}

export function isAccountantExpenseAllowedAdminRoute(pathname: string): boolean {
  return ACCOUNTANT_EXPENSE_ALLOWED_ROUTE_PATTERNS.some((pattern) =>
    pattern.test(pathname),
  );
}

export function isLessonManagementRoute(pathname: string): boolean {
  return LESSON_MANAGEMENT_ROUTE_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );
}

export function isStrictAdminRoute(pathname: string): boolean {
  return STRICT_ADMIN_ROUTE_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );
}

export function canAccessAdminShellRoute(
  access: AdminShellAccess,
  pathname: string,
): boolean {
  if (isStrictAdminRoute(pathname)) {
    return access.isAdmin;
  }

  return (
    access.isAdmin ||
    access.isAssistant ||
    (access.isAccountantIncome &&
      isAccountantIncomeAllowedAdminRoute(pathname)) ||
    (access.isAccountantExpense &&
      isAccountantExpenseAllowedAdminRoute(pathname)) ||
    (access.isLessonPlanHead && isLessonManagementRoute(pathname))
  );
}

export function canManageAdminExtraAllowance(access: AdminShellAccess): boolean {
  return access.isAdmin || access.isAssistant || access.isAccountantExpense;
}

export function resolveStudentAdminCapabilities(
  profile?: FullProfileDto | UserInfoDto | null,
  routeBase: string = "/admin",
): StudentAdminCapabilities {
  const access = resolveAdminShellAccess(profile);
  const isStaffRoute = routeBase === "/staff";
  const isCustomerCareStaff = isStaffRoute && access.isCustomerCare;
  const canManageStudent = access.isAdmin || access.isAssistant;
  const canEditStudentProfile = canManageStudent || isCustomerCareStaff;

  return {
    isCustomerCareReadOnlyView:
      isStaffRoute && !access.isAssistant && access.isCustomerCare,
    canManageStudent,
    canEditStudentProfile,
    canEditCustomerCareProfitPercent: access.isAdmin || access.isAssistant,
    canCreateWalletQr:
      access.isAdmin || access.isAssistant || isCustomerCareStaff,
    canDirectlyAdjustWallet: access.isAdmin,
    canDirectlyWithdrawWallet: access.isAdmin || access.isAssistant,
    canRequestDirectTopUp: access.isAssistant || isCustomerCareStaff,
    canEditStudentClassTuition: canManageStudent || access.isAccountantIncome,
    canDeleteStudent: access.isAdmin || access.isAssistant,
  };
}

export function resolveUserAdminCapabilities(
  profile?: FullProfileDto | UserInfoDto | null,
  routeBase: string = "/admin",
): UserAdminCapabilities {
  const access = resolveAdminShellAccess(profile);
  const isStaffRoute = routeBase === "/staff";

  return {
    canManageUsers: access.isAdmin || access.isAssistant,
    canDeleteUser: access.isAdmin || access.isAssistant,
    hideAdminRoleOptions:
      isStaffRoute && access.isAssistant && !access.isAdmin,
  };
}

export function resolveAdminShellFallbackHref(
  access: AdminShellAccess,
  pathname: string,
): string {
  if (pathname.startsWith("/admin/wallet-direct-topup-requests") && access.isAssistant) {
    return "/admin/students";
  }

  if (access.isAssistant) {
    return "/admin/dashboard";
  }

  if (access.isAccountantIncome) {
    return "/admin/classes";
  }

  if (access.isAccountantExpense) {
    return "/admin/classes";
  }

  if (access.isLessonPlanHead) {
    return "/admin/lesson-plans";
  }

  return "/";
}

export function getAdminShellEntryHref(
  profile?: FullProfileDto | UserInfoDto | null,
): string | null {
  const access = resolveAdminShellAccess(profile);

  if (access.isAdmin || access.isAssistant) {
    return "/admin/dashboard";
  }

  if (access.isAccountantIncome) {
    return "/admin/classes";
  }

  if (access.isAccountantExpense) {
    return "/admin/classes";
  }

  if (access.isLessonPlanHead) {
    return "/admin/lesson-plans";
  }

  return null;
}
