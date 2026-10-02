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

  let service: UserDeviceService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UserDeviceService(prisma as never);
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
        roleType: 'staff',
      }),
    ).resolves.toBeNull();
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
        roleType: 'staff',
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
    const lastActiveAt = new Date(Date.now() - LAST_ACTIVE_TOUCH_INTERVAL_MS - 1);

    await expect(
      service.touchDeviceIfStale({
        id: 'device-1',
        lastActiveAt,
      }),
    ).resolves.toEqual({ count: 1 });

    expect(prisma.userDevice.updateMany).toHaveBeenCalledWith({
      where: { id: 'device-1' },
      data: { lastActiveAt: expect.any(Date) },
    });
  });
});
