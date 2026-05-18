import { StaffRole, UserRole } from 'generated/enums';
import { TokenPair } from 'src/auth/auth.service';
import type {
  AdminAccessTier,
  AuthWorkspace,
} from 'src/auth/auth-access.service';

export interface AuthProfileDto {
  id: string;
  email: string;
  emailVerified: boolean;
  dataConsentAcceptedAt: Date | null;
  dataConsentVersion: string | null;
  requiresStaffDataConsent: boolean;
  canAccessRestrictedRoutes: boolean;
  accountHandle: string;
  roleType: UserRole;
  requiresPasswordSetup: boolean;
  avatarUrl: string | null;
  staffRoles: StaffRole[];
  hasStaffProfile: boolean;
  hasStudentProfile: boolean;
  effectiveRoleTypes: UserRole[];
  staffProfileComplete: boolean;
  availableWorkspaces: AuthWorkspace[];
  defaultWorkspace: AuthWorkspace | null;
  preferredRedirect: string;
  access: {
    admin: {
      canAccess: boolean;
      tier: AdminAccessTier;
    };
    staff: {
      canAccess: boolean;
      profileComplete: boolean;
    };
    student: {
      canAccess: boolean;
    };
  };
}

export interface LoginResponseDto {
  id: string;
  accountHandle: string;
  roleType: UserRole;
  avatarUrl: string | null;
  tokenPair: TokenPair;
}
