import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import type { Prisma } from '../../generated/client';
import { PrismaService } from '../prisma/prisma.service';

const DEVICE_TOKEN_BYTES = 32;
const LOGIN_REQUEST_TOKEN_BYTES = 32;
const ACTIVATE_SECRET_BYTES = 32;
const LOGIN_REQUEST_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
export const DEVICE_INACTIVITY_DAYS = 60;
export const LAST_ACTIVE_TOUCH_INTERVAL_MS = 60_000;

export const NO_ACTIVE_DEVICE_ERROR = {
  statusCode: 401,
  error: 'NO_ACTIVE_DEVICE',
  message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
} as const;

export interface DeviceInfo {
  userAgent?: string;
  acceptLanguage?: string;
}

@Injectable()
export class UserDeviceService {
  private readonly logger = new Logger(UserDeviceService.name);

  constructor(private readonly prisma: PrismaService) {}

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  generateDeviceToken(): string {
    return randomBytes(DEVICE_TOKEN_BYTES).toString('hex');
  }

  generateLoginRequestToken(): string {
    return randomBytes(LOGIN_REQUEST_TOKEN_BYTES).toString('hex');
  }

  generateActivateSecret(): string {
    return randomBytes(ACTIVATE_SECRET_BYTES).toString('hex');
  }

  async createDevice(params: {
    userId: string;
    token: string;
    deviceInfo?: DeviceInfo;
    ipAddress?: string;
  }) {
    const tokenHash = this.hashToken(params.token);
    return this.prisma.userDevice.create({
      data: {
        userId: params.userId,
        tokenHash,
        deviceInfo: (params.deviceInfo as Prisma.InputJsonValue) ?? undefined,
        ipAddress: params.ipAddress ?? undefined,
        lastActiveAt: new Date(),
      },
    });
  }

  async findActiveDeviceByTokenHash(tokenHash: string) {
    return this.prisma.userDevice.findUnique({
      where: { tokenHash },
    });
  }

