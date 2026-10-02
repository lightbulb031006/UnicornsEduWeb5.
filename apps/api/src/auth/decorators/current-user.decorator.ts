import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { UserRole } from 'generated/enums';

export interface JwtPayload {
  id: string;
  email: string;
  emailVerified?: boolean;
  accountHandle: string;
  roleType: UserRole;
  deviceId?: string;
}

export interface JwtRefreshPayload {
  user: JwtPayload;
  rememberMe: boolean;
  refreshTokenExpiresAt: Date;
  deviceId: string;
}

export const CurrentUser = createParamDecorator(
  (
    data: keyof JwtPayload | keyof JwtRefreshPayload | undefined,
    ctx: ExecutionContext,
  ): JwtPayload | JwtRefreshPayload | unknown => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as JwtPayload | JwtRefreshPayload;
    return data ? user?.[data] : user;
  },
);
