import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActionHistoryService } from '../action-history/action-history.service';
import { AuthIdentityCacheService } from '../auth/auth-identity-cache.service';
import { DEVICE_INACTIVITY_DAYS } from '../auth/user-device.service';

@Injectable()
export class DeviceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actionHistoryService: ActionHistoryService,
    private readonly authIdentityCacheService: AuthIdentityCacheService,
  ) {}

  async getDevicesByUserId(userId: string) {
    const devices = await this.prisma.userDevice.findMany({
      where: { userId },
      orderBy: { lastActiveAt: 'desc' },
    });

    const now = new Date();
    return devices.map((device) => {
      const lastActive = new Date(device.lastActiveAt);
      const daysSinceActive = Math.floor(
        (now.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24),
      );
      const isActive = daysSinceActive < DEVICE_INACTIVITY_DAYS;
      const isExpired = daysSinceActive >= DEVICE_INACTIVITY_DAYS;

      return {
        ...device,
        isActive,
        isExpired,
        daysSinceActive,
      };
    });
  }

  async getDeviceById(deviceId: string) {
    const device = await this.prisma.userDevice.findUnique({
      where: { id: deviceId },
      include: { user: true },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    return device;
  }

  async forceLogoutDevice(
    deviceId: string,
    actor: {
      userId: string;
      userEmail: string;
      roleType: string;
    },
    description?: string,
  ) {
    const device = await this.getDeviceById(deviceId);

    await this.prisma.$transaction(async (tx) => {
      const deviceSnapshot = {
        id: device.id,
        userId: device.userId,
        deviceInfo: device.deviceInfo,
        ipAddress: device.ipAddress,
        lastActiveAt: device.lastActiveAt,
        createdAt: device.createdAt,
      };

      await tx.userDevice.delete({
        where: { id: deviceId },
      });

      await this.actionHistoryService.recordUpdate(tx, {
        actor,
        entityType: 'user_device',
        entityId: deviceId,
        description: description ?? 'Buộc đăng xuất thiết bị',
        beforeValue: deviceSnapshot,
        afterValue: null,
      });
    });

    this.authIdentityCacheService.invalidateHasActiveDevice(device.userId);
    this.authIdentityCacheService.invalidateUser(device.userId);

    return { message: 'Đã buộc đăng xuất thiết bị' };
  }

  async cleanupExpiredDevices() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - DEVICE_INACTIVITY_DAYS);

    const result = await this.prisma.userDevice.deleteMany({
      where: {
        lastActiveAt: {
          lt: cutoffDate,
        },
      },
    });

    return { deletedCount: result.count };
  }
}
