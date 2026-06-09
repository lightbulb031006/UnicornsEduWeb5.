jest.mock('src/prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));

jest.mock('src/payroll/deduction-rates', () => ({
  resolveTaxDeductionRate: jest.fn().mockResolvedValue(10),
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
  UserRole,
} from 'generated/enums';
import { AssistantCommissionService } from './assistant-commission.service';

function buildStaffUserMock(lastName: string, firstName: string) {
  return {
    first_name: firstName,
    last_name: lastName,
    accountHandle: null,
    email: null,
  };
}

describe('AssistantCommissionService', () => {
  const mockPrisma = {
    staffInfo: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    attendance: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };

  let service: AssistantCommissionService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mockPrisma) => unknown) =>
        callback(mockPrisma),
    );
    mockPrisma.staffInfo.findMany.mockResolvedValue([]);
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'assistant-1',
      roles: [StaffRole.assistant],
    });
    mockPrisma.staffInfo.findFirst.mockResolvedValue({
      id: 'assistant-1',
      roles: [StaffRole.assistant],
    });
    mockPrisma.attendance.findMany.mockResolvedValue([]);
    mockPrisma.attendance.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.$queryRaw.mockResolvedValue([]);
    service = new AssistantCommissionService(mockPrisma as never);
  });

  it('returns managed customer-care staff with aggregated share totals', async () => {
    mockPrisma.staffInfo.findMany.mockResolvedValue([
      { id: 'cskh-1', user: buildStaffUserMock('CSKH', 'A') },
      { id: 'cskh-2', user: buildStaffUserMock('CSKH', 'B') },
    ]);
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        customerCareStaffId: 'cskh-1',
        totalShareAmount: 300_000,
        pendingShareAmount: 200_000,
        paidShareAmount: 100_000,
      },
    ]);

    const result = await service.getManagedCustomerCare(
      'admin-user',
      UserRole.admin,
      'assistant-1',
      { scope: 'all' },
    );

    expect(result.data).toEqual([
      {
        customerCareStaffId: 'cskh-1',
        fullName: 'CSKH A',
        totalShareAmount: 300_000,
        pendingShareAmount: 200_000,
        paidShareAmount: 100_000,
      },
      {
        customerCareStaffId: 'cskh-2',
        fullName: 'CSKH B',
        totalShareAmount: 0,
        pendingShareAmount: 0,
        paidShareAmount: 0,
      },
    ]);
  });

  it('excludes self-managed customer-care staff from managed list', async () => {
    mockPrisma.staffInfo.findMany.mockResolvedValue([
      { id: 'cskh-1', user: buildStaffUserMock('CSKH', 'A') },
    ]);
    mockPrisma.$queryRaw.mockResolvedValue([]);

    await service.getManagedCustomerCare(
      'admin-user',
      UserRole.admin,
      'assistant-1',
    );

    expect(mockPrisma.staffInfo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          customerCareManagedByStaffId: 'assistant-1',
          id: { not: 'assistant-1' },
        }),
      }),
    );
  });

  it('filters managed customer-care rows to pending scope', async () => {
    mockPrisma.staffInfo.findMany.mockResolvedValue([
      { id: 'cskh-1', user: buildStaffUserMock('CSKH', 'A') },
      { id: 'cskh-2', user: buildStaffUserMock('CSKH', 'B') },
    ]);
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        customerCareStaffId: 'cskh-1',
        totalShareAmount: 300_000,
        pendingShareAmount: 200_000,
        paidShareAmount: 100_000,
      },
      {
        customerCareStaffId: 'cskh-2',
        totalShareAmount: 50_000,
        pendingShareAmount: 0,
        paidShareAmount: 50_000,
      },
    ]);

    const result = await service.getManagedCustomerCare(
      'admin-user',
      UserRole.admin,
      'assistant-1',
      { scope: 'pending' },
    );

    expect(result.data).toEqual([
      expect.objectContaining({
        customerCareStaffId: 'cskh-1',
        pendingShareAmount: 200_000,
      }),
    ]);
  });

  it('returns students aggregated under one managed customer-care staff', async () => {
    mockPrisma.staffInfo.findFirst.mockResolvedValue({
      id: 'cskh-1',
      user: buildStaffUserMock('CSKH', 'A'),
    });
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        studentId: 'student-1',
        fullName: 'Nguyen An',
        totalShareAmount: 90_000,
        pendingShareAmount: 60_000,
        paidShareAmount: 30_000,
      },
    ]);

    const result = await service.getStudentsByManagedCustomerCare(
      'admin-user',
      UserRole.admin,
      'assistant-1',
      'cskh-1',
      { scope: 'all' },
    );

    expect(result.data).toEqual([
      {
        studentId: 'student-1',
        fullName: 'Nguyen An',
        totalShareAmount: 90_000,
        pendingShareAmount: 60_000,
        paidShareAmount: 30_000,
      },
    ]);
  });

  it('returns session share rows with 3% commission', async () => {
    mockPrisma.staffInfo.findFirst.mockResolvedValue({
      id: 'cskh-1',
      user: buildStaffUserMock('CSKH', 'A'),
    });
    mockPrisma.attendance.findMany.mockResolvedValue([
      {
        id: 'attendance-1',
        tuitionFee: 1_000_000,
        status: AttendanceStatus.present,
        assistantPaymentStatus: PaymentStatus.pending,
        session: {
          id: 'session-1',
          date: new Date('2026-05-01T00:00:00.000Z'),
          class: { name: 'Toan 8A' },
        },
      },
    ]);

    const result = await service.getSessionSharesByStudent(
      'admin-user',
      UserRole.admin,
      'assistant-1',
      'cskh-1',
      'student-1',
      { scope: 'pending' },
    );

    expect(result).toEqual([
      {
        attendanceId: 'attendance-1',
        sessionId: 'session-1',
        date: '2026-05-01T00:00:00.000Z',
        className: 'Toan 8A',
        tuitionFee: 1_000_000,
        shareRatePercent: 3,
        shareAmount: 30_000,
        attendanceStatus: AttendanceStatus.present,
        paymentStatus: PaymentStatus.pending,
        customerCareStaffName: 'CSKH A',
      },
    ]);
  });

  it('rejects month scope without month key', async () => {
    await expect(
      service.getManagedCustomerCare(
        'admin-user',
        UserRole.admin,
        'assistant-1',
        { scope: 'month' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects non-assistant staff id', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.customer_care],
    });

    await expect(
      service.getManagedCustomerCare(
        'admin-user',
        UserRole.admin,
        'staff-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects customer-care staff not managed by assistant', async () => {
    mockPrisma.staffInfo.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.getStudentsByManagedCustomerCare(
        'admin-user',
        UserRole.admin,
        'assistant-1',
        'cskh-9',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('forbids customer-care role from reading assistant commission data', async () => {
    mockPrisma.staffInfo.findFirst.mockResolvedValue({
      id: 'cskh-self',
      roles: [StaffRole.customer_care],
    });

    await expect(
      service.getManagedCustomerCare(
        'cskh-user',
        UserRole.staff,
        'assistant-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('bulk updates assistant share payment status to paid with tax snapshot', async () => {
    mockPrisma.attendance.findMany.mockResolvedValue([
      {
        id: 'attendance-1',
        assistantPaymentStatus: PaymentStatus.pending,
      },
    ]);
    mockPrisma.attendance.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.bulkUpdatePaymentStatus(
      'assistant-user',
      UserRole.staff,
      'assistant-1',
      ['attendance-1'],
      PaymentStatus.paid,
    );

    expect(mockPrisma.attendance.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['attendance-1'] } },
      data: {
        assistantPaymentStatus: PaymentStatus.paid,
        assistantTaxDeductionRatePercent: 10,
      },
    });
    expect(result).toEqual({
      assistantStaffId: 'assistant-1',
      requestedCount: 1,
      updatedCount: 1,
    });
  });

  it('bulk resets assistant share payment status to pending', async () => {
    mockPrisma.attendance.findMany.mockResolvedValue([
      {
        id: 'attendance-1',
        assistantPaymentStatus: PaymentStatus.paid,
      },
    ]);
    mockPrisma.attendance.updateMany.mockResolvedValue({ count: 1 });

    await service.bulkUpdatePaymentStatus(
      'assistant-user',
      UserRole.staff,
      'assistant-1',
      ['attendance-1'],
      PaymentStatus.pending,
    );

    expect(mockPrisma.attendance.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['attendance-1'] } },
      data: {
        assistantPaymentStatus: PaymentStatus.pending,
        assistantTaxDeductionRatePercent: 0,
      },
    });
  });

  it('rejects attendance ids that do not belong to assistant manager', async () => {
    mockPrisma.attendance.findMany.mockResolvedValue([]);

    await expect(
      service.bulkUpdatePaymentStatus(
        'assistant-user',
        UserRole.staff,
        'assistant-1',
        ['attendance-404'],
        PaymentStatus.paid,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
