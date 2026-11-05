import {
  LAST_ACTIVE_TOUCH_INTERVAL_MS,
  UserDeviceService,
} from './user-device.service';

describe('UserDeviceService', () => {
  const prisma = {
    userDevice: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
  };
  const tx = {
    $executeRaw: jest.fn(),
    userDevice: {
      count: jest.fn(),
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
  };
  const prismaWithTx = {
    ...prisma,
    $transaction: jest.fn((cb: (client: typeof tx) => unknown) => cb(tx)),
  };

  let service: UserDeviceService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UserDeviceService(prismaWithTx as never);
  });

  it('rejects a refresh token whose hash no longer matches the device', async () => {
    prisma.userDevice.findUnique.mockResolvedValue({
      id: 'device-1',
      userId: 'user-1',
      tokenHash: 'other-hash',
      lastActiveAt: new Date(),
    });

    await expect(
      service.assertLiveRefreshDevice({
        refreshToken: 'stale-refresh',
        userId: 'user-1',
        deviceId: 'device-1',
      }),
    ).resolves.toBeNull();
  });

  it('does not hand a revoked student device the session of another live device', async () => {
    // Thiết bị A đã bị force-logout (không còn row); học sinh đang đăng nhập máy B.
    prisma.userDevice.findUnique.mockResolvedValue(null);
    prisma.userDevice.findFirst.mockResolvedValue({
      id: 'device-b',
      userId: 'student-1',
      tokenHash: 'b-hash',
      lastActiveAt: new Date(),
    });

    await expect(
      service.assertLiveRefreshDevice({
        refreshToken: 'device-a-refresh',
        userId: 'student-1',
        deviceId: 'device-a',
      }),
    ).resolves.toBeNull();
    expect(prisma.userDevice.findFirst).not.toHaveBeenCalled();
  });

  it('accepts a refresh token that matches the live device hash', async () => {
    const refreshToken = 'live-refresh';
    const tokenHash = service.hashToken(refreshToken);
    const device = {
      id: 'device-1',
      userId: 'user-1',
      tokenHash,
      lastActiveAt: new Date(),
    };
    prisma.userDevice.findUnique.mockResolvedValue(device);

    await expect(
      service.assertLiveRefreshDevice({
        refreshToken,
        userId: 'user-1',
        deviceId: 'device-1',
      }),
    ).resolves.toEqual(device);
  });

  it('does not write lastActiveAt when touched within the throttle window', async () => {
    await expect(
      service.touchDeviceIfStale({
        id: 'device-1',
        lastActiveAt: new Date(),
      }),
    ).resolves.toEqual({ count: 0 });

    expect(prisma.userDevice.updateMany).not.toHaveBeenCalled();
  });

  it('writes lastActiveAt when the throttle window has elapsed', async () => {
    prisma.userDevice.updateMany.mockResolvedValue({ count: 1 });
    const lastActiveAt = new Date(
      Date.now() - LAST_ACTIVE_TOUCH_INTERVAL_MS - 1,
    );

    await expect(
      service.touchDeviceIfStale({
        id: 'device-1',
        lastActiveAt,
      }),
    ).resolves.toEqual({ count: 1 });

    expect(prisma.userDevice.updateMany).toHaveBeenCalledWith({
      where: { id: 'device-1' },
      data: { lastActiveAt: expect.any(Date) as Date },
    });
  });

  describe('refresh token expiry (luật một thiết bị)', () => {
    const now = new Date('2026-10-26T08:00:00.000Z');

    it('does not count a device whose refresh token has expired as live', () => {
      // Học sinh không tick «Ghi nhớ»: refresh sống 1 ngày, cookie đã chết
      // nhưng row vẫn chưa idle 60 ngày.
      expect(
        service.isLive(
          {
            lastActiveAt: new Date('2026-10-24T08:00:00.000Z'),
            refreshExpiresAt: new Date('2026-10-25T08:00:00.000Z'),
          },
          now,
        ),
      ).toBe(false);
    });

    it('counts a device with a valid refresh token as live', () => {
      expect(
        service.isLive(
          {
            lastActiveAt: new Date('2026-10-26T07:00:00.000Z'),
            refreshExpiresAt: new Date('2026-11-20T08:00:00.000Z'),
          },
          now,
        ),
      ).toBe(true);
    });

    it('falls back to the idle rule for legacy rows without refreshExpiresAt', () => {
      expect(
        service.isLive(
          { lastActiveAt: new Date('2026-10-01T08:00:00.000Z') },
          now,
        ),
      ).toBe(true);
      expect(
        service.isLive(
          {
            lastActiveAt: new Date('2026-08-01T08:00:00.000Z'),
            refreshExpiresAt: null,
          },
          now,
        ),
      ).toBe(false);
    });

    it('hasActiveDevice only counts devices with an unexpired refresh token', async () => {
      prisma.userDevice.count.mockResolvedValue(0);

      await expect(service.hasActiveDevice('student-1')).resolves.toBe(false);
      expect(prisma.userDevice.count).toHaveBeenCalledWith({
        where: {
          userId: 'student-1',
          lastActiveAt: { gte: expect.any(Date) as Date },
          OR: [
            { refreshExpiresAt: null },
            { refreshExpiresAt: { gt: expect.any(Date) as Date } },
          ],
        },
      });
    });

    it('rejects a deviceId whose refresh token has expired', async () => {
      prisma.userDevice.findUnique.mockResolvedValue({
        id: 'device-1',
        userId: 'student-1',
        tokenHash: 'hash',
        lastActiveAt: new Date(),
        refreshExpiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.findLiveDeviceById('device-1')).resolves.toBeNull();
    });

    it('stores the refresh expiry when binding a refresh token', async () => {
      const refreshExpiresAt = new Date('2026-10-27T08:00:00.000Z');
      await service.bindRefreshToken('device-1', 'refresh', refreshExpiresAt);

      expect(prisma.userDevice.update).toHaveBeenCalledWith({
        where: { id: 'device-1' },
        data: {
          tokenHash: service.hashToken('refresh'),
          refreshExpiresAt,
          lastActiveAt: expect.any(Date) as Date,
        },
      });
    });
  });

  describe('replaceDevicesForUser (chống race đăng nhập đồng thời)', () => {
    const refreshExpiresAt = new Date('2026-10-27T08:00:00.000Z');

    it('rejects inside the lock when the user still has a live device', async () => {
      tx.userDevice.count.mockResolvedValueOnce(1);

      await expect(
        service.replaceDevicesForUser({
          userId: 'student-1',
          token: 'device-token',
          refreshExpiresAt,
          rejectIfLive: true,
        }),
      ).resolves.toBeNull();

      expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
      expect(tx.userDevice.deleteMany).not.toHaveBeenCalled();
      expect(tx.userDevice.create).not.toHaveBeenCalled();
    });

    it('locks before checking, then replaces old devices with one new row', async () => {
      const order: string[] = [];
      tx.$executeRaw.mockImplementationOnce(() => {
        order.push('lock');
        return Promise.resolve(1);
      });
      tx.userDevice.count.mockImplementationOnce(() => {
        order.push('count');
        return Promise.resolve(0);
      });
      tx.userDevice.create.mockResolvedValueOnce({ id: 'device-new' });

      await expect(
        service.replaceDevicesForUser({
          userId: 'student-1',
          token: 'device-token',
          refreshExpiresAt,
          rejectIfLive: true,
        }),
      ).resolves.toEqual({ id: 'device-new' });

      expect(order).toEqual(['lock', 'count']);
      expect(tx.userDevice.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'student-1' },
      });
      expect(tx.userDevice.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'student-1',
          tokenHash: service.hashToken('device-token'),
          refreshExpiresAt,
        }) as Record<string, unknown>,
      });
    });

    it('skips the live check when replacing is forced (magic link)', async () => {
      tx.userDevice.create.mockResolvedValueOnce({ id: 'device-new' });

      await service.replaceDevicesForUser({
        userId: 'student-1',
        token: 'device-token',
        refreshExpiresAt,
        rejectIfLive: false,
      });

      expect(tx.userDevice.count).not.toHaveBeenCalled();
      expect(tx.userDevice.deleteMany).toHaveBeenCalled();
      expect(tx.userDevice.create).toHaveBeenCalled();
    });
  });
});
