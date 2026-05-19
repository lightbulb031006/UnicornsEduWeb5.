import { NextRequest, NextResponse } from "next/server";
import {
  canAccessAdminShellRoute,
  resolveAdminShellAccess,
  resolveAdminShellFallbackHref,
} from "./lib/admin-shell-access";
import { getUser } from "./lib/auth-server";
import { shouldVerifySessionInProxy } from "./lib/proxy-auth-guard";
import { resolveStaffShellRouteAccess } from "./lib/staff-shell-access";
import { Role } from "./dtos/Auth.dto";

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

type FullProfileGuardPayload = {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  province?: string | null;
  dataConsentAcceptedAt?: string | null;
  dataConsentVersion?: string | null;
  requiresStaffDataConsent?: boolean;
  staffInfo?: {
    cccdNumber?: string | null;
    cccdIssuedDate?: string | null;
    cccdIssuedPlace?: string | null;
    birthDate?: string | null;
    university?: string | null;
    highSchool?: string | null;
    specialization?: string | null;
    bankAccount?: string | null;
    bankQrLink?: string | null;
    cccdFrontPath?: string | null;
    cccdBackPath?: string | null;
  } | null;
};

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidCccd(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^\d{12}$/.test(value.trim());
}

function isStaffProfileComplete(profile: FullProfileGuardPayload): boolean {
  const staffInfo = profile.staffInfo;
  if (!staffInfo) return false;

  return (
    hasText(profile.first_name) &&
    hasText(profile.last_name) &&
    hasText(profile.email) &&
    hasText(profile.phone) &&
    hasText(profile.province) &&
    hasText(profile.dataConsentAcceptedAt) &&
    hasText(profile.dataConsentVersion) &&
    profile.requiresStaffDataConsent !== true &&
    isValidCccd(staffInfo.cccdNumber) &&
    hasText(staffInfo.cccdIssuedDate) &&
    hasText(staffInfo.cccdIssuedPlace) &&
    hasText(staffInfo.birthDate) &&
    hasText(staffInfo.university) &&
    hasText(staffInfo.highSchool) &&
    hasText(staffInfo.specialization) &&
    hasText(staffInfo.bankAccount) &&
    hasText(staffInfo.bankQrLink) &&
    hasText(staffInfo.cccdFrontPath) &&
    hasText(staffInfo.cccdBackPath)
  );
}

function hasAuthenticatedSession(user: Awaited<ReturnType<typeof getUser>>) {
  return Boolean(user.id && user.accountHandle && user.roleType !== "guest");
}

function canAccessStudentShell(user: Awaited<ReturnType<typeof getUser>>) {
  return Boolean(user.access?.student?.canAccess ?? user.hasStudentProfile);
}

function hasStudentWorkspaceHint(user: Awaited<ReturnType<typeof getUser>>) {
  return (
    user.roleType === "student" ||
    Boolean(user.hasStudentProfile) ||
    Boolean(user.effectiveRoleTypes?.includes(Role.student))
  );
}

function canAccessStaffShell(user: Awaited<ReturnType<typeof getUser>>) {
  return Boolean(user.access?.staff?.canAccess ?? user.hasStaffProfile);
}

function canBypassStaffProfileGuard(user: Awaited<ReturnType<typeof getUser>>) {
  return (
    user.roleType === Role.admin ||
    user.access?.admin?.tier === "full" ||
    Boolean(user.effectiveRoleTypes?.includes(Role.admin))
  );
}

function redirectGuestToLogin(req: NextRequest) {
  const redirectUrl = new URL("/auth/login", req.url);
  redirectUrl.searchParams.set(
    "next",
    `${req.nextUrl.pathname}${req.nextUrl.search}`,
  );
  return NextResponse.redirect(redirectUrl);
}

async function fetchFullProfile(
  cookieHeader: string,
): Promise<FullProfileGuardPayload | null> {
  try {
    const response = await fetch(`${API_URL}/users/me/full`, {
      headers: { Cookie: cookieHeader },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as FullProfileGuardPayload;
  } catch {
    return null;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    !shouldVerifySessionInProxy({
      pathname,
      searchParams: req.nextUrl.searchParams,
      headers: req.headers,
    })
  ) {
    return NextResponse.next();
  }

  const user = await getUser(req.headers.get("cookie") ?? undefined);
  if (!hasAuthenticatedSession(user)) {
    return redirectGuestToLogin(req);
  }

  const isStaffRoute = pathname === "/staff" || pathname.startsWith("/staff/");
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");

  if (isAdminRoute) {
    const adminShellAccess = resolveAdminShellAccess(user);
    if (canAccessAdminShellRoute(adminShellAccess, pathname)) {
      if (canAccessStaffShell(user) && !canBypassStaffProfileGuard(user)) {
        if (user.staffProfileComplete === true) {
          return NextResponse.next();
        }

        const cookieHeader = req.headers.get("cookie") ?? "";
        const profile = await fetchFullProfile(cookieHeader);

        if (!profile || !isStaffProfileComplete(profile)) {
          const redirectUrl = new URL("/user-profile", req.url);
          redirectUrl.searchParams.set("profile_required", "1");
          redirectUrl.searchParams.set("from", pathname);
          return NextResponse.redirect(redirectUrl);
        }
      }

      return NextResponse.next();
    }

    return NextResponse.redirect(
      new URL(
        resolveAdminShellFallbackHref(adminShellAccess, pathname),
        req.url,
      ),
    );
  }

  if (isStaffRoute) {
    const staffShellAccess = resolveStaffShellRouteAccess(user, pathname);
    if (!staffShellAccess.isAllowed) {
      return NextResponse.redirect(
        new URL(
          staffShellAccess.redirectHref ??
            (canAccessStaffShell(user) ? "/staff" : "/"),
          req.url,
        ),
      );
    }
  }

  const isStudentRoute =
    pathname === "/student" || pathname.startsWith("/student/");
  if (isStudentRoute) {
    if (!canAccessStudentShell(user)) {
      return NextResponse.redirect(
        new URL(hasStudentWorkspaceHint(user) ? "/user-profile" : "/", req.url),
      );
    }
  }

  if (
    isStaffRoute &&
    canAccessStaffShell(user) &&
    !canBypassStaffProfileGuard(user)
  ) {
    if (user.staffProfileComplete === true) {
      return NextResponse.next();
    }

    const cookieHeader = req.headers.get("cookie") ?? "";
    const profile = await fetchFullProfile(cookieHeader);

    if (!profile || !isStaffProfileComplete(profile)) {
      const redirectUrl = new URL("/user-profile", req.url);
      redirectUrl.searchParams.set("profile_required", "1");
      redirectUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(redirectUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    {
      source: "/admin/:path*",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    {
      source: "/staff/:path*",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    {
      source: "/student/:path*",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    {
      source: "/user-profile/:path*",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
