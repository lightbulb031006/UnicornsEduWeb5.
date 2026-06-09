jest.mock('src/prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));

jest.mock('src/payroll/deduction-rates', () => ({
  resolveTaxDeductionRate: jest.fn().mockResolvedValue(10),
}));

import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  PaymentStatus,
  StaffRole,
  StudentStatus,
  UserRole,
  WalletTransactionType,
} from 'generated/enums';
import { CustomerCareService } from './customer-care.service';

describe('CustomerCareService', () => {
  const mockPrisma = {
    staffInfo: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    customerCareService: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    walletTransactionsHistory: {
      groupBy: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    attendance: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };

  let service: CustomerCareService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mockPrisma) => unknown) => callback(mockPrisma),
    );
    mockPrisma.attendance.findMany.mockResolvedValue([]);
    mockPrisma.attendance.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.customerCareService.count.mockResolvedValue(0);
    mockPrisma.customerCareService.findMany.mockResolvedValue([]);
    mockPrisma.walletTransactionsHistory.groupBy.mockResolvedValue([]);
    mockPrisma.walletTransactionsHistory.count.mockResolvedValue(0);
    mockPrisma.walletTransactionsHistory.findMany.mockResolvedValue([]);
    service = new CustomerCareService(mockPrisma as never);
  });

  it('returns paginated students with 21-day top-up totals', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({ id: 'staff-1' });
    mockPrisma.customerCareService.count.mockResolvedValue(12);
    mockPrisma.customerCareService.findMany.mockResolvedValue([
      {
        student: {
          id: 'student-1',
          fullName: 'Nguyen An',
          accountBalance: -120_000,
          province: 'Ha Noi',
          status: StudentStatus.active,
          studentClasses: [
            { class: { id: 'class-1', name: 'Toan 8A' } },
            { class: { id: 'class-2', name: 'Ly 8A' } },
          ],
        },
      },
    ]);
    mockPrisma.walletTransactionsHistory.groupBy.mockResolvedValue([
      {
        studentId: 'student-1',
        _sum: { amount: 499_000 },
      },
    ]);

    const result = await service.getStudentsByStaffId(
      'admin-user',
      UserRole.admin,
      'staff-1',
      { page: 2, limit: 10 },
    );

    expect(mockPrisma.customerCareService.count).toHaveBeenCalledWith({
      where: { staffId: 'staff-1' },
    });
    expect(mockPrisma.customerCareService.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { staffId: 'staff-1' },
        skip: 10,
        take: 10,
      }),
    );
    expect(mockPrisma.walletTransactionsHistory.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['studentId'],
        where: expect.objectContaining({
          studentId: { in: ['student-1'] },
          type: WalletTransactionType.topup,
        }),
        _sum: { amount: true },
      }),
    );
    expect(result).toEqual({
      data: [
        {
          id: 'student-1',
          fullName: 'Nguyen An',
          accountBalance: -120_000,
          province: 'Ha Noi',
          status: StudentStatus.active,
          classes: [
            { id: 'class-1', name: 'Toan 8A' },
            { id: 'class-2', name: 'Ly 8A' },
          ],
          recentTopUpTotalLast21Days: 499_000,
          recentTopUpMeetsThreshold: true,
        },
      ],
      meta: { total: 12, page: 2, limit: 10 },
    });
  });

  it('returns commission aggregates from SQL rows with numeric totals', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({ id: 'staff-1' });
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        studentId: 'student-1',
        fullName: 'Nguyen An',
        totalCommission: '12345',
        pendingCommission: '5000',
        paidCommission: '7345',
      },
      {
        studentId: 'student-2',
        fullName: '',
        totalCommission: 67890n,
        pendingCommission: 67890n,
        paidCommission: 0,
      },
    ]);

    const result = await service.getCommissionsByStaffId(
      'admin-user',
      UserRole.admin,
      'staff-1',
      { days: 7 },
    );

    expect(mockPrisma.staffInfo.findUnique).toHaveBeenCalledWith({
      where: { id: 'staff-1' },
      select: { id: true },
    });
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mockPrisma.attendance.findMany).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        studentId: 'student-1',
        fullName: 'Nguyen An',
        totalCommission: 12345,
        pendingCommission: 5000,
        paidCommission: 7345,
      },
      {
        studentId: 'student-2',
        fullName: '',
        totalCommission: 67890,
        pendingCommission: 67890,
        paidCommission: 0,
      },
    ]);
  });

  it('does not aggregate commissions when the requested staff does not exist', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue(null);

    await expect(
      service.getCommissionsByStaffId(
        'admin-user',
        UserRole.admin,
        'missing-staff',
      ),
    ).rejects.toThrow(new NotFoundException('Staff not found'));

    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    expect(mockPrisma.attendance.findMany).not.toHaveBeenCalled();
  });

  it('returns paginated top-up history for students assigned to the customer-care staff', async () => {
    const createdAt = new Date('2026-05-15T03:30:00.000Z');
    const date = new Date('2026-05-15T00:00:00.000Z');
    mockPrisma.staffInfo.findUnique.mockResolvedValue({ id: 'staff-1' });
    mockPrisma.walletTransactionsHistory.count.mockResolvedValue(11);
    mockPrisma.walletTransactionsHistory.findMany.mockResolvedValue([
      {
        id: 'topup-1',
        studentId: 'student-1',
        amount: 500_000,
        note: 'NAPVI student-1 class-1',
        date,
        createdAt,
        student: {
          id: 'student-1',
          fullName: 'Nguyen An',
        },
      },
    ]);

    const result = await service.getTopUpHistoryByStaffId(
      'admin-user',
      UserRole.admin,
      'staff-1',
      { page: 2, limit: 10 },
    );

    const expectedWhere = {
      type: WalletTransactionType.topup,
      student: {
        customerCareServices: {
          staffId: 'staff-1',
        },
      },
    };
    expect(mockPrisma.walletTransactionsHistory.count).toHaveBeenCalledWith({
      where: expectedWhere,
    });
    expect(mockPrisma.walletTransactionsHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expectedWhere,
        skip: 10,
        take: 10,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
    expect(result).toEqual({
      data: [
        {
          id: 'topup-1',
          studentId: 'student-1',
          studentName: 'Nguyen An',
          amount: 500_000,
          note: 'NAPVI student-1 class-1',
          date: date.toISOString(),
          createdAt: createdAt.toISOString(),
        },
      ],
      meta: { total: 11, page: 2, limit: 10 },
    });
  });

  it('rejects bulk payment updates for customer-care-only staff', async () => {
    mockPrisma.staffInfo.findFirst.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.customer_care],
    });

    await expect(
      service.bulkUpdateCommissionPaymentStatus(
        'staff-user',
        UserRole.staff,
        'staff-1',
        ['attendance-1'],
        PaymentStatus.paid,
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('bulk updates only customer-care attendances that change status', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({ id: 'staff-1' });
    mockPrisma.attendance.findMany.mockResolvedValue([
      {
        id: 'attendance-1',
        customerCarePaymentStatus: PaymentStatus.pending,
      },
      {
        id: 'attendance-2',
        customerCarePaymentStatus: PaymentStatus.paid,
      },
    ]);
    mockPrisma.attendance.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.bulkUpdateCommissionPaymentStatus(
      'admin-user',
      UserRole.admin,
      'staff-1',
      ['attendance-1', 'attendance-2'],
      PaymentStatus.paid,
    );

    expect(mockPrisma.attendance.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['attendance-1', 'attendance-2'] },
        customerCareStaffId: 'staff-1',
      },
      select: {
        id: true,
        customerCarePaymentStatus: true,
      },
    });
    expect(mockPrisma.attendance.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['attendance-1'] },
      },
      data: {
        customerCarePaymentStatus: PaymentStatus.paid,
        customerCareTaxDeductionRatePercent: 10,
      },
    });
    expect(result).toEqual({
      staffId: 'staff-1',
      requestedCount: 2,
      updatedCount: 1,
    });
  });
});
