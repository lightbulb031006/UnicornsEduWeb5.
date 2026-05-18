import { Role, type UserInfoDto } from "@/dtos/Auth.dto";
import {
  canAccessAdminShellRoute,
  getAdminShellEntryHref,
  resolveAdminShellAccess,
} from "@/lib/admin-shell-access";
import { resolveStaffShellRouteAccess } from "@/lib/staff-shell-access";

const ROLE_REDIRECT: Record<string, string> = {
  admin: "/admin/dashboard",
  staff: "/staff",
  student: "/student",
  guest: "/",
};
const STAFF_DATA_CONSENT_PATH = "/staff/data-consent";

type SearchParamsLike = {
  get(name: string): string | null;
  toString(): string;
};

function isAuthPath(path: string) {
  return path === "/auth" || path.startsWith("/auth/");
}

export function readSafeNextPath(nextPath: string | null) {
  if (!nextPath || !nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return null;
  }

  if (isAuthPath(nextPath)) {
    return null;
  }

  return nextPath;
}

function getPathname(path: string) {
  return path.split(/[?#]/, 1)[0] || "/";
}

function canAccessStudentShell(session: UserInfoDto) {
  return Boolean(
    session.access?.student?.canAccess ?? session.hasStudentProfile,
  );
}

function isPrimaryAdmin(session: UserInfoDto) {
  return session.roleType === Role.admin;
}

function requiresStaffDataConsent(session: UserInfoDto) {
  return Boolean(
    session.requiresStaffDataConsent &&
    (session.access?.staff?.canAccess ?? session.hasStaffProfile),
  );
}

function canAccessRequestedPath(session: UserInfoDto, nextPath: string) {
  const pathname = getPathname(nextPath);

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return (
      isPrimaryAdmin(session) &&
      canAccessAdminShellRoute(resolveAdminShellAccess(session), pathname)
    );
  }

  if (pathname === "/staff" || pathname.startsWith("/staff/")) {
    return (
      session.roleType !== Role.student &&
      resolveStaffShellRouteAccess(session, pathname).isAllowed
    );
  }

  if (pathname === "/student" || pathname.startsWith("/student/")) {
    return session.roleType === Role.student && canAccessStudentShell(session);
  }

  return true;
}

export function resolvePostLoginRedirect(
  session: UserInfoDto,
  requestedNextPath?: string | null,
): string {
  if (session.canAccessRestrictedRoutes === false) {
    return "/";
  }

  if (requiresStaffDataConsent(session)) {
    return STAFF_DATA_CONSENT_PATH;
  }

  const safeNextPath = readSafeNextPath(requestedNextPath ?? null);
  if (safeNextPath && canAccessRequestedPath(session, safeNextPath)) {
    return safeNextPath;
  }

  const preferredRedirect = readSafeNextPath(session.preferredRedirect ?? null);
  if (preferredRedirect && canAccessRequestedPath(session, preferredRedirect)) {
    return preferredRedirect;
  }

  if (isPrimaryAdmin(session)) {
    return getAdminShellEntryHref(session) ?? ROLE_REDIRECT.admin;
  }

  if (session.roleType === Role.student) {
    return canAccessStudentShell(session)
      ? ROLE_REDIRECT.student
      : "/user-profile";
  }

  const staffShellAccess = resolveStaffShellRouteAccess(
    session,
    ROLE_REDIRECT.staff,
  );
  if (staffShellAccess.isAllowed) {
    return ROLE_REDIRECT.staff;
  }

  if (staffShellAccess.redirectHref) {
    return staffShellAccess.redirectHref;
  }

  if (canAccessStudentShell(session)) {
    return ROLE_REDIRECT.student;
  }

  return ROLE_REDIRECT[session.roleType] ?? "/";
}

export function buildSetupPasswordHref(nextPath: string) {
  return `/auth/setup-password?next=${encodeURIComponent(nextPath)}`;
}

export function resolvePasswordSetupNextPath(
  pathname: string,
  searchParams: SearchParamsLike,
) {
  const explicitNextPath = readSafeNextPath(searchParams.get("next"));
  if (explicitNextPath) {
    return explicitNextPath;
  }

  if (isAuthPath(pathname)) {
    return "/";
  }

  const search = searchParams.toString();
  const currentPath = `${pathname}${search ? `?${search}` : ""}`;
  return readSafeNextPath(currentPath) ?? "/";
}
