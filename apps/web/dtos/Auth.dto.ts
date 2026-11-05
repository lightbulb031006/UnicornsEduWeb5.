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

/** `POST /auth/student/login` thành công: server đã set cookie phiên. */
export interface StudentLoginInitResponse {
  message: string;
}

/** Body lỗi 400 `EMAIL_NOT_VERIFIED` của `POST /auth/student/login`. */
export interface StudentLoginEmailNotVerifiedError {
  error: "EMAIL_NOT_VERIFIED";
  message: string;
  /** Có khi đã gửi được mail xác minh email trong cùng lần bấm. */
  maskedEmail?: string;
}

export interface StudentLoginPollResponse {
  verified: boolean;
}

export interface StudentActivateDto {
  requestId: string;
  activateSecret: string;
  rememberMe?: boolean;
}

export interface StudentActivateResponse {
  message: string;
}

export type VerifyLoginStatus = "verified" | "used" | "expired" | "invalid";

export interface VerifyLoginResponse {
  status: VerifyLoginStatus;
  message: string;
  verified: boolean;
}
