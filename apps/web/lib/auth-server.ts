import { createGuestUser, Role, UserInfoDto } from "@/dtos/Auth.dto";
import { cookies } from "next/headers";

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
const AUTH_SESSION_CACHE_MODE: RequestCache = "no-store";

function buildCookieHeader(entries: Array<{ name: string; value: string }>) {
  return entries.map((entry) => `${entry.name}=${entry.value}`).join("; ");
}

function normalizeRole(value: unknown): Role | null {
  return typeof value === "string" &&
    Object.values(Role).includes(value as Role)
    ? (value as Role)
    : null;
}

function normalizeRoleList(value: unknown, fallback: Role[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const roles = value
    .map((role) => normalizeRole(role))
    .filter((role): role is Role => role !== null);
  return roles.length > 0 ? roles : fallback;
}

/**
 * Get the current user from auth cookies in a Server Component, Route Handler, Server Action, or proxy.
 * Calls the backend /auth/session endpoint and returns a guest user on unauthenticated/error states.
 */
const fetchAuthSession = async (requestCookieHeader: string) => {
  return fetch(`${API_URL}/auth/session`, {
    headers: {
      Cookie: requestCookieHeader,
    },
    // Keep auth correctness first: always read fresh session cookie state.
    cache: AUTH_SESSION_CACHE_MODE,
  });
};

export async function getUser(cookieHeader?: string): Promise<UserInfoDto> {
  const requestCookieHeader =
    cookieHeader ??
    buildCookieHeader(
      (await cookies()).getAll().map(({ name, value }) => ({ name, value })),
    );

  if (!requestCookieHeader.includes("refresh_token=")) {
    return createGuestUser();
  }

  try {
    const res = await fetchAuthSession(requestCookieHeader);

    if (!res.ok) {
      return createGuestUser();
    }

    const data = (await res.json()) as {
      id?: string;
      email?: string;
      emailVerified?: boolean;
      dataConsentAcceptedAt?: string | null;
      dataConsentVersion?: string | null;
      requiresStaffDataConsent?: boolean;
      canAccessRestrictedRoutes?: boolean;
      accountHandle?: string;
      roleType?: string;
      requiresPasswordSetup?: boolean;
      avatarUrl?: string | null;
      staffRoles?: string[];
      hasStaffProfile?: boolean;
      hasStudentProfile?: boolean;
      effectiveRoleTypes?: string[];
      staffProfileComplete?: boolean;
      availableWorkspaces?: Array<"admin" | "staff" | "student">;
      defaultWorkspace?: "admin" | "staff" | "student" | null;
      preferredRedirect?: string;
      access?: UserInfoDto["access"];
    };

    const roleType = normalizeRole(data.roleType) ?? Role.guest;

    return {
      id: data.id ?? "",
      email: data.email ?? "",
      emailVerified: Boolean(data.emailVerified),
      dataConsentAcceptedAt: data.dataConsentAcceptedAt ?? null,
      dataConsentVersion: data.dataConsentVersion ?? null,
      requiresStaffDataConsent: Boolean(data.requiresStaffDataConsent),
      canAccessRestrictedRoutes:
        typeof data.canAccessRestrictedRoutes === "boolean"
          ? data.canAccessRestrictedRoutes
          : false,
      accountHandle: data.accountHandle ?? "",
      roleType,
      requiresPasswordSetup:
        typeof data.requiresPasswordSetup === "boolean"
          ? data.requiresPasswordSetup
          : false,
      avatarUrl: data.avatarUrl ?? null,
      staffRoles: Array.isArray(data.staffRoles) ? data.staffRoles : [],
      hasStaffProfile: Boolean(data.hasStaffProfile),
      hasStudentProfile: Boolean(data.hasStudentProfile),
      effectiveRoleTypes: normalizeRoleList(data.effectiveRoleTypes, [
        roleType,
      ]),
      staffProfileComplete: Boolean(data.staffProfileComplete),
      availableWorkspaces: Array.isArray(data.availableWorkspaces)
        ? data.availableWorkspaces
        : [],
      defaultWorkspace: data.defaultWorkspace ?? null,
      preferredRedirect: data.preferredRedirect ?? "/",
      access: data.access ?? {
        admin: { canAccess: false, tier: null },
        staff: {
          canAccess: Boolean(data.hasStaffProfile),
          profileComplete: Boolean(data.staffProfileComplete),
        },
        student: { canAccess: Boolean(data.hasStudentProfile) },
      },
    };
  } catch {
    return createGuestUser();
  }
}
