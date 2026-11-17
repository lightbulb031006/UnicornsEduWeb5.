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
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    user: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const mockActionHistory = {
    recordUpdate: jest.fn(),
  };

  let service: TrainingManagerService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Không rò actor của test trước sang `resolveStaffPolicyActor`.
    mockPrisma.user.findUnique.mockReset();
    service = new TrainingManagerService(
      mockPrisma as never,
      mockActionHistory as never,
    );
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

  describe('quyền xem trợ cấp quản lý lớp (#270)', () => {
    const staffId = 'staff-training-1';
    const classId = 'class-1';

    function mockViewer(viewerStaffId: string, roles: StaffRole[]) {
      mockPrisma.user.findUnique.mockResolvedValue({
        roleType: UserRole.staff,
        staffInfo: { id: viewerStaffId, roles },
      });
      mockPrisma.class.findUnique.mockResolvedValue({
        id: classId,
        trainingManagerStaffId: staffId,
      });
      mockPrisma.session.findMany.mockResolvedValue([]);
    }

    it.each([
      ['Kế toán thu', [StaffRole.accountant_income]],
      ['Trưởng ban Đào tạo', [StaffRole.training_head]],
      ['Trưởng phòng Sale & CSKH', [StaffRole.sale_customer_care_head]],
    ])('chặn %s xem trợ cấp của người khác', async (_label, roles) => {
      mockViewer('viewer-staff', roles);

      await expect(
        service.getSessionAllowancesByClass(
          'viewer-user',
          UserRole.staff,
          staffId,
          classId,
          '2026-07',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.session.findMany).not.toHaveBeenCalled();
    });

    it.each([
      ['Kế toán chi', 'viewer-staff', [StaffRole.accountant_expense]],
      [
        'Kế toán thu kiêm Kế toán chi',
        'viewer-staff',
        [StaffRole.accountant_income, StaffRole.accountant_expense],
      ],
      ['chính người quản lý', staffId, [StaffRole.training]],
    ])('cho %s xem trợ cấp', async (_label, viewerStaffId, roles) => {
      mockViewer(viewerStaffId, roles);

      await expect(
        service.getSessionAllowancesByClass(
          'viewer-user',
          UserRole.staff,
          staffId,
          classId,
          '2026-07',
        ),
      ).resolves.toEqual([]);
    });

    it('báo thiếu hồ sơ khi staff chưa có staff_info', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        roleType: UserRole.staff,
        staffInfo: null,
      });

      await expect(
        service.getSessionAllowancesByClass(
          'viewer-user',
          UserRole.staff,
          staffId,
          classId,
          '2026-07',
        ),
      ).rejects.toThrow('Staff profile required');
    });
  });

  describe('updateClassTrainingManager', () => {
    const classId = 'class-1';
    const adminActor = {
      userId: 'admin-user',
      userEmail: 'admin@edu.vn',
      roleType: UserRole.admin,
    };
    const updatedClass = {
      id: classId,
      trainingManagerStaffId: 'staff-1',
      trainingManagerRatePercent: 3,
    };

    beforeEach(() => {
      mockPrisma.class.findUnique.mockResolvedValue({
        id: classId,
        trainingManagerStaffId: 'staff-1',
        trainingManagerRatePercent: 3,
      });
      mockPrisma.class.update.mockResolvedValue(updatedClass);
      mockPrisma.staffInfo.update.mockResolvedValue({ id: 'staff-1' });
      mockPrisma.$transaction.mockImplementation(
        (callback: (tx: typeof mockPrisma) => unknown) => callback(mockPrisma),
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
    });

    it('records action history when the rate percent changes', async () => {
      mockPrisma.class.update.mockResolvedValue({
        ...updatedClass,
        trainingManagerRatePercent: 2,
      });

      await service.updateClassTrainingManager(
        classId,
        { trainingManagerRatePercent: 2 },
        adminActor,
      );

      expect(mockActionHistory.recordUpdate).toHaveBeenCalledWith(mockPrisma, {
        actor: adminActor,
        entityType: 'class',
        entityId: classId,
        description: 'Cập nhật quản lý lớp / % quản lý',
        beforeValue: {
          trainingManagerStaffId: 'staff-1',
          trainingManagerRatePercent: 3,
        },
        afterValue: {
          trainingManagerStaffId: 'staff-1',
          trainingManagerRatePercent: 2,
        },
      });
    });

    it('skips action history when nothing changes', async () => {
      mockPrisma.staffInfo.findUnique.mockResolvedValue({
        id: 'staff-1',
        roles: [StaffRole.training],
        status: StaffStatus.active,
      });

      await service.updateClassTrainingManager(
        classId,
        { trainingManagerStaffId: 'staff-1', trainingManagerRatePercent: 3 },
        adminActor,
      );

      expect(mockActionHistory.recordUpdate).not.toHaveBeenCalled();
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

    it('training_head làm quản lý lớp không bị cấp thêm role training', async () => {
      mockPrisma.staffInfo.findUnique.mockResolvedValue({
        id: 'staff-1',
        roles: [StaffRole.training_head],
        status: StaffStatus.active,
      });

      await expect(
        service.updateClassTrainingManager(
          classId,
          { trainingManagerStaffId: 'staff-1', trainingManagerRatePercent: 5 },
          adminActor,
        ),
      ).resolves.toEqual(updatedClass);
      expect(mockPrisma.staffInfo.update).not.toHaveBeenCalled();
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

    it('rejects staff without assistant role', async () => {
      mockPrisma.staffInfo.findFirst.mockResolvedValue({
        roles: [StaffRole.training],
      });

      await expect(
        service.updateClassTrainingManager(
          classId,
          { trainingManagerRatePercent: 2 },
          { userId: 'staff-user', roleType: UserRole.staff },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
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

  describe('% trợ cấp quản lý lớp chỉ Admin sửa (#276)', () => {
    const classId = 'class-1';
    const staffActor = {
      userId: 'staff-user',
      userEmail: 'staff@edu.vn',
      roleType: UserRole.staff,
    };
    const asStaff = (roles: StaffRole[]) =>
      mockPrisma.user.findUnique.mockResolvedValue({
        roleType: UserRole.staff,
        staffInfo: { id: 'staff-actor', roles },
      });

    beforeEach(() => {
      mockPrisma.class.findUnique.mockResolvedValue({
        id: classId,
        trainingManagerStaffId: 'staff-actor',
        trainingManagerRatePercent: 3,
      });
      mockPrisma.class.update.mockResolvedValue({
        id: classId,
        trainingManagerStaffId: 'staff-actor',
        trainingManagerRatePercent: 5,
      });
      mockPrisma.$transaction.mockImplementation(
        (callback: (tx: typeof mockPrisma) => unknown) => callback(mockPrisma),
      );
    });

    it.each([
      [[StaffRole.training]],
      [[StaffRole.training_head]],
      [[StaffRole.training, StaffRole.teacher]],
      [[StaffRole.sale_customer_care_head]],
      [[StaffRole.accountant_expense]],
      [[StaffRole.accountant_income]],
    ])('từ chối %p sửa % của lớp', async (roles) => {
      asStaff(roles);

      await expect(
        service.updateClassTrainingManager(
          classId,
          { trainingManagerRatePercent: 5 },
          staffActor,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.class.update).not.toHaveBeenCalled();
    });

    // #277: Trưởng ban Đào tạo giao / gỡ Quản lý lớp trên mọi lớp, không sửa %.
    it.each([
      ['giao', 'staff-other'],
      ['gỡ', null],
    ])(
      'Trưởng ban Đào tạo được %s Quản lý lớp trên lớp không quản lý',
      async (_label, nextStaffId) => {
        asStaff([StaffRole.training_head]);
        mockPrisma.staffInfo.findUnique.mockResolvedValue({
          id: 'staff-other',
          roles: [StaffRole.training],
          status: StaffStatus.active,
        });

        await service.updateClassTrainingManager(
          classId,
          // Form gửi lại % cũ (3) — không bị chặn vì % không đổi.
          {
            trainingManagerStaffId: nextStaffId,
            trainingManagerRatePercent: 3,
          },
          staffActor,
        );
        expect(mockPrisma.class.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: classId },
            data: expect.objectContaining({
              trainingManagerStaffId: nextStaffId,
            }),
          }),
        );
      },
    );

    it.each([
      [[StaffRole.training]],
      [[StaffRole.training, StaffRole.teacher]],
      [[StaffRole.sale_customer_care_head]],
      [[StaffRole.accountant_expense]],
    ])('từ chối %p giao / gỡ Quản lý lớp', async (roles) => {
      asStaff(roles);

      await expect(
        service.updateClassTrainingManager(
          classId,
          { trainingManagerStaffId: null },
          staffActor,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.class.update).not.toHaveBeenCalled();
    });

    it('staff mang role admin được sửa % của lớp', async () => {
      asStaff([StaffRole.admin]);

      await expect(
        service.updateClassTrainingManager(
          classId,
          { trainingManagerRatePercent: 5 },
          staffActor,
        ),
      ).resolves.toMatchObject({ trainingManagerRatePercent: 5 });
      expect(mockPrisma.class.update).toHaveBeenCalled();
    });

    it.each([
      [[StaffRole.training_head]],
      [[StaffRole.training]],
      [[StaffRole.sale_customer_care_head]],
    ])('từ chối %p sửa % trên buổi', async (roles) => {
      asStaff(roles);

      await expect(
        service.updateSessionRatePercent(
          staffActor,
          'UNISTAFF-1',
          '15ecdca1-4cbb-4148-9929-8e8cdab3b90d',
          3,
        ),
      ).rejects.toThrow('Chỉ Admin được sửa % trợ cấp quản lý lớp.');
      expect(mockPrisma.session.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('updateSessionRatePercent', () => {
    const staffId = 'UNISTAFF-1';
    const sessionId = '15ecdca1-4cbb-4148-9929-8e8cdab3b90d';
    const adminActor = {
      userId: 'admin-user',
      userEmail: 'admin@edu.vn',
      roleType: UserRole.admin,
    };
    const pendingSession = {
      id: sessionId,
      date: new Date('2026-11-05T00:00:00.000Z'),
      trainingManagerStaffId: staffId,
      trainingManagerRatePercent: 2,
      trainingManagerAllowanceAmount: 7380,
      trainingManagerPaymentStatus: PaymentStatus.pending,
      attendance: [{ tuitionFee: 369000 }],
    };

    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation(
        (callback: (tx: typeof mockPrisma) => unknown) => callback(mockPrisma),
      );
      mockPrisma.session.update.mockResolvedValue({ id: sessionId });
    });

    it('recomputes allowance from session tuition and logs history', async () => {
      mockPrisma.session.findFirst.mockResolvedValue(pendingSession);

      await expect(
        service.updateSessionRatePercent(adminActor, staffId, sessionId, 3),
      ).resolves.toEqual({
        sessionId,
        date: '2026-11-05T00:00:00.000Z',
        sessionTuitionTotal: 369000,
        trainingManagerRatePercent: 3,
        allowanceAmount: 11070,
        paymentStatus: PaymentStatus.pending,
      });
      expect(mockPrisma.session.update).toHaveBeenCalledWith({
        where: { id: sessionId },
        data: {
          trainingManagerRatePercent: 3,
          trainingManagerAllowanceAmount: 11070,
          trainingManagerPaymentStatus: PaymentStatus.pending,
        },
      });
      const [historyTx, historyInput] = mockActionHistory.recordUpdate.mock
        .calls[0] as [
        unknown,
        {
          entityType: string;
          entityId: string;
          beforeValue: Record<string, unknown>;
          afterValue: Record<string, unknown>;
        },
      ];
      expect(historyTx).toBe(mockPrisma);
      expect(historyInput.entityType).toBe('session');
      expect(historyInput.entityId).toBe(sessionId);
      expect(historyInput.beforeValue).toMatchObject({
        trainingManagerRatePercent: 2,
        trainingManagerAllowanceAmount: 7380,
      });
      expect(historyInput.afterValue).toMatchObject({
        trainingManagerRatePercent: 3,
        trainingManagerAllowanceAmount: 11070,
      });
    });

    it('rejects paid sessions', async () => {
      mockPrisma.session.findFirst.mockResolvedValue({
        ...pendingSession,
        trainingManagerPaymentStatus: PaymentStatus.paid,
      });

      await expect(
        service.updateSessionRatePercent(adminActor, staffId, sessionId, 3),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockPrisma.session.update).not.toHaveBeenCalled();
    });

    it.each([0, -1, 101, 'abc'])('rejects invalid rate %p', async (rate) => {
      await expect(
        service.updateSessionRatePercent(adminActor, staffId, sessionId, rate),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockPrisma.session.findFirst).not.toHaveBeenCalled();
    });

    it('rejects sessions outside the staff scope', async () => {
      mockPrisma.session.findFirst.mockResolvedValue(null);

      await expect(
        service.updateSessionRatePercent(adminActor, staffId, sessionId, 3),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
