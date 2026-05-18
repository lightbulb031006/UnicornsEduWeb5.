jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));
jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

import * as bcrypt from 'bcrypt';
import { ServiceUnavailableException } from '@nestjs/common';
import { StaffRole, UserRole } from '../../generated/enums';
import { AuthService, STAFF_DATA_CONSENT_VERSION } from './auth.service';

describe('AuthService', () => {
  type ConsentUpdateArgs = {
    where: { id: string };
    data: {
      dataProcessingConsentAcceptedAt: Date;
      dataProcessingConsentVersion: string;
    };
    select: {
      id: boolean;
      email: boolean;
      roleType: boolean;
      dataProcessingConsentAcceptedAt: boolean;
      dataProcessingConsentVersion: boolean;
    };
  };

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const configService = {
    getOrThrow: jest.fn((key: string) => `${key}-value`),
  };

  const jwtService = {
    signAsync: jest.fn().mockResolvedValue('token'),
    verifyAsync: jest.fn(),
  };

  const mailService = {
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendForgotPasswordEmail: jest.fn().mockResolvedValue(undefined),
  };

  const actionHistoryService = {
    recordCreate: jest.fn(),
    recordUpdate: jest.fn(),
    recordDelete: jest.fn(),
  };
  const authIdentityCacheService = {
    getAuthIdentity: jest.fn(),
    getStaffRoles: jest.fn(),
    invalidateUser: jest.fn(),
  };
  const authAccessService = {
    resolveForIdentity: jest.fn(),
  };

  let service: AuthService;

  function buildAuthAccess(
    overrides: {
      effectiveRoleTypes?: UserRole[];
      staffRoles?: StaffRole[];
      hasStaffProfile?: boolean;
      hasStudentProfile?: boolean;
      staffProfileComplete?: boolean;
      availableWorkspaces?: Array<'admin' | 'staff' | 'student'>;
      defaultWorkspace?: 'admin' | 'staff' | 'student' | null;
      preferredRedirect?: string;
      adminTier?:
        | 'full'
        | 'assistant'
        | 'accountant'
        | 'lesson_plan_head'
        | null;
    } = {},
  ) {
    const adminTier = overrides.adminTier ?? null;
    return {
      effectiveRoleTypes: overrides.effectiveRoleTypes ?? [UserRole.guest],
      staffRoles: overrides.staffRoles ?? [],
      hasStaffProfile: overrides.hasStaffProfile ?? false,
      hasStudentProfile: overrides.hasStudentProfile ?? false,
      staffProfileComplete: overrides.staffProfileComplete ?? false,
      availableWorkspaces: overrides.availableWorkspaces ?? [],
      defaultWorkspace: overrides.defaultWorkspace ?? null,
      preferredRedirect: overrides.preferredRedirect ?? '/',
      access: {
        admin: { canAccess: adminTier !== null, tier: adminTier },
        staff: {
          canAccess: overrides.hasStaffProfile ?? false,
          profileComplete: overrides.staffProfileComplete ?? false,
        },
        student: { canAccess: overrides.hasStudentProfile ?? false },
      },
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      (callback: (db: typeof mockPrisma) => unknown) => callback(mockPrisma),
    );
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
    service = new AuthService(
      mockPrisma as never,
      configService as never,
      jwtService as never,
      mailService as never,
      actionHistoryService as never,
      authIdentityCacheService as never,
      authAccessService as never,
    );
  });

  it('records action history after registering a new user', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'new-user@example.com',
        phone: '0123456789',
        passwordHash: 'hashed-password',
        refreshToken: null,
        first_name: 'New',
        last_name: 'User',
        roleType: UserRole.guest,
        province: 'Hanoi',
        accountHandle: 'new-user',
        emailVerified: false,
        phoneVerified: false,
        linkId: null,
        status: 'active',
        createdAt: new Date('2026-03-20T10:00:00.000Z'),
        updatedAt: new Date('2026-03-20T10:00:00.000Z'),
        staffInfo: null,
        studentInfo: null,
      });
    mockPrisma.user.upsert.mockResolvedValue({
      id: 'user-1',
      email: 'new-user@example.com',
      phone: '0123456789',
      passwordHash: 'hashed-password',
      refreshToken: null,
      first_name: 'New',
      last_name: 'User',
      roleType: UserRole.guest,
      province: 'Hanoi',
      accountHandle: 'new-user',
      emailVerified: false,
      phoneVerified: false,
      linkId: null,
      status: 'active',
      createdAt: new Date('2026-03-20T10:00:00.000Z'),
      updatedAt: new Date('2026-03-20T10:00:00.000Z'),
    });

    await service.register({
      email: 'new-user@example.com',
      phone: '0123456789',
      password: 'secret',
      first_name: 'New',
      last_name: 'User',
      province: 'Hanoi',
      accountHandle: 'new-user',
    });

    expect(actionHistoryService.recordCreate).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({
        entityType: 'user',
        entityId: 'user-1',
      }),
    );
    expect(mailService.sendVerificationEmail).toHaveBeenCalledWith(
      'new-user@example.com',
      'token',
    );
  });

  it('uses a custom audit actor and message when admin provisions a user', async () => {
    const adminActor = {
      userId: 'admin-1',
      userEmail: 'admin@example.com',
      roleType: UserRole.admin,
    };

    mockPrisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'user-2',
        email: 'staff@example.com',
        phone: '0901234567',
        passwordHash: 'hashed-password',
        refreshToken: null,
        first_name: 'Staff',
        last_name: 'Candidate',
        roleType: UserRole.guest,
        province: 'Da Nang',
        accountHandle: 'staff-candidate',
        emailVerified: false,
        phoneVerified: false,
        linkId: null,
        status: 'active',
        createdAt: new Date('2026-03-20T10:00:00.000Z'),
        updatedAt: new Date('2026-03-20T10:00:00.000Z'),
        staffInfo: null,
        studentInfo: null,
      });
    mockPrisma.user.upsert.mockResolvedValue({
      id: 'user-2',
      email: 'staff@example.com',
      phone: '0901234567',
      passwordHash: 'hashed-password',
      refreshToken: null,
      first_name: 'Staff',
      last_name: 'Candidate',
      roleType: UserRole.guest,
      province: 'Da Nang',
      accountHandle: 'staff-candidate',
      emailVerified: false,
      phoneVerified: false,
      linkId: null,
      status: 'active',
      createdAt: new Date('2026-03-20T10:00:00.000Z'),
      updatedAt: new Date('2026-03-20T10:00:00.000Z'),
    });

    await expect(
      service.createPendingUserWithVerificationEmail(
        {
          email: 'staff@example.com',
          password: 'secret',
          accountHandle: 'staff-candidate',
        },
        {
          auditActor: adminActor,
          createDescription: 'Tạo người dùng từ trang quản trị',
          successMessage: 'Tạo user thành công. Email xác thực đã được gửi.',
        },
      ),
    ).resolves.toEqual({
      message: 'Tạo user thành công. Email xác thực đã được gửi.',
    });

    expect(actionHistoryService.recordCreate).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({
        actor: adminActor,
        entityType: 'user',
        entityId: 'user-2',
        description: 'Tạo người dùng từ trang quản trị',
      }),
    );
  });

  it('provisions users without legacy person profile linkage fields', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'user-3',
        email: 'clean-schema@example.com',
        phone: '0909999999',
        passwordHash: 'hashed-password',
        refreshToken: null,
        first_name: 'Clean',
        last_name: 'Schema',
        roleType: UserRole.guest,
        province: 'HCM',
        accountHandle: 'clean-schema',
        emailVerified: false,
        phoneVerified: false,
        linkId: null,
        status: 'active',
        createdAt: new Date('2026-03-20T10:00:00.000Z'),
        updatedAt: new Date('2026-03-20T10:00:00.000Z'),
        staffInfo: null,
        studentInfo: null,
      });
    mockPrisma.user.upsert.mockResolvedValue({
      id: 'user-3',
      email: 'clean-schema@example.com',
      phone: '0909999999',
      passwordHash: 'hashed-password',
      refreshToken: null,
      first_name: 'Clean',
      last_name: 'Schema',
      roleType: UserRole.guest,
      province: 'HCM',
      accountHandle: 'clean-schema',
      emailVerified: false,
      phoneVerified: false,
      linkId: null,
      status: 'active',
      createdAt: new Date('2026-03-20T10:00:00.000Z'),
      updatedAt: new Date('2026-03-20T10:00:00.000Z'),
    });

    await service.createPendingUserWithVerificationEmail({
      email: 'clean-schema@example.com',
      phone: '0909999999',
      password: 'secret',
      first_name: 'Clean',
      last_name: 'Schema',
      province: 'HCM',
      accountHandle: 'clean-schema',
    });

    const upsertMock = mockPrisma.user.upsert as jest.MockedFunction<
      (args: {
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => unknown
    >;
    const upsertArgs = upsertMock.mock.lastCall?.[0];
    expect(upsertArgs).toBeDefined();
    expect(upsertArgs?.create).not.toHaveProperty('personProfileId');
    expect(upsertArgs?.create).not.toHaveProperty('person_profile_id');
    expect(upsertArgs?.update).not.toHaveProperty('personProfileId');
    expect(upsertArgs?.update).not.toHaveProperty('person_profile_id');
  });

  it('returns requiresPasswordSetup when the user has no password hash', async () => {
    authIdentityCacheService.getAuthIdentity.mockResolvedValue({
      id: 'user-1',
      email: 'google-user@example.com',
      emailVerified: false,
      accountHandle: 'google-user',
      roleType: UserRole.guest,
      status: 'active',
      requiresPasswordSetup: true,
    });
    authAccessService.resolveForIdentity.mockResolvedValue(
      buildAuthAccess({
        effectiveRoleTypes: [UserRole.guest],
      }),
    );

    await expect(service.getAuthProfile('user-1')).resolves.toEqual({
      id: 'user-1',
      email: 'google-user@example.com',
      emailVerified: false,
      dataConsentAcceptedAt: null,
      dataConsentVersion: null,
      requiresStaffDataConsent: false,
      canAccessRestrictedRoutes: false,
      accountHandle: 'google-user',
      roleType: UserRole.guest,
      requiresPasswordSetup: true,
      avatarUrl: null,
      staffRoles: [],
      hasStaffProfile: false,
      hasStudentProfile: false,
      effectiveRoleTypes: [UserRole.guest],
      staffProfileComplete: false,
      availableWorkspaces: [],
      defaultWorkspace: null,
      preferredRedirect: '/',
      access: {
        admin: { canAccess: false, tier: null },
        staff: { canAccess: false, profileComplete: false },
        student: { canAccess: false },
      },
    });
    expect(authIdentityCacheService.getAuthIdentity).toHaveBeenCalledWith(
      'user-1',
      undefined,
    );
  });

  it('lets admin access restricted routes before email verification', async () => {
    authIdentityCacheService.getAuthIdentity.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@example.com',
      emailVerified: false,
      accountHandle: 'admin',
      roleType: UserRole.admin,
      status: 'active',
      requiresPasswordSetup: false,
    });
    authAccessService.resolveForIdentity.mockResolvedValue(
      buildAuthAccess({
        effectiveRoleTypes: [UserRole.admin],
        availableWorkspaces: ['admin'],
        defaultWorkspace: 'admin',
        preferredRedirect: '/admin/dashboard',
        adminTier: 'full',
      }),
    );

    await expect(service.getAuthProfile('admin-1')).resolves.toEqual({
      id: 'admin-1',
      email: 'admin@example.com',
      emailVerified: false,
      dataConsentAcceptedAt: null,
      dataConsentVersion: null,
      requiresStaffDataConsent: false,
      canAccessRestrictedRoutes: true,
      accountHandle: 'admin',
      roleType: UserRole.admin,
      requiresPasswordSetup: false,
      avatarUrl: null,
      staffRoles: [],
      hasStaffProfile: false,
      hasStudentProfile: false,
      effectiveRoleTypes: [UserRole.admin],
      staffProfileComplete: false,
      availableWorkspaces: ['admin'],
      defaultWorkspace: 'admin',
      preferredRedirect: '/admin/dashboard',
      access: {
        admin: { canAccess: true, tier: 'full' },
        staff: { canAccess: false, profileComplete: false },
        student: { canAccess: false },
      },
    });
  });

  it('lets staff admin access restricted routes before email verification', async () => {
    authIdentityCacheService.getAuthIdentity.mockResolvedValue({
      id: 'staff-admin-1',
      email: 'staff-admin@example.com',
      emailVerified: false,
      accountHandle: 'staff-admin',
      roleType: UserRole.staff,
      status: 'active',
      requiresPasswordSetup: false,
    });
    authAccessService.resolveForIdentity.mockResolvedValue(
      buildAuthAccess({
        effectiveRoleTypes: [UserRole.staff, UserRole.admin],
        staffRoles: [StaffRole.admin],
        hasStaffProfile: true,
        availableWorkspaces: ['admin', 'staff'],
        defaultWorkspace: 'admin',
        preferredRedirect: '/admin/dashboard',
        adminTier: 'full',
      }),
    );

    await expect(service.getAuthProfile('staff-admin-1')).resolves.toEqual({
      id: 'staff-admin-1',
      email: 'staff-admin@example.com',
      emailVerified: false,
      dataConsentAcceptedAt: null,
      dataConsentVersion: null,
      requiresStaffDataConsent: false,
      canAccessRestrictedRoutes: true,
      accountHandle: 'staff-admin',
      roleType: UserRole.staff,
      requiresPasswordSetup: false,
      avatarUrl: null,
      staffRoles: [StaffRole.admin],
      hasStaffProfile: true,
      hasStudentProfile: false,
      effectiveRoleTypes: [UserRole.staff, UserRole.admin],
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
  });

  it('requires data consent for verified staff without the current consent version', async () => {
    authIdentityCacheService.getAuthIdentity.mockResolvedValue({
      id: 'staff-1',
      email: 'staff@example.com',
      emailVerified: true,
      dataProcessingConsentAcceptedAt: null,
      dataProcessingConsentVersion: null,
      accountHandle: 'staff',
      roleType: UserRole.staff,
      status: 'active',
      requiresPasswordSetup: false,
    });
    authAccessService.resolveForIdentity.mockResolvedValue(
      buildAuthAccess({
        effectiveRoleTypes: [UserRole.staff],
        staffRoles: [StaffRole.teacher],
        hasStaffProfile: true,
        availableWorkspaces: ['staff'],
        defaultWorkspace: 'staff',
        preferredRedirect: '/staff',
      }),
    );

    await expect(service.getAuthProfile('staff-1')).resolves.toEqual(
      expect.objectContaining({
        id: 'staff-1',
        emailVerified: true,
        dataConsentAcceptedAt: null,
        dataConsentVersion: null,
        requiresStaffDataConsent: true,
      }),
    );
  });

  it('accepts the current staff data consent version', async () => {
    const acceptedAt = new Date('2026-05-19T00:00:00.000Z');
    mockPrisma.user.update.mockResolvedValue({
      id: 'staff-1',
      dataProcessingConsentAcceptedAt: acceptedAt,
      dataProcessingConsentVersion: STAFF_DATA_CONSENT_VERSION,
    });

    await expect(service.acceptDataConsent('staff-1')).resolves.toEqual({
      message: 'Đã ghi nhận đồng ý điều khoản xử lý dữ liệu cá nhân.',
      dataConsentAcceptedAt: acceptedAt,
      dataConsentVersion: STAFF_DATA_CONSENT_VERSION,
    });

    const updateMock = mockPrisma.user.update as jest.MockedFunction<
      (args: ConsentUpdateArgs) => unknown
    >;
    const updateArgs = updateMock.mock.calls.at(-1)?.[0];
    expect(updateArgs).toBeDefined();
    expect(updateArgs?.data.dataProcessingConsentAcceptedAt).toBeInstanceOf(
      Date,
    );
    expect(updateArgs).toMatchObject({
      where: { id: 'staff-1' },
      data: {
        dataProcessingConsentVersion: STAFF_DATA_CONSENT_VERSION,
      },
      select: {
        id: true,
        email: true,
        roleType: true,
        dataProcessingConsentAcceptedAt: true,
        dataProcessingConsentVersion: true,
      },
    });
    expect(authIdentityCacheService.invalidateUser).toHaveBeenCalledWith(
      'staff-1',
    );
  });

  it('sets the first password for an OAuth user and records action history', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'user-1',
        passwordHash: null,
      })
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'google-user@example.com',
        phone: '0123456789',
        passwordHash: null,
        refreshToken: 'old-refresh-token',
        first_name: 'Google',
        last_name: 'User',
        roleType: UserRole.guest,
        province: 'Hanoi',
        accountHandle: 'google-user@example.com',
        emailVerified: true,
        phoneVerified: false,
        linkId: null,
        status: 'active',
        createdAt: new Date('2026-03-20T10:00:00.000Z'),
        updatedAt: new Date('2026-03-20T10:00:00.000Z'),
        staffInfo: null,
        studentInfo: null,
      })
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'google-user@example.com',
        phone: '0123456789',
        passwordHash: 'hashed-password',
        refreshToken: null,
        first_name: 'Google',
        last_name: 'User',
        roleType: UserRole.guest,
        province: 'Hanoi',
        accountHandle: 'google-user@example.com',
        emailVerified: true,
        phoneVerified: false,
        linkId: null,
        status: 'active',
        createdAt: new Date('2026-03-20T10:00:00.000Z'),
        updatedAt: new Date('2026-03-20T11:00:00.000Z'),
        staffInfo: null,
        studentInfo: null,
      });
    mockPrisma.user.update.mockResolvedValue({
      id: 'user-1',
      email: 'google-user@example.com',
      roleType: UserRole.guest,
    });

    await expect(
      service.setupPassword('user-1', 'secret-123'),
    ).resolves.toEqual({
      message: 'Thiết lập mật khẩu thành công',
    });

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        passwordHash: 'hashed-password',
        refreshToken: null,
      },
      select: {
        id: true,
        email: true,
        roleType: true,
      },
    });
    expect(actionHistoryService.recordUpdate).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({
        entityType: 'user',
        entityId: 'user-1',
        description: 'Thiết lập mật khẩu ban đầu qua Google OAuth',
      }),
    );
    expect(authIdentityCacheService.invalidateUser).toHaveBeenCalledWith(
      'user-1',
    );
  });

  it('resends verification email and updates email when provided', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'old@example.com',
      })
      .mockResolvedValueOnce(null);
    mockPrisma.user.update.mockResolvedValue({
      id: 'user-1',
      email: 'new@example.com',
      emailVerified: false,
    });

    await expect(
      service.resendVerificationEmail('user-1', 'new@example.com'),
    ).resolves.toEqual({
      message: 'Verification email sent successfully.',
      email: 'new@example.com',
    });

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        email: 'new@example.com',
        emailVerified: false,
      },
    });
    expect(mailService.sendVerificationEmail).toHaveBeenCalledWith(
      'new@example.com',
      'token',
    );
  });

  it('preserves SMTP configuration errors when resending verification email', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      email: 'pending@example.com',
    });
    mailService.sendVerificationEmail.mockRejectedValueOnce(
      new ServiceUnavailableException('SMTP is not configured'),
    );

    await expect(service.resendVerificationEmail('user-1')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
