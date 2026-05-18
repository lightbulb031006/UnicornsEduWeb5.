import type { Request } from 'express';
import type { StaffRole, UserRole } from 'generated/enums';
import type {
  JwtPayload,
  JwtRefreshPayload,
} from './decorators/current-user.decorator';
import type { ResolvedAuthAccess } from './auth-access.service';

export interface CachedAuthIdentity {
  id: string;
  email: string;
  emailVerified?: boolean;
  dataProcessingConsentAcceptedAt?: Date | null;
  dataProcessingConsentVersion?: string | null;
  accountHandle: string;
  roleType: UserRole;
  status: string;
  requiresPasswordSetup: boolean;
  avatarPath: string | null;
}

export interface RequestWithResolvedAuthContext extends Request {
  user?: JwtPayload | JwtRefreshPayload;
  resolvedAuthIdentity?: CachedAuthIdentity | null;
  resolvedStaffRoles?: StaffRole[];
  resolvedAuthAccess?: ResolvedAuthAccess | null;
}
