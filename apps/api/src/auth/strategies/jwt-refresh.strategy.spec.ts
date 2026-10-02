import { UnauthorizedException } from '@nestjs/common';
import { UserRole } from 'generated/enums';
import { JwtRefreshStrategy } from './jwt-refresh.strategy';

describe('JwtRefreshStrategy', () => {
  const configService = {
    getOrThrow: jest.fn((key: string) => `${key}-value`),
  };
  const userDeviceService = {
    assertLiveRefreshDevice: jest.fn(),
  };

  let strategy: JwtRefreshStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new JwtRefreshStrategy(
      configService as never,
      userDeviceService as never,
    );
  });

  const payload = {
    id: 'user-1',
    accountHandle: 'staff-1',
    roleType: UserRole.staff,
    rememberMe: true,
    deviceId: 'device-1',
    exp: 1_800_000_000,
    iat: 1_700_000_000,
  };

  it('rejects a refresh cookie that no longer matches a live device', async () => {
    userDeviceService.assertLiveRefreshDevice.mockResolvedValue(null);

    await expect(
      strategy.validate(
        { cookies: { refresh_token: 'old-refresh' } } as never,
        payload,
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('accepts a refresh cookie that still matches the stored device hash', async () => {
    userDeviceService.assertLiveRefreshDevice.mockResolvedValue({
      id: 'device-1',
      userId: 'user-1',
    });

    await expect(
      strategy.validate(
        { cookies: { refresh_token: 'live-refresh' } } as never,
        payload,
      ),
    ).resolves.toEqual({
      user: {
        id: 'user-1',
        accountHandle: 'staff-1',
        roleType: UserRole.staff,
      },
      rememberMe: true,
      refreshTokenExpiresAt: new Date(1_800_000_000 * 1000),
      deviceId: 'device-1',
    });

    expect(userDeviceService.assertLiveRefreshDevice).toHaveBeenCalledWith({
      refreshToken: 'live-refresh',
      userId: 'user-1',
      deviceId: 'device-1',
      roleType: UserRole.staff,
    });
  });
});
