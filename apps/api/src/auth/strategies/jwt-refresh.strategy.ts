import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { UserRole } from 'generated/enums';
import {
  NO_ACTIVE_DEVICE_ERROR,
  UserDeviceService,
} from '../user-device.service';

const REFRESH_TOKEN_COOKIE = 'refresh_token';

export interface JwtRefreshPayload {
  id: string;
  accountHandle: string;
  roleType: UserRole;
  rememberMe?: boolean;
  deviceId?: string;
  exp: number;
  iat: number;
}

export interface RefreshValidateResult {
  user: { id: string; accountHandle: string; roleType: UserRole };
  rememberMe: boolean;
  refreshTokenExpiresAt: Date;
  deviceId: string;
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(
    private readonly configService: ConfigService,
    private readonly userDeviceService: UserDeviceService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req?.cookies?.[REFRESH_TOKEN_COOKIE] ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(
    req: Request,
    payload: JwtRefreshPayload,
  ): Promise<RefreshValidateResult> {
    const refreshToken = req?.cookies?.[REFRESH_TOKEN_COOKIE];
    if (typeof refreshToken !== 'string' || !refreshToken) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const device = await this.userDeviceService.assertLiveRefreshDevice({
      refreshToken,
      userId: payload.id,
      deviceId: payload.deviceId,
      roleType: payload.roleType,
    });

    if (!device) {
      throw new UnauthorizedException(NO_ACTIVE_DEVICE_ERROR);
    }

    return {
      user: {
        id: payload.id,
        accountHandle: payload.accountHandle,
        roleType: payload.roleType,
      },
      rememberMe: payload.rememberMe ?? false,
      refreshTokenExpiresAt: new Date(payload.exp * 1000),
      deviceId: device.id,
    };
  }
}
