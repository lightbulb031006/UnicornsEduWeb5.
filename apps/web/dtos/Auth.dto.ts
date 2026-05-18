export enum Role {
  admin = "admin",
  staff = "staff",
  student = "student",
  guest = "guest",
}

export interface LoginDto {
  accountHandle: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterDto {
  email: string;
  phone: string;
  password: string;
  accountHandle: string;
  first_name: string;
  last_name: string;
  province?: string;
}

export interface ForgotPasswordDto {
  email: string;
}

export interface ResetPasswordDto {
  token: string;
  password: string;
}

export interface UserInfoDto {
  id: string;
  email?: string;
  emailVerified?: boolean;
  dataConsentAcceptedAt?: string | null;
  dataConsentVersion?: string | null;
  requiresStaffDataConsent?: boolean;
  canAccessRestrictedRoutes?: boolean;
  accountHandle: string;
  roleType: Role;
  requiresPasswordSetup: boolean;
  avatarUrl?: string | null;
  staffRoles?: string[];
  hasStaffProfile?: boolean;
  hasStudentProfile?: boolean;
  effectiveRoleTypes?: Role[];
  staffProfileComplete?: boolean;
  availableWorkspaces?: Array<"admin" | "staff" | "student">;
  defaultWorkspace?: "admin" | "staff" | "student" | null;
  preferredRedirect?: string;
  access?: {
    admin?: {
      canAccess: boolean;
      tier: "full" | "assistant" | "accountant" | "lesson_plan_head" | null;
    };
    staff?: {
      canAccess: boolean;
      profileComplete: boolean;
    };
    student?: {
      canAccess: boolean;
    };
  };
}

export function createGuestUser(): UserInfoDto {
  return {
    id: "",
    email: "",
    emailVerified: false,
    dataConsentAcceptedAt: null,
    dataConsentVersion: null,
    requiresStaffDataConsent: false,
    canAccessRestrictedRoutes: false,
    accountHandle: "",
    roleType: Role.guest,
    requiresPasswordSetup: false,
    avatarUrl: null,
    staffRoles: [],
    hasStaffProfile: false,
    hasStudentProfile: false,
    effectiveRoleTypes: [Role.guest],
    staffProfileComplete: false,
    availableWorkspaces: [],
    defaultWorkspace: null,
    preferredRedirect: "/",
    access: {
      admin: { canAccess: false, tier: null },
      staff: { canAccess: false, profileComplete: false },
      student: { canAccess: false },
    },
  };
}

export interface LoginResponseDto {
  id: string;
  accountHandle: string;
  roleType: Role;
  avatarUrl?: string | null;
}

export interface SetupPasswordDto {
  password: string;
}
