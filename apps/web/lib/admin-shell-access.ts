import { hasSaleCsHeadAccess } from "@/lib/sale-cs-head-access";
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
  canManageCustomerCareAssignment: boolean;
  canCreateWalletQr: boolean;
  canDirectlyAdjustWallet: boolean;
  canDirectlyWithdrawWallet: boolean;
  canRequestDirectTopUp: boolean;
  canEditStudentClassTuition: boolean;
  canViewWalletHistory: boolean;
  canDeleteStudent: boolean;
  /** 15/11: Trưởng phòng Sale & CSKH tạo học sinh kèm tài khoản (`POST /users/student`). */
  canCreateStudent: boolean;
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

/**
 * #267: trang quản trị mặc định đóng. Trợ lí (TP Sale & CSKH) chỉ còn Học sinh
 * (gồm ví học sinh) và Thông báo; mọi trang khác chỉ Admin.
 */
export const ASSISTANT_VISIBLE_HREFS = new Set([
  "/admin/students",
  // #272: Trưởng phòng xem mọi lớp (không lương gia sư), sửa Học phí lớp.
  "/admin/classes",
  "/admin/notification",
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

const ASSISTANT_ALLOWED_ROUTE_PATTERNS = [
  /^\/admin\/students(?:\/[^/]+)?$/,
  /^\/admin\/classes(?:\/[^/]+)?$/,
  /^\/admin\/notification$/,
] as const;

const ACCOUNTANT_INCOME_ALLOWED_ROUTE_PATTERNS = [
  /^\/admin\/classes(?:\/[^/]+)?$/,
  /^\/admin\/students(?:\/[^/]+)?$/,
  // #270: Kế toán thu không xem khoản chi nhân sự → bỏ trang trợ cấp kế toán.
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
  /^\/admin\/training_head_detail$/,
  /^\/admin\/sale_detail$/,
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
  // #269: Dashboard (kể cả /admin/dashboard/statistics), Báo cáo tháng,
  // Thống kê học sinh chỉ Admin.
  "/admin/dashboard",
  "/admin/monthly-report",
  "/admin/student-statistics",
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
    staffRoles.includes("accountant_income");
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
      adminTier === "sale_customer_care_head" ||
      (isStaff && hasStaffProfile && hasSaleCsHeadAccess(staffRoles)),
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

export function isAssistantAllowedAdminRoute(pathname: string): boolean {
  return ASSISTANT_ALLOWED_ROUTE_PATTERNS.some((pattern) =>
    pattern.test(pathname),
  );
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
  // `/admin` render lại trang dashboard (#269: chỉ Admin).
  if (pathname === "/admin" || pathname === "/admin/") {
    return true;
  }

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
    (access.isAssistant && isAssistantAllowedAdminRoute(pathname)) ||
    (access.isAccountantIncome &&
      isAccountantIncomeAllowedAdminRoute(pathname)) ||
    (access.isAccountantExpense &&
      isAccountantExpenseAllowedAdminRoute(pathname)) ||
    (access.isLessonPlanHead && isLessonManagementRoute(pathname))
  );
}

export function canManageAdminExtraAllowance(access: AdminShellAccess): boolean {
  // #267: trợ cấp thêm chỉ Admin (và kế toán chi theo phạm vi riêng).
  return access.isAdmin || access.isAccountantExpense;
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
    canManageCustomerCareAssignment: access.isAdmin || access.isAssistant,
    canCreateWalletQr:
      access.isAdmin || access.isAssistant || isCustomerCareStaff,
    canDirectlyAdjustWallet: access.isAdmin,
    canDirectlyWithdrawWallet: access.isAdmin || access.isAssistant,
    canRequestDirectTopUp: access.isAssistant || isCustomerCareStaff,
    // #267: học phí theo lớp thuộc quản lý lớp → chỉ Admin / kế toán thu.
    // #272: học phí riêng của học sinh — Admin, Trưởng phòng, Kế toán thu.
    canEditStudentClassTuition:
      access.isAdmin || access.isAssistant || access.isAccountantIncome,
    // Quyết định 13/11: Kế toán thu xem lịch sử ví để đối soát (chỉ xem).
    canViewWalletHistory: canManageStudent || access.isAccountantIncome,
    canDeleteStudent: access.isAdmin || access.isAssistant,
    canCreateStudent: access.isAssistant,
  };
}

export function resolveUserAdminCapabilities(
  profile?: FullProfileDto | UserInfoDto | null,
  routeBase: string = "/admin",
): UserAdminCapabilities {
  const access = resolveAdminShellAccess(profile);
  const isStaffRoute = routeBase === "/staff";

  return {
    // #267: quản lý tài khoản chỉ Admin.
    canManageUsers: access.isAdmin,
    canDeleteUser: access.isAdmin,
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

  if (access.isAdmin) {
    return "/admin/dashboard";
  }

  // #269: Trợ lí không còn vào dashboard admin → đáp về trang Học sinh.
  if (access.isAssistant) {
    return "/admin/students";
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

  if (access.isAdmin) {
    return "/admin/dashboard";
  }

  // #269: dashboard admin chỉ Admin.
  if (access.isAssistant) {
    return "/admin/students";
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
