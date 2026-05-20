import { Role, type UserInfoDto } from "@/dtos/Auth.dto";
import type { FullProfileDto } from "@/dtos/profile.dto";

export type AdminShellAccess = {
  isAdmin: boolean;
  isAssistant: boolean;
  isAccountant: boolean;
  isCustomerCare: boolean;
  isLessonPlanHead: boolean;
  staffId: string | null;
  staffRoles: string[];
};

export const ACCOUNTANT_VISIBLE_HREFS = new Set([
  "/admin/classes",
  "/admin/staffs",
  "/admin/deductions",
  "/admin/costs",
  "/admin/lesson-plans",
]);

const ACCOUNTANT_ALLOWED_ROUTE_PATTERNS = [
  /^\/admin\/dashboard$/,
  /^\/admin\/classes(?:\/[^/]+)?$/,
  /^\/admin\/staffs(?:\/[^/]+)?$/,
  /^\/admin\/deductions$/,
  /^\/admin\/costs$/,
  /^\/admin\/lesson-plans$/,
  /^\/admin\/accountant_detail$/,
  /^\/admin\/assistant_detail$/,
  /^\/admin\/communication_detail$/,
  /^\/admin\/technical_detail$/,
  /^\/admin\/customer_care_detail\/[^/]+$/,
  /^\/admin\/lesson_plan_detail\/[^/]+$/,
] as const;

export const LESSON_MANAGEMENT_ROUTE_PREFIXES = [
  "/admin/lesson-plans",
  "/admin/lesson-manage-details",
  "/admin/lessons",
] as const;

export const STRICT_ADMIN_ROUTE_PREFIXES = [
  "/admin/notification",
  "/admin/wallet-direct-topup-requests",
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

  return {
    isAdmin:
      adminTier === "full" ||
      profile?.roleType === "admin" ||
      (isStaff && hasStaffProfile && staffRoles.includes("admin")),
    isAssistant:
      adminTier === "assistant" ||
      (isStaff && hasStaffProfile && staffRoles.includes("assistant")),
    isAccountant:
      adminTier === "accountant" ||
      (isStaff && hasStaffProfile && staffRoles.includes("accountant")),
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
    (access.isAccountant && isAccountantAllowedAdminRoute(pathname)) ||
    (access.isLessonPlanHead && isLessonManagementRoute(pathname))
  );
}

export function canManageAdminExtraAllowance(access: AdminShellAccess): boolean {
  return access.isAdmin || access.isAssistant || access.isAccountant;
}

export function resolveAdminShellFallbackHref(
  access: AdminShellAccess,
  pathname: string,
): string {
  if (pathname.startsWith("/admin/notification") && access.isAssistant) {
    return "/staff/notification";
  }

  if (access.isAssistant) {
    return "/admin/dashboard";
  }

  if (access.isAccountant) {
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

  if (access.isAccountant) {
    return "/admin/classes";
  }

  if (access.isLessonPlanHead) {
    return "/admin/lesson-plans";
  }

  return null;
}
