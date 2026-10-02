jest.mock('src/prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));

import { StaffRole, UserRole } from 'generated/enums';
import { AuthIdentityCacheService } from './auth-identity-cache.service';

describe('AuthIdentityCacheService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
    staffInfo: {
      findUnique: jest.fn(),
    },
  };
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'AUTH_IDENTITY_CACHE_TTL_MS') {
        return '5000';
      }

      if (key === 'AUTH_IDENTITY_CACHE_MAX_ENTRIES') {
        return '2000';
      }

      return undefined;
    }),
  };

  let service: AuthIdentityCacheService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-04T00:00:00.000Z'));
    jest.clearAllMocks();
    service = new AuthIdentityCacheService(
      prisma as never,
      configService as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reuses cached auth identity within TTL', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      accountHandle: 'user-1',
      roleType: UserRole.staff,
      status: 'active',
      passwordHash: 'hashed-password',
    });

    await expect(service.getAuthIdentity('user-1')).resolves.toEqual({
      id: 'user-1',
      email: 'user@example.com',
      accountHandle: 'user-1',
      roleType: UserRole.staff,
      status: 'active',
      requiresPasswordSetup: false,
    });
    await expect(service.getAuthIdentity('user-1')).resolves.toEqual({
      id: 'user-1',
      email: 'user@example.com',
      accountHandle: 'user-1',
      roleType: UserRole.staff,
      status: 'active',
      requiresPasswordSetup: false,
    });

    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
  });

  it('expires cached auth identity after TTL', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'user@example.com',
        accountHandle: 'user-1',
        roleType: UserRole.guest,
        status: 'active',
        passwordHash: null,
      })
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'user@example.com',
        accountHandle: 'user-1',
        roleType: UserRole.guest,
        status: 'active',
        passwordHash: 'hashed-password',
      });

    await service.getAuthIdentity('user-1');
    jest.advanceTimersByTime(5_001);
    await expect(service.getAuthIdentity('user-1')).resolves.toEqual({
      id: 'user-1',
      email: 'user@example.com',
      accountHandle: 'user-1',
      roleType: UserRole.guest,
      status: 'active',
      requiresPasswordSetup: false,
    });

    expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
  });

  it('invalidates both auth identity and staff role caches for a user', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      accountHandle: 'user-1',
      roleType: UserRole.staff,
      status: 'active',
      passwordHash: 'hashed-password',
    });
    prisma.staffInfo.findUnique.mockResolvedValue({
      roles: [StaffRole.assistant],
    });

    await service.getAuthIdentity('user-1');
    await service.getStaffRoles('user-1');
    service.invalidateUser('user-1');
    await service.getAuthIdentity('user-1');
    await service.getStaffRoles('user-1');

    expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
    expect(prisma.staffInfo.findUnique).toHaveBeenCalledTimes(2);
  });

  describe('getHasActiveDevice', () => {
    it('caches result and only calls hasActiveFn once on repeated calls', async () => {
      const hasActiveFn = jest.fn().mockResolvedValue(true);

      const result1 = await service.getHasActiveDevice('user-1', hasActiveFn);
      const result2 = await service.getHasActiveDevice('user-1', hasActiveFn);

      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(hasActiveFn).toHaveBeenCalledTimes(1);
    });

    it('returns false and caches it', async () => {
      const hasActiveFn = jest.fn().mockResolvedValue(false);

      const result = await service.getHasActiveDevice('user-1', hasActiveFn);

      expect(result).toBe(false);
      expect(hasActiveFn).toHaveBeenCalledTimes(1);

      // Cached — second call does not re-invoke
      const result2 = await service.getHasActiveDevice('user-1', hasActiveFn);
      expect(result2).toBe(false);
      expect(hasActiveFn).toHaveBeenCalledTimes(1);
    });

    it('re-fetches after invalidateHasActiveDevice', async () => {
      const hasActiveFn = jest.fn().mockResolvedValue(true);

      await service.getHasActiveDevice('user-1', hasActiveFn);
      expect(hasActiveFn).toHaveBeenCalledTimes(1);

      service.invalidateHasActiveDevice('user-1');
      await service.getHasActiveDevice('user-1', hasActiveFn);
      expect(hasActiveFn).toHaveBeenCalledTimes(2);
    });

    it('expires after TTL', async () => {
      const hasActiveFn = jest.fn().mockResolvedValue(true);

      await service.getHasActiveDevice('user-1', hasActiveFn);
      jest.advanceTimersByTime(5_001);
      await service.getHasActiveDevice('user-1', hasActiveFn);

      expect(hasActiveFn).toHaveBeenCalledTimes(2);
    });
  });
});
