jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  AttendanceStatus,
  PaymentStatus,
  StaffRole,
  StaffStatus,
  UserRole,
} from '../../generated/enums';
import { TrainingManagerService } from './training-manager.service';

describe('TrainingManagerService', () => {
  const mockPrisma = {
    staffInfo: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    class: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    session: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  let service: TrainingManagerService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TrainingManagerService(mockPrisma as never);
  });

  describe('getSessionAllowancesByClass', () => {
    const staffId = 'staff-training-1';
    const classId = 'class-1';
    const monthKey = '2026-07';

    it('returns session allowances for a managed class in month', async () => {
      mockPrisma.class.findUnique.mockResolvedValue({
        id: classId,
        trainingManagerStaffId: staffId,
      });
      mockPrisma.session.findMany.mockResolvedValue([
        {
          id: 'session-1',
          date: new Date('2026-07-15T00:00:00.000Z'),
          trainingManagerRatePercent: 5,
          trainingManagerAllowanceAmount: 34714,
          trainingManagerPaymentStatus: PaymentStatus.pending,
          attendance: [{ tuitionFee: 500_000 }, { tuitionFee: 194_280 }],
        },
      ]);

      const result = await service.getSessionAllowancesByClass(
        'admin-user',
        UserRole.admin,
        staffId,
        classId,
        monthKey,
      );

      expect(result).toEqual([
        {
          sessionId: 'session-1',
          date: new Date('2026-07-15T00:00:00.000Z').toISOString(),
          sessionTuitionTotal: 694_280,
          trainingManagerRatePercent: 5,
          allowanceAmount: 34714,
          paymentStatus: PaymentStatus.pending,
        },
      ]);
      expect(mockPrisma.session.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            classId,
            trainingManagerStaffId: staffId,
          }),
          select: expect.objectContaining({
            attendance: expect.objectContaining({
              where: {
                status: {
                  in: [AttendanceStatus.present, AttendanceStatus.excused],
                },
              },
            }),
          }),
        }),
      );
    });

    it('throws when class is not found', async () => {
      mockPrisma.class.findUnique.mockResolvedValue(null);

      await expect(
        service.getSessionAllowancesByClass(
          'admin-user',
          UserRole.admin,
          staffId,
          classId,
          monthKey,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws when class is not managed by staff', async () => {
      mockPrisma.class.findUnique.mockResolvedValue({
        id: classId,
        trainingManagerStaffId: 'other-staff',
      });

      await expect(
        service.getSessionAllowancesByClass(
          'admin-user',
          UserRole.admin,
          staffId,
          classId,
          monthKey,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('updateClassTrainingManager', () => {
    const classId = 'class-1';
    const adminActor = { userId: 'admin-user', roleType: UserRole.admin };
    const updatedClass = { id: classId, trainingManagerStaffId: 'staff-1' };

    beforeEach(() => {
      mockPrisma.class.findUnique.mockResolvedValue({ id: classId });
      mockPrisma.class.update.mockReturnValue(updatedClass);
      mockPrisma.staffInfo.update.mockReturnValue({ id: 'staff-1' });
      mockPrisma.$transaction.mockImplementation((ops: unknown[]) =>
        Promise.all(ops),
      );
    });

    it('assigns training staff without touching roles', async () => {
      mockPrisma.staffInfo.findUnique.mockResolvedValue({
        id: 'staff-1',
        roles: [StaffRole.training],
        status: StaffStatus.active,
      });

      await expect(
        service.updateClassTrainingManager(
          classId,
          { trainingManagerStaffId: 'staff-1' },
          adminActor,
        ),
      ).resolves.toEqual(updatedClass);
      expect(mockPrisma.staffInfo.update).not.toHaveBeenCalled();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('grants training role when a teacher becomes class manager', async () => {
      mockPrisma.staffInfo.findUnique.mockResolvedValue({
        id: 'staff-1',
        roles: [StaffRole.teacher],
        status: StaffStatus.active,
      });

      await expect(
        service.updateClassTrainingManager(
          classId,
          { trainingManagerStaffId: 'staff-1', trainingManagerRatePercent: 5 },
          adminActor,
        ),
      ).resolves.toEqual(updatedClass);
      expect(mockPrisma.staffInfo.update).toHaveBeenCalledWith({
        where: { id: 'staff-1' },
        data: { roles: { push: StaffRole.training } },
        select: { id: true },
      });
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('rejects staff that is neither training nor teacher', async () => {
      mockPrisma.staffInfo.findUnique.mockResolvedValue({
        id: 'staff-1',
        roles: [StaffRole.customer_care],
        status: StaffStatus.active,
      });

      await expect(
        service.updateClassTrainingManager(
          classId,
          { trainingManagerStaffId: 'staff-1' },
          adminActor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockPrisma.class.update).not.toHaveBeenCalled();
    });

    it('rejects inactive teacher', async () => {
      mockPrisma.staffInfo.findUnique.mockResolvedValue({
        id: 'staff-1',
        roles: [StaffRole.teacher],
        status: StaffStatus.inactive,
      });

      await expect(
        service.updateClassTrainingManager(
          classId,
          { trainingManagerStaffId: 'staff-1' },
          adminActor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
