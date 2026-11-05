import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActionHistoryService } from '../action-history/action-history.service';
import { AuthIdentityCacheService } from '../auth/auth-identity-cache.service';
import { DEVICE_INACTIVITY_DAYS } from '../auth/user-device.service';
import { UserRole } from 'generated/enums';

@Injectable()
export class DeviceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actionHistoryService: ActionHistoryService,
    private readonly authIdentityCacheService: AuthIdentityCacheService,
  ) {}

  /** `studentId` là id hồ sơ `student_info` (UNIST-*), không phải `users.id`. */
  async getDevicesByStudentId(studentId: string) {
    // Trang này chỉ dành cho thiết bị học sinh — không lộ IP/thiết bị staff/admin.
    const student = await this.prisma.studentInfo.findUnique({
      where: { id: studentId },
      select: { userId: true, user: { select: { roleType: true } } },
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }
    if (!student.userId || student.user?.roleType !== UserRole.student) {
      throw new NotFoundException('Học sinh chưa có tài khoản đăng nhập');
    }
    const userId = student.userId;

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
      // Cùng định nghĩa với `UserDeviceService.isLive`: idle 60 ngày hoặc
      // refresh token đã hết hạn đều là thiết bị không còn đăng nhập.
      const refreshExpired =
        device.refreshExpiresAt !== null && device.refreshExpiresAt <= now;
      const isExpired =
        daysSinceActive >= DEVICE_INACTIVITY_DAYS || refreshExpired;
      const isActive = !isExpired;

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

    if (!device || device.user.roleType !== UserRole.student) {
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
        OR: [
          { lastActiveAt: { lt: cutoffDate } },
          { refreshExpiresAt: { lte: new Date() } },
        ],
      },
    });

    return { deletedCount: result.count };
  }
}
