jest.mock('./auth.service', () => ({
  AuthService: class AuthServiceMock {},
}));

import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../generated/enums';
import { AuthController } from './auth.controller';
import {
  IS_PUBLIC_KEY,
  PUBLIC_REGISTRATION_DISABLED_MESSAGE,
} from './constants';

describe('AuthController', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const authService = {
    login: jest.fn(),
    getSessionProfile: jest.fn(),
    resendVerificationEmail: jest.fn(),
    acceptDataConsent: jest.fn(),
    revokeRefreshTokenBySession: jest.fn(),
    accessTokenExpiresIn: 900,
    refreshTokenDefaultExpiresIn: 604_800,
    refreshTokenRememberExpiresIn: 2_592_000,
  };
  const configService = {
    getOrThrow: jest.fn(),
  };
  const jwtService = {
    verify: jest.fn(),
  };

  let controller: AuthController;
  let response: {
    cookie: jest.Mock;
    clearCookie: jest.Mock;
  };

  function getControllerHandler(name: keyof AuthController): object {
    const descriptor = Object.getOwnPropertyDescriptor(
      AuthController.prototype,
      name,
    );

    return descriptor?.value as object;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'test';
    controller = new AuthController(
      authService as never,
      configService as never,
      jwtService as never,
    );
    response = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    };
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('sets strict secure auth cookies in production', async () => {
    process.env.NODE_ENV = 'production';
    authService.login.mockResolvedValue({
      id: 'user-1',
      accountHandle: 'tester',
      roleType: UserRole.admin,
      tokenPair: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    });

    await controller.login(
      {
        accountHandle: 'tester',
        password: 'secret',
        rememberMe: false,
      },
      response as never,
    );

    expect(response.cookie).toHaveBeenNthCalledWith(
      1,
      'access_token',
      'access-token',
      {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: authService.accessTokenExpiresIn * 1000,
      },
    );
    expect(response.cookie).toHaveBeenNthCalledWith(
      2,
      'refresh_token',
      'refresh-token',
      {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: authService.refreshTokenDefaultExpiresIn * 1000,
      },
    );
  });

  it('sets lax non-secure auth cookies in test mode', async () => {
    authService.login.mockResolvedValue({
      id: 'user-1',
      accountHandle: 'tester',
      roleType: UserRole.staff,
      tokenPair: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    });

    await controller.login(
      {
        accountHandle: 'tester',
        password: 'secret',
        rememberMe: true,
      },
      response as never,
    );

    expect(response.cookie).toHaveBeenNthCalledWith(
      1,
      'access_token',
      'access-token',
      {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: authService.accessTokenExpiresIn * 1000,
      },
    );
    expect(response.cookie).toHaveBeenNthCalledWith(
      2,
      'refresh_token',
      'refresh-token',
      {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: authService.refreshTokenRememberExpiresIn * 1000,
      },
    );
  });

  it.each([
    ['production', true, 'strict'],
    ['test', false, 'lax'],
  ] as const)(
    'clears auth cookies with %s cookie options',
    async (nodeEnv, expectedSecure, expectedSameSite) => {
      process.env.NODE_ENV = nodeEnv;
      const request = {
        cookies: {
          access_token: 'access-token',
          refresh_token: 'refresh-token',
        },
      };

      await controller.logout(request as never, response as never);

      expect(authService.revokeRefreshTokenBySession).toHaveBeenCalledWith({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });

      expect(response.clearCookie).toHaveBeenNthCalledWith(1, 'access_token', {
        httpOnly: true,
        secure: expectedSecure,
        sameSite: expectedSameSite,
      });
      expect(response.clearCookie).toHaveBeenNthCalledWith(2, 'refresh_token', {
        httpOnly: true,
        secure: expectedSecure,
        sameSite: expectedSameSite,
      });
    },
  );

  it('resends verification email using refresh session when access token is absent', async () => {
    authService.getSessionProfile.mockResolvedValue({
      id: 'user-1',
      email: 'pending@example.com',
    });
    authService.resendVerificationEmail.mockResolvedValue({
      message: 'Verification email sent successfully.',
      email: 'pending@example.com',
    });

    await expect(
      controller.resendVerification(
        {
          cookies: {
            refresh_token: 'refresh-token',
          },
        } as never,
        {},
      ),
    ).resolves.toEqual({
      message: 'Verification email sent successfully.',
      email: 'pending@example.com',
    });

    expect(authService.getSessionProfile).toHaveBeenCalledWith(
      'refresh-token',
      expect.objectContaining({
        cookies: {
          refresh_token: 'refresh-token',
        },
      }),
    );
    expect(authService.resendVerificationEmail).toHaveBeenCalledWith(
      'user-1',
      undefined,
    );
  });

  it('accepts data consent using refresh session when access token is absent', async () => {
    authService.getSessionProfile.mockResolvedValue({
      id: 'user-1',
      email: 'staff@example.com',
    });
    authService.acceptDataConsent.mockResolvedValue({
      message: 'Đã ghi nhận đồng ý điều khoản xử lý dữ liệu cá nhân.',
      dataConsentAcceptedAt: new Date('2026-05-19T00:00:00.000Z'),
      dataConsentVersion: '2026-05-19',
    });

    await expect(
      controller.acceptDataConsent({
        cookies: {
          refresh_token: 'refresh-token',
        },
      } as never),
    ).resolves.toEqual(
      expect.objectContaining({
        message: 'Đã ghi nhận đồng ý điều khoản xử lý dữ liệu cá nhân.',
        dataConsentVersion: '2026-05-19',
      }),
    );

    expect(authService.getSessionProfile).toHaveBeenCalledWith(
      'refresh-token',
      expect.objectContaining({
        cookies: {
          refresh_token: 'refresh-token',
        },
      }),
    );
    expect(authService.acceptDataConsent).toHaveBeenCalledWith('user-1');
  });

  it('allows resend verification to reach controller without the global JWT guard', () => {
    expect(
      Reflect.getMetadata(
        IS_PUBLIC_KEY,
        getControllerHandler('resendVerification'),
      ),
    ).toBe(true);
  });

  it('allows data consent acceptance to reach controller without the global JWT guard', () => {
    expect(
      Reflect.getMetadata(
        IS_PUBLIC_KEY,
        getControllerHandler('acceptDataConsent'),
      ),
    ).toBe(true);
  });

  it('rejects public registration with ForbiddenException', async () => {
    await expect(
      controller.register({
        email: 'new-user@example.com',
        phone: '0123456789',
        password: 'secret123',
        first_name: 'New',
        last_name: 'User',
        accountHandle: 'new-user',
      }),
    ).rejects.toThrow(
      new ForbiddenException(PUBLIC_REGISTRATION_DISABLED_MESSAGE),
    );
  });
});
