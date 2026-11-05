jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));
jest.mock('./session-student-balance.service', () => ({
  SessionStudentBalanceService: class SessionStudentBalanceServiceMock {},
}));

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
});
