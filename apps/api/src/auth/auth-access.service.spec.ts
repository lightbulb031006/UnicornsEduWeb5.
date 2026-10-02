jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));

import {
  StaffRole,
  StaffStatus,
  StudentStatus,
  UserRole,
} from '../../generated/enums';
import { AuthAccessService } from './auth-access.service';

describe('AuthAccessService', () => {
  const currentConsent = {
    dataProcessingConsentAcceptedAt: new Date('2026-05-19T00:00:00.000Z'),
    dataProcessingConsentVersion: '2026-05-19',
  };
  const missingConsent = {
    dataProcessingConsentAcceptedAt: null,
    dataProcessingConsentVersion: null,
  };

  const completeStaffInfo = {
    id: 'staff-1',
    status: StaffStatus.active,
    cccdNumber: '012345678901',
    cccdIssuedDate: new Date('2026-01-01T00:00:00.000Z'),
    cccdIssuedPlace: 'Ha Noi',
    birthDate: new Date('2000-01-01T00:00:00.000Z'),
    university: 'UE University',
    highSchool: 'UE High',
    specialization: 'Math',
    bankAccount: '123456789',
    bankQrLink: 'qr-link',
    ethnicity: 'Kinh',
    gender: 'male',
    currentAddress: 'Ha Noi',
    personalAchievementLink: 'https://drive.google.com/file/d/example',
  };

  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
  };
  const authIdentityCacheService = {
    getAuthIdentity: jest.fn(),
    getStaffRoles: jest.fn(),
  };

  let service: AuthAccessService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthAccessService(
      prisma as never,
      authIdentityCacheService as never,
    );
  });

  it('unions primary, linked staff, linked student, and full admin access', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...currentConsent,
      staffInfo: completeStaffInfo,
      studentInfo: { id: 'student-1', status: StudentStatus.active },
    });
    authIdentityCacheService.getStaffRoles.mockResolvedValue([StaffRole.admin]);

    await expect(
      service.resolveForIdentity({
        id: 'user-1',
        email: 'overlap@example.com',
        accountHandle: 'overlap',
        roleType: UserRole.student,
        status: 'active',
        emailVerified: true,
        avatarPath: 'users/user-1/avatar',
        requiresPasswordSetup: false,
      }),
    ).resolves.toEqual({
      effectiveRoleTypes: [UserRole.student, UserRole.staff, UserRole.admin],
      staffRoles: [StaffRole.admin],
      hasStaffProfile: true,
      hasStudentProfile: true,
      staffProfileComplete: true,
      availableWorkspaces: ['admin', 'staff', 'student'],
      defaultWorkspace: 'student',
      preferredRedirect: '/student',
      access: {
        admin: { canAccess: true, tier: 'full' },
        staff: { canAccess: true, profileComplete: true },
        student: { canAccess: true },
      },
    });
    expect(authIdentityCacheService.getStaffRoles).toHaveBeenCalledWith(
      'user-1',
      undefined,
    );
  });

  it('uses staff as the login landing workspace for non-admin staff roles', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...currentConsent,
      staffInfo: {
        ...completeStaffInfo,
        id: 'staff-2',
        specialization: 'Accounting',
      },
      studentInfo: null,
    });
    authIdentityCacheService.getStaffRoles.mockResolvedValue([
      StaffRole.accountant,
    ]);

    await expect(
      service.resolveForIdentity({
        id: 'user-2',
        email: 'accountant@example.com',
        accountHandle: 'accountant',
        roleType: UserRole.staff,
        status: 'active',
        emailVerified: true,
        avatarPath: 'users/user-2/avatar',
        requiresPasswordSetup: false,
      }),
    ).resolves.toMatchObject({
      effectiveRoleTypes: [UserRole.staff],
      staffRoles: [StaffRole.accountant],
      hasStaffProfile: true,
      hasStudentProfile: false,
      staffProfileComplete: true,
      availableWorkspaces: ['admin', 'staff'],
      defaultWorkspace: 'staff',
      preferredRedirect: '/staff',
      access: {
        admin: { canAccess: true, tier: 'accountant' },
        staff: { canAccess: true, profileComplete: true },
        student: { canAccess: false },
      },
    });
  });

  it('lets primary admin access staff workspace without a staff profile', async () => {
    prisma.user.findUnique.mockResolvedValue({
      staffInfo: null,
      studentInfo: null,
    });

    await expect(
      service.resolveForIdentity({
        id: 'admin-1',
        email: 'admin@example.com',
        accountHandle: 'admin',
        roleType: UserRole.admin,
        status: 'active',
        emailVerified: true,
        avatarPath: null,
        requiresPasswordSetup: false,
      }),
    ).resolves.toMatchObject({
      effectiveRoleTypes: [UserRole.admin],
      staffRoles: [],
      hasStaffProfile: false,
      hasStudentProfile: false,
      staffProfileComplete: false,
      availableWorkspaces: ['admin', 'staff'],
      defaultWorkspace: 'admin',
      preferredRedirect: '/admin/dashboard',
      access: {
        admin: { canAccess: true, tier: 'full' },
        staff: { canAccess: true, profileComplete: false },
        student: { canAccess: false },
      },
    });
    expect(authIdentityCacheService.getStaffRoles).not.toHaveBeenCalled();
  });

  it('does not grant staff workspace from primary role alone without a staff profile', async () => {
    prisma.user.findUnique.mockResolvedValue({
      staffInfo: null,
      studentInfo: { id: 'student-1', status: StudentStatus.active },
    });

    await expect(
      service.resolveForIdentity({
        id: 'user-2',
        email: 'staff-without-profile@example.com',
        accountHandle: 'staff-without-profile',
        roleType: UserRole.staff,
        status: 'active',
        emailVerified: true,
        avatarPath: null,
        requiresPasswordSetup: false,
      }),
    ).resolves.toMatchObject({
      effectiveRoleTypes: [UserRole.staff, UserRole.student],
      staffRoles: [],
      hasStaffProfile: false,
      hasStudentProfile: true,
      availableWorkspaces: ['student'],
      defaultWorkspace: 'student',
      preferredRedirect: '/student',
      access: {
        admin: { canAccess: false, tier: null },
        staff: { canAccess: false, profileComplete: false },
        student: { canAccess: true },
      },
    });
    expect(authIdentityCacheService.getStaffRoles).not.toHaveBeenCalled();
  });

  it('requires the current data consent version before a staff profile is complete', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...missingConsent,
      staffInfo: {
        ...completeStaffInfo,
        id: 'staff-3',
      },
      studentInfo: null,
    });
    authIdentityCacheService.getStaffRoles.mockResolvedValue([
      StaffRole.teacher,
    ]);

    await expect(
      service.resolveForIdentity({
        id: 'user-3',
        email: 'teacher@example.com',
        accountHandle: 'teacher',
        roleType: UserRole.staff,
        status: 'active',
        emailVerified: true,
        avatarPath: 'users/user-3/avatar',
        requiresPasswordSetup: false,
      }),
    ).resolves.toMatchObject({
      hasStaffProfile: true,
      staffProfileComplete: false,
      access: {
        staff: { canAccess: true, profileComplete: false },
      },
    });
  });

  it('requires avatar before a staff profile is complete', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...currentConsent,
      staffInfo: {
        ...completeStaffInfo,
        id: 'staff-4',
      },
      studentInfo: null,
    });
    authIdentityCacheService.getStaffRoles.mockResolvedValue([
      StaffRole.teacher,
    ]);

    await expect(
      service.resolveForIdentity({
        id: 'user-4',
        email: 'teacher-no-avatar@example.com',
        accountHandle: 'teacher-no-avatar',
        roleType: UserRole.staff,
        status: 'active',
        emailVerified: true,
        avatarPath: null,
        requiresPasswordSetup: false,
      }),
    ).resolves.toMatchObject({
      hasStaffProfile: true,
      staffProfileComplete: false,
      access: {
        staff: { canAccess: true, profileComplete: false },
      },
    });
  });

  it('does not require personal achievement link for a complete staff profile', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...currentConsent,
      staffInfo: {
        ...completeStaffInfo,
        id: 'staff-5',
        personalAchievementLink: null,
        specialization: null,
      },
      studentInfo: null,
    });
    authIdentityCacheService.getStaffRoles.mockResolvedValue([
      StaffRole.teacher,
    ]);

    await expect(
      service.resolveForIdentity({
        id: 'user-5',
        email: 'teacher-no-achievement@example.com',
        accountHandle: 'teacher-no-achievement',
        roleType: UserRole.staff,
        status: 'active',
        emailVerified: true,
        avatarPath: 'users/user-5/avatar',
        requiresPasswordSetup: false,
      }),
    ).resolves.toMatchObject({
      hasStaffProfile: true,
      staffProfileComplete: true,
      access: {
        staff: { canAccess: true, profileComplete: true },
      },
    });
  });

  it('does not grant staff or staff-derived admin access from an inactive staff profile', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...currentConsent,
      staffInfo: {
        ...completeStaffInfo,
        id: 'staff-inactive',
        status: StaffStatus.inactive,
      },
      studentInfo: null,
    });

    await expect(
      service.resolveForIdentity({
        id: 'inactive-staff-user',
        email: 'inactive-staff@example.com',
        accountHandle: 'inactive-staff',
        roleType: UserRole.staff,
        status: 'active',
        emailVerified: true,
        avatarPath: 'users/inactive-staff-user/avatar',
        requiresPasswordSetup: false,
      }),
    ).resolves.toMatchObject({
      effectiveRoleTypes: [UserRole.staff],
      staffRoles: [],
      hasStaffProfile: false,
      hasStudentProfile: false,
      availableWorkspaces: [],
      defaultWorkspace: null,
      preferredRedirect: '/',
      access: {
        admin: { canAccess: false, tier: null },
        staff: { canAccess: false, profileComplete: false },
        student: { canAccess: false },
      },
    });
    expect(authIdentityCacheService.getStaffRoles).not.toHaveBeenCalled();
  });

  it('does not grant student workspace access from an inactive student profile', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...currentConsent,
      staffInfo: null,
      studentInfo: { id: 'student-inactive', status: StudentStatus.inactive },
    });

    await expect(
      service.resolveForIdentity({
        id: 'inactive-student-user',
        email: 'inactive-student@example.com',
        accountHandle: 'inactive-student',
        roleType: UserRole.student,
        status: 'active',
        emailVerified: true,
        avatarPath: null,
        requiresPasswordSetup: false,
      }),
    ).resolves.toMatchObject({
      effectiveRoleTypes: [UserRole.student],
      staffRoles: [],
      hasStaffProfile: false,
      hasStudentProfile: false,
      availableWorkspaces: [],
      defaultWorkspace: null,
      preferredRedirect: '/user-profile',
      access: {
        admin: { canAccess: false, tier: null },
        staff: { canAccess: false, profileComplete: false },
        student: { canAccess: false },
      },
    });
  });
});
