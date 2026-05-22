import { Injectable } from '@nestjs/common';
import {
  StaffRole,
  StaffStatus,
  StudentStatus,
  UserRole,
} from 'generated/enums';
import {
  isActiveStaffProfile,
  isActiveStudentProfile,
} from 'src/common/profile-status.policy';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthIdentityCacheService } from './auth-identity-cache.service';
import type {
  CachedAuthIdentity,
  RequestWithResolvedAuthContext,
} from './auth-request-context';
import { STAFF_DATA_CONSENT_VERSION } from './constants';

export type AuthWorkspace = 'admin' | 'staff' | 'student';
export type AdminAccessTier =
  | 'full'
  | 'assistant'
  | 'accountant'
  | 'lesson_plan_head'
  | null;

export interface ResolvedAuthAccess {
  effectiveRoleTypes: UserRole[];
  staffRoles: StaffRole[];
  hasStaffProfile: boolean;
  hasStudentProfile: boolean;
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

type StaffProfileForAccess = {
  id: string;
  status: StaffStatus;
  cccdNumber: string | null;
  ethnicity: string | null;
  gender: string | null;
  currentAddress: string | null;
  cccdIssuedDate: Date | string | null;
  cccdIssuedPlace: string | null;
  birthDate: Date | string | null;
  university: string | null;
  highSchool: string | null;
  specialization: string | null;
  bankAccount: string | null;
  bankQrLink: string | null;
};

type StudentProfileForAccess = {
  id: string;
  status: StudentStatus;
};

type StaffConsentForAccess = {
  dataProcessingConsentAcceptedAt: Date | string | null;
  dataProcessingConsentVersion: string | null;
};

function appendUniqueRole(roles: UserRole[], role: UserRole) {
  if (!roles.includes(role)) {
    roles.push(role);
  }
}

function isValidCccd(value: string | null | undefined) {
  return typeof value === 'string' && /^\d{12}$/.test(value.trim());
}

function hasText(value: string | Date | null | undefined) {
  if (value instanceof Date) {
    return true;
  }

  return typeof value === 'string' && value.trim().length > 0;
}

function isStaffProfileComplete(staff: StaffProfileForAccess | null) {
  if (!staff) {
    return false;
  }

  return (
    isValidCccd(staff.cccdNumber) &&
    hasText(staff.ethnicity) &&
    hasText(staff.gender) &&
    hasText(staff.currentAddress) &&
    hasText(staff.cccdIssuedDate) &&
    hasText(staff.cccdIssuedPlace) &&
    hasText(staff.birthDate) &&
    hasText(staff.university) &&
    hasText(staff.highSchool) &&
    hasText(staff.specialization) &&
    hasText(staff.bankAccount) &&
    hasText(staff.bankQrLink)
  );
}

function hasCurrentStaffDataConsent(consent: StaffConsentForAccess) {
  return (
    hasText(consent.dataProcessingConsentAcceptedAt) &&
    consent.dataProcessingConsentVersion === STAFF_DATA_CONSENT_VERSION
  );
}

function resolveAdminTier(
  roleType: UserRole,
  staffRoles: StaffRole[],
): AdminAccessTier {
  if (roleType === UserRole.admin || staffRoles.includes(StaffRole.admin)) {
    return 'full';
  }

  if (staffRoles.includes(StaffRole.assistant)) {
    return 'assistant';
  }

  if (staffRoles.includes(StaffRole.accountant)) {
    return 'accountant';
  }

  if (staffRoles.includes(StaffRole.lesson_plan_head)) {
    return 'lesson_plan_head';
  }

  return null;
}

function resolveDefaultWorkspace(
  roleType: UserRole,
  hasStaffProfile: boolean,
  hasStudentProfile: boolean,
): AuthWorkspace | null {
  if (roleType === UserRole.admin) {
    return 'admin';
  }

  if (roleType === UserRole.student && hasStudentProfile) {
    return 'student';
  }

  if (hasStaffProfile) {
    return 'staff';
  }

  if (hasStudentProfile) {
    return 'student';
  }

  return null;
}

function resolvePreferredRedirect(
  roleType: UserRole,
  hasStaffProfile: boolean,
  hasStudentProfile: boolean,
) {
  if (roleType === UserRole.admin) {
    return '/admin/dashboard';
  }

  if (roleType === UserRole.student) {
    return hasStudentProfile ? '/student' : '/user-profile';
  }

  if (hasStaffProfile) {
    return '/staff';
  }

  if (hasStudentProfile) {
    return '/student';
  }

  return '/';
}

@Injectable()
export class AuthAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authIdentityCacheService: AuthIdentityCacheService,
  ) {}

  async resolveForUserId(
    userId: string,
    request?: RequestWithResolvedAuthContext,
  ): Promise<ResolvedAuthAccess | null> {
    if (request?.resolvedAuthAccess) {
      return request.resolvedAuthAccess;
    }

    const user = await this.authIdentityCacheService.getAuthIdentity(
      userId,
      request,
    );

    if (!user) {
      if (request) {
        request.resolvedAuthAccess = null;
      }
      return null;
    }

    return this.resolveForIdentity(user, request);
  }

  async resolveForIdentity(
    user: CachedAuthIdentity,
    request?: RequestWithResolvedAuthContext,
  ): Promise<ResolvedAuthAccess> {
    if (request?.resolvedAuthAccess) {
      return request.resolvedAuthAccess;
    }

    const profileLinks = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        dataProcessingConsentAcceptedAt: true,
        dataProcessingConsentVersion: true,
        staffInfo: {
          select: {
            id: true,
            status: true,
            cccdNumber: true,
            ethnicity: true,
            gender: true,
            currentAddress: true,
            cccdIssuedDate: true,
            cccdIssuedPlace: true,
            birthDate: true,
            university: true,
            highSchool: true,
            specialization: true,
            bankAccount: true,
            bankQrLink: true,
          },
        },
        studentInfo: { select: { id: true, status: true } },
      },
    });

    const staffProfile = profileLinks?.staffInfo ?? null;
    const studentProfile =
      (profileLinks?.studentInfo as StudentProfileForAccess | null) ?? null;
    const hasStaffProfile = Boolean(
      staffProfile?.id && isActiveStaffProfile(staffProfile.status),
    );
    const hasStudentProfile = Boolean(
      studentProfile?.id && isActiveStudentProfile(studentProfile.status),
    );
    const staffRoles = hasStaffProfile
      ? await this.authIdentityCacheService.getStaffRoles(user.id, request)
      : [];
    const adminTier = resolveAdminTier(user.roleType, staffRoles);
    const canBypassStaffWorkspaceProfile = adminTier === 'full';
    const effectiveRoleTypes: UserRole[] = [];

    if (user.roleType !== UserRole.guest) {
      appendUniqueRole(effectiveRoleTypes, user.roleType);
      if (hasStaffProfile) {
        appendUniqueRole(effectiveRoleTypes, UserRole.staff);
      }
      if (hasStudentProfile) {
        appendUniqueRole(effectiveRoleTypes, UserRole.student);
      }
      if (adminTier === 'full') {
        appendUniqueRole(effectiveRoleTypes, UserRole.admin);
      }
    } else {
      appendUniqueRole(effectiveRoleTypes, UserRole.guest);
    }

    const availableWorkspaces: AuthWorkspace[] = [];
    if (adminTier !== null) {
      availableWorkspaces.push('admin');
    }
    if (hasStaffProfile || canBypassStaffWorkspaceProfile) {
      availableWorkspaces.push('staff');
    }
    if (hasStudentProfile) {
      availableWorkspaces.push('student');
    }

    const defaultWorkspace = resolveDefaultWorkspace(
      user.roleType,
      hasStaffProfile,
      hasStudentProfile,
    );
    const preferredRedirect = resolvePreferredRedirect(
      user.roleType,
      hasStaffProfile,
      hasStudentProfile,
    );
    const staffProfileComplete =
      hasStaffProfile &&
      isStaffProfileComplete(staffProfile) &&
      hasCurrentStaffDataConsent({
        dataProcessingConsentAcceptedAt:
          profileLinks?.dataProcessingConsentAcceptedAt ?? null,
        dataProcessingConsentVersion:
          profileLinks?.dataProcessingConsentVersion ?? null,
      });

    const access: ResolvedAuthAccess = {
      effectiveRoleTypes,
      staffRoles,
      hasStaffProfile,
      hasStudentProfile,
      staffProfileComplete,
      availableWorkspaces,
      defaultWorkspace,
      preferredRedirect,
      access: {
        admin: {
          canAccess: adminTier !== null,
          tier: adminTier,
        },
        staff: {
          canAccess: hasStaffProfile || canBypassStaffWorkspaceProfile,
          profileComplete: staffProfileComplete,
        },
        student: {
          canAccess: hasStudentProfile,
        },
      },
    };

    if (request) {
      request.resolvedAuthAccess = access;
    }

    return access;
  }
}
