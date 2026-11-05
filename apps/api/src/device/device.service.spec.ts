import { NotFoundException } from '@nestjs/common';
import { UserRole } from '../../generated/enums';
import { DeviceService } from './device.service';

describe('DeviceService', () => {
  const mockPrisma = {
    studentInfo: { findUnique: jest.fn() },
    userDevice: { findMany: jest.fn() },
  };
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

      const devices = await service.getDevicesByStudentId('UNIST-82c128048f');

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
        service.getDevicesByStudentId('UNIST-missing'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockPrisma.userDevice.findMany).not.toHaveBeenCalled();
    });

    it('throws 404 when the student has no linked login account', async () => {
      mockPrisma.studentInfo.findUnique.mockResolvedValueOnce({
        userId: null,
        user: null,
      });

      await expect(
        service.getDevicesByStudentId('UNIST-nouser'),
      ).rejects.toThrow('Học sinh chưa có tài khoản đăng nhập');
    });

    it('hides devices when the linked user is not a student', async () => {
      mockPrisma.studentInfo.findUnique.mockResolvedValueOnce({
        userId: 'staff-uuid',
        user: { roleType: UserRole.staff },
      });

      await expect(
        service.getDevicesByStudentId('UNIST-staff'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockPrisma.userDevice.findMany).not.toHaveBeenCalled();
    });
  });
});
