import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { StaffRole, UserRole } from '../../generated/enums';
import { DeviceService } from './device.service';

describe('DeviceService', () => {
  const mockPrisma = {
    studentInfo: { findUnique: jest.fn() },
    userDevice: { findMany: jest.fn(), findUnique: jest.fn() },
    staffInfo: { findUnique: jest.fn() },
    customerCareService: { findUnique: jest.fn() },
  };
  const adminActor = { userId: 'admin-user', roleType: UserRole.admin };
  const staffActor = { userId: 'staff-user', roleType: UserRole.staff };
  let service: DeviceService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DeviceService(mockPrisma as never, {} as never, {} as never);
  });

  describe('getDevicesByStudentId', () => {
    it('resolves student_info id to the linked user before loading devices', async () => {
      mockPrisma.studentInfo.findUnique.mockResolvedValueOnce({
        userId: 'user-uuid-1',
        user: { roleType: UserRole.student },
      });
      mockPrisma.userDevice.findMany.mockResolvedValueOnce([
        { id: 'device-1', userId: 'user-uuid-1', lastActiveAt: new Date() },
      ]);

      const devices = await service.getDevicesByStudentId(
        'UNIST-82c128048f',
        adminActor,
      );

      expect(mockPrisma.studentInfo.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'UNIST-82c128048f' } }),
      );
      expect(mockPrisma.userDevice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-uuid-1' } }),
      );
      expect(devices).toHaveLength(1);
      expect(devices[0]).toMatchObject({ id: 'device-1', isExpired: false });
    });

    it('throws 404 when the student profile does not exist', async () => {
      mockPrisma.studentInfo.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.getDevicesByStudentId('UNIST-missing', adminActor),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockPrisma.userDevice.findMany).not.toHaveBeenCalled();
    });

    it('throws 404 when the student has no linked login account', async () => {
      mockPrisma.studentInfo.findUnique.mockResolvedValueOnce({
        userId: null,
        user: null,
      });

      await expect(
        service.getDevicesByStudentId('UNIST-nouser', adminActor),
      ).rejects.toThrow('Học sinh chưa có tài khoản đăng nhập');
    });

    it('hides devices when the linked user is not a student', async () => {
      mockPrisma.studentInfo.findUnique.mockResolvedValueOnce({
        userId: 'staff-uuid',
        user: { roleType: UserRole.staff },
      });

      await expect(
        service.getDevicesByStudentId('UNIST-staff', adminActor),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockPrisma.userDevice.findMany).not.toHaveBeenCalled();
    });
  });
  describe('student account scope', () => {
    it('lets customer care read devices of a student they care for', async () => {
      mockPrisma.staffInfo.findUnique.mockResolvedValueOnce({
        id: 'cskh-1',
        roles: [StaffRole.customer_care],
      });
      mockPrisma.customerCareService.findUnique.mockResolvedValueOnce({
        staffId: 'cskh-1',
      });
      mockPrisma.studentInfo.findUnique.mockResolvedValueOnce({
        userId: 'user-uuid-1',
        user: { roleType: UserRole.student },
      });
      mockPrisma.userDevice.findMany.mockResolvedValueOnce([]);

      await expect(
        service.getDevicesByStudentId('UNIST-own', staffActor),
      ).resolves.toEqual([]);
    });

    it('hides students cared for by another customer care staff (404)', async () => {
      mockPrisma.staffInfo.findUnique.mockResolvedValueOnce({
        id: 'cskh-1',
        roles: [StaffRole.customer_care],
      });
      mockPrisma.customerCareService.findUnique.mockResolvedValueOnce({
        staffId: 'cskh-2',
      });

      await expect(
        service.getDevicesByStudentId('UNIST-other', staffActor),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockPrisma.studentInfo.findUnique).not.toHaveBeenCalled();
    });

    it('rejects staff without a student-account role (403)', async () => {
      mockPrisma.staffInfo.findUnique.mockResolvedValueOnce({
        id: 'teacher-1',
        roles: [StaffRole.teacher],
      });

      await expect(
        service.getDevicesByStudentId('UNIST-any', staffActor),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('blocks force-logout of a device owned by a student outside CSKH scope', async () => {
      mockPrisma.userDevice.findUnique.mockResolvedValueOnce({
        id: 'device-9',
        userId: 'user-uuid-9',
        user: {
          roleType: UserRole.student,
          studentInfo: { id: 'UNIST-other' },
        },
      });
      mockPrisma.staffInfo.findUnique.mockResolvedValueOnce({
        id: 'cskh-1',
        roles: [StaffRole.customer_care],
      });
      mockPrisma.customerCareService.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.forceLogoutDevice('device-9', {
          userId: 'staff-user',
          userEmail: 'cskh',
          roleType: UserRole.staff,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