  idleCutoff(now = new Date()): Date {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - DEVICE_INACTIVITY_DAYS);
    return cutoff;
  }

  isIdle(lastActiveAt: Date, now = new Date()): boolean {
    return lastActiveAt < this.idleCutoff(now);
  }

  async hasActiveDevice(userId: string): Promise<boolean> {
    const count = await this.prisma.userDevice.count({
      where: {
        userId,
        lastActiveAt: { gte: this.idleCutoff() },
      },
    });
    return count > 0;
  }

  async findLiveDeviceById(deviceId: string) {
    const device = await this.prisma.userDevice.findUnique({
      where: { id: deviceId },
    });
    if (!device || this.isIdle(device.lastActiveAt)) {
      return null;
    }
    return device;
  }

  async findDeviceByRefreshToken(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    return this.prisma.userDevice.findUnique({
      where: { tokenHash },
    });
  }

  async findLatestLiveDeviceForUser(userId: string) {
    return this.prisma.userDevice.findFirst({
      where: {
        userId,
        lastActiveAt: { gte: this.idleCutoff() },
      },
      orderBy: { lastActiveAt: 'desc' },
    });
  }

  /**
   * Refresh cookie must match a live UserDevice row (hash + optional deviceId).
   * Student tokens issued before refresh-hash binding may still have a live
   * device with a random token_hash — allow that once so /refresh can rebind.
   */
  async assertLiveRefreshDevice(params: {
    refreshToken: string;
    userId: string;
    deviceId?: string;
    roleType?: string;
  }) {
    const tokenHash = this.hashToken(params.refreshToken);

    if (params.deviceId) {
      const device = await this.prisma.userDevice.findUnique({
        where: { id: params.deviceId },
      });
      if (
        device &&
        device.userId === params.userId &&
        device.tokenHash === tokenHash &&
        !this.isIdle(device.lastActiveAt)
      ) {
        return device;
      }
    } else {
      const byHash = await this.prisma.userDevice.findUnique({
        where: { tokenHash },
      });
      if (
        byHash &&
        byHash.userId === params.userId &&
        !this.isIdle(byHash.lastActiveAt)
      ) {
        return byHash;
      }
    }

    if (params.roleType === 'student') {
      const legacyDevice = await this.findLatestLiveDeviceForUser(params.userId);
      if (legacyDevice) {
        return legacyDevice;
      }
    }

    return null;
  }

  async bindRefreshToken(deviceId: string, refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    return this.prisma.userDevice.update({
      where: { id: deviceId },
      data: {
        tokenHash,
        lastActiveAt: new Date(),
      },
    });
  }

  async touchDevice(tokenHash: string) {
    return this.prisma.userDevice.updateMany({
      where: { tokenHash },
      data: { lastActiveAt: new Date() },
    });
  }

  async touchDeviceIfStale(device: { id: string; lastActiveAt: Date }) {
    const elapsed = Date.now() - device.lastActiveAt.getTime();
    if (elapsed < LAST_ACTIVE_TOUCH_INTERVAL_MS) {
      return { count: 0 };
    }

    return this.prisma.userDevice.updateMany({
      where: { id: device.id },
      data: { lastActiveAt: new Date() },
    });
  }

  async touchActiveDeviceForUser(userId: string) {
    return this.prisma.userDevice.updateMany({
      where: { userId, lastActiveAt: { gte: this.idleCutoff() } },
      data: { lastActiveAt: new Date() },
    });
  }

  async removeDeviceById(deviceId: string) {
    return this.prisma.userDevice.deleteMany({
      where: { id: deviceId },
    });
  }

  async removeAllDevicesForUser(userId: string) {
    return this.prisma.userDevice.deleteMany({
      where: { userId },
    });
  }

  async listDevices(userId: string) {
    return this.prisma.userDevice.findMany({
      where: { userId },
      orderBy: { lastActiveAt: 'desc' },
      select: {
        id: true,
        deviceInfo: true,
        ipAddress: true,
        lastActiveAt: true,
        createdAt: true,
      },
    });
  }

  // --- Login Requests ---

  async createLoginRequest(params: {
    userId: string;
    token: string;
    activateSecret: string;
    deviceInfo?: DeviceInfo;
    ipAddress?: string;
  }) {
    const tokenHash = this.hashToken(params.token);
    const activateSecretHash = this.hashToken(params.activateSecret);
    const expiresAt = new Date(Date.now() + LOGIN_REQUEST_EXPIRY_MS);
    return this.prisma.loginRequest.create({
      data: {
        userId: params.userId,
        tokenHash,
        activateSecretHash,
        deviceInfo: (params.deviceInfo as Prisma.InputJsonValue) ?? undefined,
        ipAddress: params.ipAddress ?? undefined,
        expiresAt,
      },
    });
  }

  async findLoginRequestByTokenHash(tokenHash: string) {
    return this.prisma.loginRequest.findUnique({
      where: { tokenHash },
    });
  }

  async findLoginRequestByActivateSecretHash(activateSecretHash: string) {
    return this.prisma.loginRequest.findUnique({
      where: { activateSecretHash },
    });
  }

  async verifyLoginRequest(tokenHash: string) {
    return this.prisma.loginRequest.updateMany({
      where: { tokenHash, verified: false },
      data: { verified: true },
    });
  }

  async cleanupExpiredLoginRequests() {
    const result = await this.prisma.loginRequest.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (result.count > 0) {
      this.logger.log(`Cleaned up ${result.count} expired login requests`);
    }
    return result;
  }

  async cleanupInactiveDevices() {
    const result = await this.prisma.userDevice.deleteMany({
      where: { lastActiveAt: { lt: this.idleCutoff() } },
    });
    if (result.count > 0) {
      this.logger.log(`Cleaned up ${result.count} inactive devices`);
    }
    return result;
  }
}
