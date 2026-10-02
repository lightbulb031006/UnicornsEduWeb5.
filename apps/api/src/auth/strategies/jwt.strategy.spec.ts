jest.mock('src/prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));
jest.mock('../user-device.service', () => ({
  UserDeviceService: class UserDeviceServiceMock {},
}));

import { UnauthorizedException } from '@nestjs/common';
import { UserRole } from 'generated/enums';
import type { RequestWithResolvedAuthContext } from '../auth-request-context';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const configService = {
    getOrThrow: jest.fn((key: string) => `${key}-value`),
  };
  const authIdentityCacheService = {
    getAuthIdentity: jest.fn(),
    getHasActiveDevice: jest.fn(),
  };
  const userDeviceService = {
    findLiveDeviceById: jest.fn(),
    touchDeviceIfStale: jest.fn(),
    hasActiveDevice: jest.fn(),
  };

  let strategy: JwtStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new JwtStrategy(
      configService as never,
      authIdentityCacheService as never,
      userDeviceService as never,
    );
  });

  it('reuses request-scoped auth identity when already available', async () => {
    const request = {
      resolvedAuthIdentity: {
        id: 'user-1',
        email: 'user@example.com',
        accountHandle: 'user-1',
        roleType: UserRole.admin,
        status: 'active',
        requiresPasswordSetup: false,
        avatarPath: null,
      },
    } as RequestWithResolvedAuthContext;

    await expect(
      strategy.validate(request, {
        id: 'user-1',
        email: '',
        accountHandle: 'ignored',
        roleType: UserRole.admin,
      }),
    ).resolves.toEqual({
      id: 'user-1',
      email: 'user@example.com',
      accountHandle: 'user-1',
      roleType: UserRole.admin,
      deviceId: undefined,
    });

    expect(authIdentityCacheService.getAuthIdentity).not.toHaveBeenCalled();
  });

  it('loads auth identity through cache service and stores it on the request', async () => {
    const request = {} as RequestWithResolvedAuthContext;

    authIdentityCacheService.getAuthIdentity.mockImplementation(
      (_userId: string, currentRequest?: RequestWithResolvedAuthContext) => {
        const identity = {
          id: 'user-2',
          email: 'staff@example.com',
          accountHandle: 'staff-user',
          roleType: UserRole.staff,
          status: 'active',
          requiresPasswordSetup: false,
          avatarPath: null,
        };

        if (currentRequest) {
          currentRequest.resolvedAuthIdentity = identity;
        }

        return Promise.resolve(identity);
      },
    );

    await expect(
      strategy.validate(request, {
        id: 'user-2',
        email: '',
        accountHandle: 'ignored',
        roleType: UserRole.staff,
      }),
    ).resolves.toEqual({
      id: 'user-2',
      email: 'staff@example.com',
      accountHandle: 'staff-user',
      roleType: UserRole.staff,
      deviceId: undefined,
    });

    expect(authIdentityCacheService.getAuthIdentity).toHaveBeenCalledWith(
      'user-2',
      request,
    );
    expect(request.resolvedAuthIdentity).toEqual(
      expect.objectContaining({
        id: 'user-2',
        email: 'staff@example.com',
      }),
    );
  });

  it('rejects inactive users', async () => {
    authIdentityCacheService.getAuthIdentity.mockResolvedValue({
      id: 'user-3',
      email: 'inactive@example.com',
      accountHandle: 'inactive-user',
      roleType: UserRole.staff,
      status: 'inactive',
      requiresPasswordSetup: false,
      avatarPath: null,
    });

    await expect(
      strategy.validate({} as RequestWithResolvedAuthContext, {
        id: 'user-3',
        email: '',
        accountHandle: 'ignored',
        roleType: UserRole.staff,
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  describe('student device check', () => {
    const studentIdentity = {
      id: 'student-1',
      email: 'student@example.com',
      accountHandle: 'student-1',
      roleType: UserRole.student,
      status: 'active',
      requiresPasswordSetup: false,
      avatarPath: null,
    };

    it('rejects student with no active device', async () => {
      authIdentityCacheService.getAuthIdentity.mockResolvedValue(
        studentIdentity,
      );
      authIdentityCacheService.getHasActiveDevice.mockResolvedValue(false);

      await expect(
        strategy.validate({} as RequestWithResolvedAuthContext, {
          id: 'student-1',
          email: '',
          accountHandle: 'ignored',
          roleType: UserRole.student,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('passes student with active device', async () => {
      authIdentityCacheService.getAuthIdentity.mockResolvedValue(
        studentIdentity,
      );
      authIdentityCacheService.getHasActiveDevice.mockResolvedValue(true);

      await expect(
        strategy.validate({} as RequestWithResolvedAuthContext, {
          id: 'student-1',
          email: '',
          accountHandle: 'ignored',
          roleType: UserRole.student,
        }),
      ).resolves.toEqual({
        id: 'student-1',
        email: 'student@example.com',
        accountHandle: 'student-1',
        roleType: UserRole.student,
        deviceId: undefined,
      });
    });

    it('skips device check for staff', async () => {
      const staffIdentity = { ...studentIdentity, roleType: UserRole.staff };
      authIdentityCacheService.getAuthIdentity.mockResolvedValue(staffIdentity);

      await expect(
        strategy.validate({} as RequestWithResolvedAuthContext, {
          id: 'staff-1',
          email: '',
          accountHandle: 'ignored',
          roleType: UserRole.staff,
        }),
      ).resolves.toEqual({
        id: 'student-1',
        email: 'student@example.com',
        accountHandle: 'student-1',
        roleType: UserRole.staff,
        deviceId: undefined,
      });

      expect(
        authIdentityCacheService.getHasActiveDevice,
      ).not.toHaveBeenCalled();
    });

    it('rejects a specific deviceId that was revoked', async () => {
      authIdentityCacheService.getAuthIdentity.mockResolvedValue(
        studentIdentity,
      );
      userDeviceService.findLiveDeviceById.mockResolvedValue(null);

      await expect(
        strategy.validate({} as RequestWithResolvedAuthContext, {
          id: 'student-1',
          email: '',
          accountHandle: 'ignored',
          roleType: UserRole.student,
          deviceId: 'device-dead',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(
        authIdentityCacheService.getHasActiveDevice,
      ).not.toHaveBeenCalled();
    });

    it('accepts a live deviceId for staff and touches lastActiveAt', async () => {
      const staffIdentity = {
        ...studentIdentity,
        id: 'staff-1',
        roleType: UserRole.staff,
      };
      authIdentityCacheService.getAuthIdentity.mockResolvedValue(staffIdentity);
      userDeviceService.findLiveDeviceById.mockResolvedValue({
        id: 'device-live',
        userId: 'staff-1',
        lastActiveAt: new Date('2026-09-01T00:00:00.000Z'),
      });
      userDeviceService.touchDeviceIfStale.mockResolvedValue({ count: 1 });

      await expect(
        strategy.validate({} as RequestWithResolvedAuthContext, {
          id: 'staff-1',
          email: '',
          accountHandle: 'ignored',
          roleType: UserRole.staff,
          deviceId: 'device-live',
        }),
      ).resolves.toEqual({
        id: 'staff-1',
        email: 'student@example.com',
        accountHandle: 'student-1',
        roleType: UserRole.staff,
        deviceId: 'device-live',
      });

      expect(userDeviceService.touchDeviceIfStale).toHaveBeenCalled();
    });
  });
});
