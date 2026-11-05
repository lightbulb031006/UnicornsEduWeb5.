jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));

jest.mock('../payroll/deduction-rates', () => ({
  parseMonthKeyToEffectiveDate: jest.fn((monthKey: string) => {
    const [year, month] = monthKey.split('-').map(Number);
    return new Date(Date.UTC(year, (month ?? 1) - 1, 1));
  }),
  resolveTaxDeductionRate: jest.fn().mockResolvedValue(7.5),
}));

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  PaymentStatus,
  StaffRole,
  StaffStatus,
  UserRole,
} from '../../generated/enums';
import { ExtraAllowanceService } from './extra-allowance.service';

describe('ExtraAllowanceService', () => {
  const mockPrisma = {
    staffInfo: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    studentInfo: {
      findUnique: jest.fn(),
    },
    extraAllowance: {
      create: jest.fn(),
      delete: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const actionHistoryService = {
    recordCreate: jest.fn(),
    recordUpdate: jest.fn(),
    recordDelete: jest.fn(),
  };

  let service: ExtraAllowanceService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      (callback: (db: typeof mockPrisma) => unknown) => callback(mockPrisma),
    );
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
      status: StaffStatus.active,
    });
    service = new ExtraAllowanceService(
      mockPrisma as never,
      actionHistoryService as never,
    );
  });

  it('creates admin extra allowances without requiring a client-provided id', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
      status: StaffStatus.active,
    });
    mockPrisma.extraAllowance.create.mockResolvedValue({
      id: 'allowance-db-1',
      staffId: 'staff-1',
      amount: 200000,
      status: PaymentStatus.pending,
      note: 'Admin tạo trợ cấp',
      month: '2026-04',
      roleType: StaffRole.assistant,
      taxDeductionRatePercent: 7.5,
    });
    mockPrisma.extraAllowance.findUnique.mockResolvedValue({
      id: 'allowance-db-1',
      staffId: 'staff-1',
      amount: 200000,
      status: PaymentStatus.pending,
      note: 'Admin tạo trợ cấp',
      month: '2026-04',
      roleType: StaffRole.assistant,
      taxDeductionRatePercent: 7.5,
      staff: {
        id: 'staff-1',
        fullName: 'Assistant A',
        roles: [StaffRole.assistant],
        status: 'active',
      },
    });

    const result = await service.createExtraAllowance(
      {
        staffId: 'staff-1',
        month: '2026-04',
        amount: 200000,
        status: PaymentStatus.pending,
        note: 'Admin tạo trợ cấp',
        roleType: StaffRole.assistant,
      },
      {
        userId: 'admin-1',
        userEmail: 'admin@example.com',
        roleType: UserRole.admin,
      },
    );

    expect(mockPrisma.extraAllowance.create).toHaveBeenCalledWith({
      data: {
        staffId: 'staff-1',
        month: '2026-04',
        amount: 200000,
        status: PaymentStatus.pending,
        note: 'Admin tạo trợ cấp',
        roleType: StaffRole.assistant,
        studentId: null,
        taxDeductionRatePercent: 7.5,
      },
    });
    expect(result).toEqual({
      id: 'allowance-db-1',
      staffId: 'staff-1',
      amount: 200000,
      status: PaymentStatus.pending,
      note: 'Admin tạo trợ cấp',
      month: '2026-04',
      roleType: StaffRole.assistant,
      taxDeductionRatePercent: 7.5,
    });
  });

  it('rejects creating an extra allowance for inactive staff', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
      status: StaffStatus.inactive,
    });

    await expect(
      service.createExtraAllowance({
        staffId: 'staff-1',
        month: '2026-04',
        amount: 200000,
        status: PaymentStatus.pending,
        roleType: StaffRole.assistant,
      }),
    ).rejects.toThrow('Nhân sự đang ở trạng thái ngừng hoạt động.');

    expect(mockPrisma.extraAllowance.create).not.toHaveBeenCalled();
  });

  it('allows technical staff to create their own pending extra allowance with role-aware tax snapshot', async () => {
    mockPrisma.staffInfo.findFirst.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.technical],
    });
    mockPrisma.extraAllowance.create.mockResolvedValue({
      id: 'allowance-1',
      staffId: 'staff-1',
      amount: 175000,
      status: PaymentStatus.pending,
      note: 'Hỗ trợ kỹ thuật tháng 4',
      month: '2026-04',
      roleType: StaffRole.technical,
      taxDeductionRatePercent: 7.5,
    });
    mockPrisma.extraAllowance.findUnique.mockResolvedValue({
      id: 'allowance-1',
      staffId: 'staff-1',
      amount: 175000,
      status: PaymentStatus.pending,
      note: 'Hỗ trợ kỹ thuật tháng 4',
      month: '2026-04',
      roleType: StaffRole.technical,
      taxDeductionRatePercent: 7.5,
      staff: {
        id: 'staff-1',
        fullName: 'Technical A',
        roles: [StaffRole.technical],
        status: 'active',
      },
    });

    const result = await service.createMyStaffExtraAllowance(
      {
        id: 'user-1',
        email: 'technical@example.com',
        roleType: UserRole.staff,
      },
      {
        roleType: StaffRole.technical,
        month: '2026-04',
        amount: 175000,
        note: 'Hỗ trợ kỹ thuật tháng 4',
      },
    );

    expect(mockPrisma.extraAllowance.create).toHaveBeenCalledWith({
      data: {
        staffId: 'staff-1',
        month: '2026-04',
        amount: 175000,
        status: PaymentStatus.pending,
        note: 'Hỗ trợ kỹ thuật tháng 4',
        roleType: StaffRole.technical,
        studentId: null,
        taxDeductionRatePercent: 7.5,
      },
    });
    expect(actionHistoryService.recordCreate).toHaveBeenCalled();
    expect(result).toEqual({
      id: 'allowance-1',
      staffId: 'staff-1',
      amount: 175000,
      status: PaymentStatus.pending,
      note: 'Hỗ trợ kỹ thuật tháng 4',
      month: '2026-04',
      roleType: StaffRole.technical,
      taxDeductionRatePercent: 7.5,
    });
  });

  it('allows training staff to create their own pending extra allowance', async () => {
    mockPrisma.staffInfo.findFirst.mockResolvedValue({
      id: 'staff-training-1',
      roles: [StaffRole.training],
    });
    mockPrisma.extraAllowance.create.mockResolvedValue({
      id: 'allowance-training-1',
      staffId: 'staff-training-1',
      amount: 220000,
      status: PaymentStatus.pending,
      note: 'Hỗ trợ đào tạo tháng 5',
      month: '2026-05',
      roleType: StaffRole.training,
      taxDeductionRatePercent: 7.5,
    });
    mockPrisma.extraAllowance.findUnique.mockResolvedValue({
      id: 'allowance-training-1',
      staffId: 'staff-training-1',
      amount: 220000,
      status: PaymentStatus.pending,
      note: 'Hỗ trợ đào tạo tháng 5',
      month: '2026-05',
      roleType: StaffRole.training,
      taxDeductionRatePercent: 7.5,
      staff: {
        id: 'staff-training-1',
        fullName: 'Training A',
        roles: [StaffRole.training],
        status: 'active',
      },
    });

    const result = await service.createMyStaffExtraAllowance(
      {
        id: 'training-user-1',
        email: 'training@example.com',
        roleType: UserRole.staff,
      },
      {
        roleType: StaffRole.training,
        month: '2026-05',
        amount: 220000,
        note: 'Hỗ trợ đào tạo tháng 5',
      },
    );

    expect(mockPrisma.extraAllowance.create).toHaveBeenCalledWith({
      data: {
        staffId: 'staff-training-1',
        month: '2026-05',
        amount: 220000,
        status: PaymentStatus.pending,
        note: 'Hỗ trợ đào tạo tháng 5',
        roleType: StaffRole.training,
        studentId: null,
        taxDeductionRatePercent: 7.5,
      },
    });
    expect(actionHistoryService.recordCreate).toHaveBeenCalled();
    expect(result).toEqual({
      id: 'allowance-training-1',
      staffId: 'staff-training-1',
      amount: 220000,
      status: PaymentStatus.pending,
      note: 'Hỗ trợ đào tạo tháng 5',
      month: '2026-05',
      roleType: StaffRole.training,
      taxDeductionRatePercent: 7.5,
    });
  });

  it('allows communication staff to update their own extra allowance without changing payment status', async () => {
    mockPrisma.staffInfo.findFirst.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.communication],
    });
    const existingAllowance = {
      id: 'allowance-1',
      staffId: 'staff-1',
      amount: 150000,
      status: PaymentStatus.pending,
      note: 'Ghi chú cũ',
      month: '2026-03',
      roleType: StaffRole.communication,
      staff: {
        id: 'staff-1',
        fullName: 'Communication A',
        roles: [StaffRole.communication],
        status: 'active',
      },
    };
    mockPrisma.extraAllowance.findUnique
      .mockResolvedValueOnce(existingAllowance)
      .mockResolvedValueOnce(existingAllowance)
      .mockResolvedValueOnce({
        id: 'allowance-1',
        staffId: 'staff-1',
        amount: 250000,
        status: PaymentStatus.pending,
        note: 'Ghi chú mới',
        month: '2026-04',
        roleType: StaffRole.communication,
        staff: {
          id: 'staff-1',
          fullName: 'Communication A',
          roles: [StaffRole.communication],
          status: 'active',
        },
      });
    mockPrisma.extraAllowance.update.mockResolvedValue({
      id: 'allowance-1',
      staffId: 'staff-1',
      amount: 250000,
      status: PaymentStatus.pending,
      note: 'Ghi chú mới',
      month: '2026-04',
      roleType: StaffRole.communication,
    });

    const result = await service.updateMyStaffExtraAllowance(
      {
        id: 'user-1',
        email: 'communication@example.com',
        roleType: UserRole.staff,
      },
      {
        id: 'allowance-1',
        roleType: StaffRole.communication,
        month: '2026-04',
        amount: 250000,
        note: 'Ghi chú mới',
      },
    );

    expect(mockPrisma.extraAllowance.update).toHaveBeenCalledWith({
      where: { id: 'allowance-1' },
      data: {
        month: '2026-04',
        amount: 250000,
        note: 'Ghi chú mới',
        studentId: null,
        taxDeductionRatePercent: 7.5,
      },
    });
    expect(actionHistoryService.recordUpdate).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({
        entityType: 'extra_allowance',
        entityId: 'allowance-1',
      }),
    );
    expect(result).toEqual({
      id: 'allowance-1',
      staffId: 'staff-1',
      amount: 250000,
      status: PaymentStatus.pending,
      note: 'Ghi chú mới',
      month: '2026-04',
      roleType: StaffRole.communication,
    });
  });

  it('allows training staff to update their own extra allowance without changing payment status', async () => {
    mockPrisma.staffInfo.findFirst.mockResolvedValue({
      id: 'staff-training-1',
      roles: [StaffRole.training],
    });
    const existingTrainingAllowance = {
      id: 'allowance-training-1',
      staffId: 'staff-training-1',
      amount: 180000,
      status: PaymentStatus.pending,
      note: 'Ghi chú cũ',
      month: '2026-05',
      roleType: StaffRole.training,
      staff: {
        id: 'staff-training-1',
        fullName: 'Training A',
        roles: [StaffRole.training],
        status: 'active',
      },
    };
    mockPrisma.extraAllowance.findUnique
      .mockResolvedValueOnce(existingTrainingAllowance)
      .mockResolvedValueOnce(existingTrainingAllowance)
      .mockResolvedValueOnce({
        id: 'allowance-training-1',
        staffId: 'staff-training-1',
        amount: 260000,
        status: PaymentStatus.pending,
        note: 'Ghi chú đào tạo mới',
        month: '2026-06',
        roleType: StaffRole.training,
        staff: {
          id: 'staff-training-1',
          fullName: 'Training A',
          roles: [StaffRole.training],
          status: 'active',
        },
      });
    mockPrisma.extraAllowance.update.mockResolvedValue({
      id: 'allowance-training-1',
      staffId: 'staff-training-1',
      amount: 260000,
      status: PaymentStatus.pending,
      note: 'Ghi chú đào tạo mới',
      month: '2026-06',
      roleType: StaffRole.training,
    });

    const result = await service.updateMyStaffExtraAllowance(
      {
        id: 'training-user-1',
        email: 'training@example.com',
        roleType: UserRole.staff,
      },
      {
        id: 'allowance-training-1',
        roleType: StaffRole.training,
        month: '2026-06',
        amount: 260000,
        note: 'Ghi chú đào tạo mới',
      },
    );

    expect(mockPrisma.extraAllowance.update).toHaveBeenCalledWith({
      where: { id: 'allowance-training-1' },
      data: {
        month: '2026-06',
        amount: 260000,
        note: 'Ghi chú đào tạo mới',
        studentId: null,
        taxDeductionRatePercent: 7.5,
      },
    });
    expect(actionHistoryService.recordUpdate).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({
        entityType: 'extra_allowance',
        entityId: 'allowance-training-1',
      }),
    );
    expect(result).toEqual({
      id: 'allowance-training-1',
      staffId: 'staff-training-1',
      amount: 260000,
      status: PaymentStatus.pending,
      note: 'Ghi chú đào tạo mới',
      month: '2026-06',
      roleType: StaffRole.training,
    });
  });

  it('rejects self updates when current staff lacks communication role', async () => {
    mockPrisma.staffInfo.findFirst.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.assistant],
    });

    await expect(
      service.updateMyStaffExtraAllowance(
        {
          id: 'user-1',
          email: 'assistant@example.com',
          roleType: UserRole.staff,
        },
        {
          id: 'allowance-1',
          roleType: StaffRole.communication,
          month: '2026-04',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects self create when current staff lacks requested technical role', async () => {
    mockPrisma.staffInfo.findFirst.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.communication],
    });

    await expect(
      service.createMyStaffExtraAllowance(
        {
          id: 'user-1',
          email: 'communication@example.com',
          roleType: UserRole.staff,
        },
        {
          roleType: StaffRole.technical,
          month: '2026-04',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects self updates for communication allowances owned by another staff', async () => {
    mockPrisma.staffInfo.findFirst.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.communication],
    });
    mockPrisma.extraAllowance.findUnique.mockResolvedValue({
      id: 'allowance-1',
      staffId: 'staff-2',
      amount: 150000,
      status: PaymentStatus.pending,
      note: 'Khác staff',
      month: '2026-03',
      roleType: StaffRole.communication,
      staff: {
        id: 'staff-2',
        fullName: 'Communication B',
        roles: [StaffRole.communication],
        status: 'active',
      },
    });

    await expect(
      service.updateMyStaffExtraAllowance(
        {
          id: 'user-1',
          email: 'communication@example.com',
          roleType: UserRole.staff,
        },
        {
          id: 'allowance-1',
          roleType: StaffRole.communication,
          amount: 250000,
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects admin updates when id is missing', async () => {
    await expect(
      service.updateExtraAllowance({
        month: '2026-04',
      } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('sale allowance', () => {
    const saleUser = {
      id: 'sale-user-1',
      email: 'sale@example.com',
      roleType: UserRole.staff,
    };

    beforeEach(() => {
      mockPrisma.staffInfo.findFirst.mockResolvedValue({
        id: 'staff-sale-1',
        roles: [StaffRole.sale],
      });
      mockPrisma.staffInfo.findUnique.mockResolvedValue({
        id: 'staff-sale-1',
        status: StaffStatus.active,
      });
    });

    it('lets sale staff create their own allowance linked to a student', async () => {
      mockPrisma.studentInfo.findUnique.mockResolvedValue({ id: 'UNIST-1' });
      mockPrisma.extraAllowance.create.mockResolvedValue({ id: 'a-1' });

      await service.createMyStaffExtraAllowance(saleUser, {
        roleType: StaffRole.sale,
        month: '2026-10',
        amount: 300000,
        note: 'Chốt khoá IT',
        studentId: 'UNIST-1',
      });

      expect(mockPrisma.extraAllowance.create).toHaveBeenCalledWith(
        expect.objectContaining<{ data: unknown }>({
          data: expect.objectContaining<Record<string, unknown>>({
            staffId: 'staff-sale-1',
            roleType: StaffRole.sale,
            status: PaymentStatus.pending,
            studentId: 'UNIST-1',
            note: 'Chốt khoá IT',
          }),
        }),
      );
    });

    it('rejects sale allowance without a student', async () => {
      await expect(
        service.createMyStaffExtraAllowance(saleUser, {
          roleType: StaffRole.sale,
          month: '2026-10',
          note: 'Chốt khoá IT',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockPrisma.extraAllowance.create).not.toHaveBeenCalled();
    });

    it('rejects sale allowance with a blank note, even when created by admin', async () => {
      await expect(
        service.createExtraAllowance({
          staffId: 'staff-sale-1',
          month: '2026-10',
          roleType: StaffRole.sale,
          studentId: 'UNIST-1',
          note: '   ',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockPrisma.extraAllowance.create).not.toHaveBeenCalled();
    });

    it('rejects sale allowance for a missing student', async () => {
      mockPrisma.studentInfo.findUnique.mockResolvedValue(null);

      await expect(
        service.createMyStaffExtraAllowance(saleUser, {
          roleType: StaffRole.sale,
          month: '2026-10',
          note: 'Chốt khoá IT',
          studentId: 'UNIST-missing',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a student on non-sale allowances', async () => {
      await expect(
        service.createExtraAllowance({
          staffId: 'staff-1',
          month: '2026-10',
          roleType: StaffRole.technical,
          studentId: 'UNIST-1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('keeps the existing student when a sale update omits studentId', async () => {
      const existing = {
        id: 'a-1',
        staffId: 'staff-sale-1',
        status: PaymentStatus.pending,
        note: 'Ghi chú cũ',
        month: '2026-10',
        roleType: StaffRole.sale,
        studentId: 'UNIST-1',
      };
      mockPrisma.extraAllowance.findUnique.mockResolvedValue(existing);
      mockPrisma.studentInfo.findUnique.mockResolvedValue({ id: 'UNIST-1' });
      mockPrisma.extraAllowance.update.mockResolvedValue(existing);

      await service.updateMyStaffExtraAllowance(saleUser, {
        id: 'a-1',
        roleType: StaffRole.sale,
        amount: 500000,
      });

      expect(mockPrisma.extraAllowance.update).toHaveBeenCalledWith(
        expect.objectContaining<{ where: unknown; data: unknown }>({
          where: { id: 'a-1' },
          data: expect.objectContaining<Record<string, unknown>>({
            amount: 500000,
            studentId: 'UNIST-1',
          }),
        }),
      );
    });
  });

  describe('self-managed allowance lifecycle', () => {
    const communicationUser = {
      id: 'user-1',
      email: 'communication@example.com',
      roleType: UserRole.staff,
    };
    const ownAllowance = {
      id: 'allowance-1',
      staffId: 'staff-1',
      amount: 150000,
      status: PaymentStatus.pending,
      note: 'Ghi chú',
      month: '2026-10',
      roleType: StaffRole.communication,
      studentId: null,
    };

    beforeEach(() => {
      mockPrisma.staffInfo.findFirst.mockResolvedValue({
        id: 'staff-1',
        roles: [StaffRole.communication],
      });
    });

    it('rejects self updates on a paid allowance', async () => {
      mockPrisma.extraAllowance.findUnique.mockResolvedValue({
        ...ownAllowance,
        status: PaymentStatus.paid,
      });

      await expect(
        service.updateMyStaffExtraAllowance(communicationUser, {
          id: 'allowance-1',
          roleType: StaffRole.communication,
          amount: 999999,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.extraAllowance.update).not.toHaveBeenCalled();
    });

    it('lets staff delete their own unpaid allowance', async () => {
      mockPrisma.extraAllowance.findUnique.mockResolvedValue(ownAllowance);
      mockPrisma.extraAllowance.delete.mockResolvedValue(ownAllowance);

      await service.deleteMyStaffExtraAllowance(
        communicationUser,
        'allowance-1',
      );

      expect(mockPrisma.extraAllowance.delete).toHaveBeenCalledWith({
        where: { id: 'allowance-1' },
      });
      expect(actionHistoryService.recordDelete).toHaveBeenCalled();
    });

    it('rejects deleting a paid allowance', async () => {
      mockPrisma.extraAllowance.findUnique.mockResolvedValue({
        ...ownAllowance,
        status: PaymentStatus.paid,
      });

      await expect(
        service.deleteMyStaffExtraAllowance(communicationUser, 'allowance-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.extraAllowance.delete).not.toHaveBeenCalled();
    });

    it('rejects deleting an allowance of another staff', async () => {
      mockPrisma.extraAllowance.findUnique.mockResolvedValue({
        ...ownAllowance,
        staffId: 'staff-2',
      });

      await expect(
        service.deleteMyStaffExtraAllowance(communicationUser, 'allowance-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mockPrisma.extraAllowance.delete).not.toHaveBeenCalled();
    });

    it('rejects deleting a non self-managed allowance', async () => {
      mockPrisma.extraAllowance.findUnique.mockResolvedValue({
        ...ownAllowance,
        roleType: StaffRole.assistant,
      });

      await expect(
        service.deleteMyStaffExtraAllowance(communicationUser, 'allowance-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
