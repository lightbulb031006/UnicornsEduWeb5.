jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));
jest.mock('./session-student-balance.service', () => ({
  SessionStudentBalanceService: class SessionStudentBalanceServiceMock {},
}));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SessionDeleteService } from './session-delete.service';

describe('SessionDeleteService', () => {
  const tx = {
    session: {
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    walletTransactionsHistory: {
      createMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };

  const mockPrisma = {
    $transaction: jest.fn(),
  };

  const balanceService = {
    applyBalanceChanges: jest.fn(),
  };

  const ledgerService = {
    getAttendanceChargeAmount: jest.fn(),
    buildRefundNote: jest.fn(),
  };

  const snapshotService = {
    getSessionAuditSnapshot: jest.fn(),
  };

  const actionHistoryService = {
    recordDelete: jest.fn(),
  };

  let service: SessionDeleteService;

  beforeEach(() => {
    jest.clearAllMocks();
    tx.user.findUnique.mockResolvedValue({
      roleType: 'admin',
      staffInfo: null,
    });
    mockPrisma.$transaction.mockImplementation(
      (callback: (db: typeof tx) => unknown) => callback(tx),
    );
    service = new SessionDeleteService(
      mockPrisma as never,
      balanceService as never,
      ledgerService as never,
      snapshotService as never,
      actionHistoryService as never,
      {
        assertTrialAttendanceAllowed: jest.fn(),
        releaseBeforeDelete: jest.fn(),
        reconcile: jest.fn(),
      } as never,
    );
  });

  it('records delete audit history with the full session snapshot', async () => {
    tx.session.findUnique.mockResolvedValue({
      id: 'session-1',
      date: new Date('2026-03-20T00:00:00.000Z'),
      class: { name: 'Math 1' },
      attendance: [],
    });
    tx.session.delete.mockResolvedValue({ id: 'session-1' });
    snapshotService.getSessionAuditSnapshot.mockResolvedValue({
      id: 'session-1',
      date: '2026-03-20',
      attendance: [],
    });

    await service.deleteSession('session-1', {
      userId: 'user-1',
      userEmail: 'admin@example.com',
      roleType: 'admin',
    });

    expect(actionHistoryService.recordDelete).toHaveBeenCalledWith(tx, {
      actor: {
        userId: 'user-1',
        userEmail: 'admin@example.com',
        roleType: 'admin',
      },
      entityType: 'session',
      entityId: 'session-1',
      description: 'Xóa buổi học',
      beforeValue: {
        id: 'session-1',
        date: '2026-03-20',
        attendance: [],
      },
    });
  });

  describe('15/11 role trưởng xoá buổi', () => {
    const headActor = {
      userId: 'head-user',
      userEmail: 'head@example.com',
      roleType: 'staff',
    };
    const sessionWithStatus = (teacherPaymentStatus: string | null) => ({
      id: 'session-2',
      classId: 'class-1',
      date: new Date('2026-11-10T00:00:00.000Z'),
      teacherPaymentStatus,
      class: { name: 'Math 2' },
      attendance: [],
    });
    const asStaffWithRoles = (roles: string[]) =>
      tx.user.findUnique.mockResolvedValue({
        roleType: 'staff',
        staffInfo: { id: 'staff-head', roles },
      });

    it.each(['sale_customer_care_head', 'training_head', 'lesson_plan_head'])(
      '%s xoá được buổi chưa thanh toán',
      async (role) => {
        asStaffWithRoles([role]);
        tx.session.findUnique.mockResolvedValue(sessionWithStatus('unpaid'));
        tx.session.delete.mockResolvedValue({ id: 'session-2' });

        await expect(
          service.deleteSession('session-2', headActor),
        ).resolves.toEqual({ id: 'session-2' });
        expect(tx.session.delete).toHaveBeenCalledWith({
          where: { id: 'session-2' },
        });
      },
    );

    it.each(['paid', 'deposit'])(
      'role trưởng không xoá được buổi %s',
      async (status) => {
        asStaffWithRoles(['training_head']);
        tx.session.findUnique.mockResolvedValue(sessionWithStatus(status));

        await expect(
          service.deleteSession('session-2', headActor),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(tx.session.delete).not.toHaveBeenCalled();
      },
    );

    it('Admin vẫn xoá được buổi đã thanh toán', async () => {
      tx.session.findUnique.mockResolvedValue(sessionWithStatus('paid'));
      tx.session.delete.mockResolvedValue({ id: 'session-2' });

      await expect(
        service.deleteSession('session-2', {
          userId: 'admin-user',
          roleType: 'admin',
        }),
      ).resolves.toEqual({ id: 'session-2' });
    });

    it('staff không phải trưởng bị 403 dù lọt guard', async () => {
      asStaffWithRoles(['accountant_expense']);
      tx.session.findUnique.mockResolvedValue(sessionWithStatus('unpaid'));

      await expect(
        service.deleteSession('session-2', headActor),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.session.delete).not.toHaveBeenCalled();
    });
  });
});
