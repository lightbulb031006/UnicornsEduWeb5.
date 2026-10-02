jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));
jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));
jest.mock('./user-device.service', () => ({
  UserDeviceService: class UserDeviceServiceMock {},
}));

import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
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
      findFirst: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    loginRequest: {
      findUnique: jest.fn(),
      delete: jest.fn().mockResolvedValue({}),
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
    invalidateHasActiveDevice: jest.fn(),
  };
  const authAccessService = {
    resolveForIdentity: jest.fn(),
  };
  const userDeviceService = {
    hashToken: jest.fn(),
    generateDeviceToken: jest.fn(),
    generateActivateSecret: jest.fn(),
    createDevice: jest.fn().mockResolvedValue({ id: 'device-1' }),
    removeAllDevicesForUser: jest.fn().mockResolvedValue({ count: 1 }),
    removeDeviceById: jest.fn().mockResolvedValue({ count: 1 }),
    hasActiveDevice: jest.fn(),
    touchActiveDeviceForUser: jest.fn(),
    bindRefreshToken: jest.fn().mockResolvedValue({}),
    findDeviceByRefreshToken: jest.fn(),
    findLiveDeviceById: jest.fn(),
    assertLiveRefreshDevice: jest.fn(),
    cleanupExpiredLoginRequests: jest.fn(),
    cleanupInactiveDevices: jest.fn(),
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
          canAccess:
            (overrides.hasStaffProfile ?? false) || adminTier === 'full',
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
      userDeviceService as never,
    );
  });

  it('signs forgot-password tokens against the current password version', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      email: 'user@example.com',
      emailVerified: true,
      passwordHash: 'old-password-hash',
    });

    await expect(service.forgotPassword('user@example.com')).resolves.toEqual({
      message:
        'If the account exists and is verified, a password reset email will be sent.',
    });

    const [tokenPayload, tokenOptions] = jwtService.signAsync.mock
      .calls[0] as unknown as [
      {
        email: string;
        purpose: string;
        passwordResetVersion?: unknown;
      },
      { secret?: string },
    ];
    expect(tokenPayload).toMatchObject({
      email: 'user@example.com',
      purpose: 'forgot-password',
    });
    expect(typeof tokenPayload.passwordResetVersion).toBe('string');
    expect(tokenOptions).toEqual(
      expect.objectContaining({
        secret: 'JWT_FORGOT_PASSWORD_SECRET-value',
      }),
    );
    expect(mailService.sendForgotPasswordEmail).toHaveBeenCalledWith(
      'user@example.com',
      'token',
      undefined,
    );
  });

  it('rejects reset-password tokens issued before the current password hash', async () => {
    jwtService.verifyAsync.mockResolvedValueOnce({
      email: 'user@example.com',
      purpose: 'forgot-password',
      passwordResetVersion: 'stale-version',
    });
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      passwordHash: 'current-password-hash',
    });

    await expect(
      service.resetPassword('reset-token', 'new-secret-123'),
    ).rejects.toThrow('Invalid or expired reset password token');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
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
      undefined,
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
        availableWorkspaces: ['admin', 'staff'],
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
      undefined,
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

  describe('activateStudentDevice', () => {
    const baseRequest = {
      id: 'req-1',
      userId: 'student-1',
      verified: true,
      expiresAt: new Date(Date.now() + 60_000),
      activateSecretHash: null as string | null,
      deviceInfo: { userAgent: 'test' },
      ipAddress: '127.0.0.1',
    };

    const studentUser = {
      id: 'student-1',
      accountHandle: 'hocsinh1',
      roleType: UserRole.student,
    };

    beforeEach(() => {
      userDeviceService.hashToken = jest.fn().mockReturnValue('hashed-secret');
      userDeviceService.generateDeviceToken = jest
        .fn()
        .mockReturnValue('device-token');
      userDeviceService.createDevice = jest
        .fn()
        .mockResolvedValue({ id: 'device-1' });
      userDeviceService.removeAllDevicesForUser = jest
        .fn()
        .mockResolvedValue({});
      authIdentityCacheService.invalidateHasActiveDevice = jest.fn();
      jwtService.signAsync = jest.fn().mockResolvedValue('jwt-token');
    });

    it('rejects when activateSecret hash does not match', async () => {
      mockPrisma.loginRequest.findUnique.mockResolvedValueOnce({
        ...baseRequest,
        activateSecretHash: 'expected-hash',
      });

      await expect(
        service.activateStudentDevice('req-1', 'wrong-secret'),
      ).rejects.toThrow('Invalid activation secret');
    });

    it('issues tokens when activateSecret matches', async () => {
      mockPrisma.loginRequest.findUnique.mockResolvedValueOnce({
        ...baseRequest,
        activateSecretHash: 'hashed-secret',
      });
      mockPrisma.user.findUnique.mockResolvedValueOnce(studentUser);

      await expect(
        service.activateStudentDevice('req-1', 'correct-secret'),
      ).resolves.toMatchObject({
        accessToken: 'jwt-token',
        refreshToken: 'jwt-token',
      });

      expect(userDeviceService.createDevice).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'student-1' }),
      );
      expect(
        authIdentityCacheService.invalidateHasActiveDevice,
      ).toHaveBeenCalledWith('student-1');
    });

    it('rejects when request is not verified', async () => {
      mockPrisma.loginRequest.findUnique.mockResolvedValueOnce({
        ...baseRequest,
        verified: false,
      });

      await expect(
        service.activateStudentDevice('req-1', 'any-secret'),
      ).rejects.toThrow('Login request not verified yet');
    });

    it('rejects when request is expired', async () => {
      mockPrisma.loginRequest.findUnique.mockResolvedValueOnce({
        ...baseRequest,
        expiresAt: new Date(Date.now() - 1_000),
      });

      await expect(
        service.activateStudentDevice('req-1', 'any-secret'),
      ).rejects.toThrow('Login request expired');
    });
  });

  describe('session revocation', () => {
    const userSnapshot = {
      id: 'user-1',
      email: 'user@example.com',
      phone: null,
      passwordHash: 'current-password-hash',
      refreshToken: 'old-refresh',
      first_name: 'A',
      last_name: 'B',
      roleType: UserRole.staff,
      province: null,
      accountHandle: 'staff-1',
      emailVerified: true,
      phoneVerified: false,
      linkId: null,
      status: 'active',
      createdAt: new Date('2026-03-20T10:00:00.000Z'),
      updatedAt: new Date('2026-03-20T10:00:00.000Z'),
      staffInfo: null,
      studentInfo: null,
    };

    it('deletes the matching UserDevice on logout', async () => {
      userDeviceService.findDeviceByRefreshToken.mockResolvedValueOnce({
        id: 'device-9',
        userId: 'user-1',
      });

      await service.revokeRefreshTokenBySession({
        refreshToken: 'refresh-cookie',
        accessToken: 'access-cookie',
      });

      expect(userDeviceService.removeDeviceById).toHaveBeenCalledWith(
        'device-9',
      );
      expect(
        authIdentityCacheService.invalidateHasActiveDevice,
      ).toHaveBeenCalledWith('user-1');
      expect(authIdentityCacheService.invalidateUser).toHaveBeenCalledWith(
        'user-1',
      );
    });

    it('ends every live device on changePassword', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({
          id: 'user-1',
          passwordHash: 'current-password-hash',
        })
        .mockResolvedValue(userSnapshot);
      mockPrisma.user.update.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        roleType: UserRole.staff,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);

      await expect(
        service.changePassword('user-1', 'old-secret', 'new-secret-123'),
      ).resolves.toEqual({ message: 'Đổi mật khẩu thành công' });

      expect(userDeviceService.removeAllDevicesForUser).toHaveBeenCalledWith(
        'user-1',
      );
    });

    it('ends every live device on resetPassword', async () => {
      const passwordResetVersion = createHash('sha256')
        .update('JWT_FORGOT_PASSWORD_SECRET-value')
        .update(':')
        .update('user@example.com')
        .update(':')
        .update('current-password-hash')
        .digest('hex');

      jwtService.verifyAsync.mockResolvedValueOnce({
        email: 'user@example.com',
        purpose: 'forgot-password',
        passwordResetVersion,
      });
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({
          id: 'user-1',
          passwordHash: 'current-password-hash',
        })
        .mockResolvedValue(userSnapshot);
      mockPrisma.user.update.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        roleType: UserRole.staff,
      });

      await expect(
        service.resetPassword('reset-token', 'new-secret-123'),
      ).resolves.toEqual({ message: 'Password reset successfully' });

      expect(userDeviceService.removeAllDevicesForUser).toHaveBeenCalledWith(
        'user-1',
      );
    });

    it('returns no session profile when the refresh cookie is revoked', async () => {
      jwtService.verifyAsync.mockResolvedValueOnce({
        id: 'user-1',
        accountHandle: 'staff-1',
        roleType: UserRole.staff,
        deviceId: 'device-9',
      });
      userDeviceService.assertLiveRefreshDevice.mockResolvedValueOnce(null);

      await expect(
        service.getSessionProfile('revoked-refresh'),
      ).resolves.toBeNull();
    });
  });
});
