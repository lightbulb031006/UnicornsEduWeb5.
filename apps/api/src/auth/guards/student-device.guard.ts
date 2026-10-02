import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { UserRole } from 'generated/enums';
import { PrismaService } from '../../prisma/prisma.service';
import {
  NO_ACTIVE_DEVICE_ERROR,
  UserDeviceService,
} from '../user-device.service';

@Injectable()
export class StudentDeviceGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly userDeviceService: UserDeviceService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const refreshToken = request.cookies?.refresh_token as string | undefined;

    if (!refreshToken) {
      return true; // No token — let the JWT guard handle unauthorized
    }

    let payload: { id: string; roleType: UserRole };
    try {
      payload = await this.jwtService.verifyAsync<{
        id: string;
        roleType: UserRole;
      }>(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      return true; // Invalid token — let the JWT guard handle it
    }

    // Only enforce device check for students
    if (payload.roleType !== UserRole.student) {
      return true;
    }

    // Check if student has at least one active device
    const hasActive = await this.userDeviceService.hasActiveDevice(payload.id);
    if (!hasActive) {
      throw new UnauthorizedException(NO_ACTIVE_DEVICE_ERROR);
    }

    return true;
  }
}
