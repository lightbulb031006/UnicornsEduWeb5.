jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StaffRole } from '../../generated/enums';
import { DeductionSettingsService } from './deduction-settings.service';

describe('DeductionSettingsService', () => {
  const mockPrisma = {
    roleTaxDeductionRate: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    staffTaxDeductionOverride: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };

  const actionHistoryService = {
    recordCreate: jest.fn(),
    recordUpdate: jest.fn(),
    recordDelete: jest.fn(),
  };

  let service: DeductionSettingsService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      (callback: (db: typeof mockPrisma) => unknown) => callback(mockPrisma),
    );
    service = new DeductionSettingsService(
      mockPrisma as never,
      actionHistoryService as never,
    );
  });

  it('creates a role default through Prisma so required timestamps are populated and records audit history', async () => {
    mockPrisma.roleTaxDeductionRate.create.mockResolvedValue({
      id: 'role-rate-1',
      roleType: StaffRole.teacher,
      ratePercent: 7,
      effectiveFrom: new Date('2026-10-12T00:00:00.000Z'),
      createdAt: new Date('2026-10-12T08:00:00.000Z'),
      updatedAt: new Date('2026-10-12T08:00:00.000Z'),
    });
    const actor = {
      userId: 'admin-1',
      userEmail: 'admin@example.com',
      roleType: 'admin',
    };

    const result = await service.appendRoleTaxDeductionRate(
      {
        roleType: StaffRole.teacher,
        ratePercent: 7,
        effectiveFrom: '2026-10-12',
      },
      actor,
    );

    expect(mockPrisma.roleTaxDeductionRate.create).toHaveBeenCalledWith({
      data: {
        roleType: StaffRole.teacher,
        ratePercent: 7,
        effectiveFrom: new Date('2026-10-12T00:00:00.000Z'),
      },
    });
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    expect(result).toEqual({
      id: 'role-rate-1',
      roleType: StaffRole.teacher,
      ratePercent: 7,
      effectiveFrom: '2026-10-12',
      createdAt: '2026-10-12T08:00:00.000Z',
    });
    expect(actionHistoryService.recordCreate).toHaveBeenCalledWith(mockPrisma, {
      actor,
      entityType: 'tax_deduction_role_rate',
      entityId: 'role-rate-1',
      description: 'Append tax deduction role default rate',
      afterValue: result,
    });
  });

  it('rejects duplicate role default dates with a bad request and does not record a successful creation', async () => {
    mockPrisma.roleTaxDeductionRate.create.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.appendRoleTaxDeductionRate(
        {
          roleType: StaffRole.teacher,
          ratePercent: 7,
          effectiveFrom: '2026-10-12',
        },
        {
          userId: 'admin-1',
          userEmail: 'admin@example.com',
          roleType: 'admin',
        },
      ),
    ).rejects.toThrow(
      new BadRequestException('A rate already exists for this effective date.'),
    );
    expect(actionHistoryService.recordCreate).not.toHaveBeenCalled();
  });

  it('updates an existing role default tax rate and records audit history', async () => {
    mockPrisma.roleTaxDeductionRate.findUnique.mockResolvedValue({
      id: 'role-rate-1',
      roleType: StaffRole.teacher,
      ratePercent: 10,
      effectiveFrom: new Date('2026-04-01T00:00:00.000Z'),
      createdAt: new Date('2026-03-20T00:00:00.000Z'),
    });
    mockPrisma.roleTaxDeductionRate.update.mockResolvedValue({
      id: 'role-rate-1',
      roleType: StaffRole.teacher,
      ratePercent: 12.5,
      effectiveFrom: new Date('2026-04-15T00:00:00.000Z'),
      createdAt: new Date('2026-03-20T00:00:00.000Z'),
    });

    const result = await service.updateRoleTaxDeductionRate(
      'role-rate-1',
      {
        ratePercent: 12.5,
        effectiveFrom: '2026-04-15',
      },
      {
        userId: 'admin-1',
        userEmail: 'admin@example.com',
        roleType: 'admin',
      },
    );

    expect(mockPrisma.roleTaxDeductionRate.update).toHaveBeenCalledWith({
      where: { id: 'role-rate-1' },
      data: {
        ratePercent: 12.5,
        effectiveFrom: new Date('2026-04-15'),
      },
    });
    expect(actionHistoryService.recordUpdate).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({
        entityType: 'tax_deduction_role_rate',
        entityId: 'role-rate-1',
      }),
    );
    expect(result).toEqual({
      id: 'role-rate-1',
      roleType: StaffRole.teacher,
      ratePercent: 12.5,
      effectiveFrom: '2026-04-15',
      createdAt: '2026-03-20T00:00:00.000Z',
    });
  });

  it('updates an existing staff override tax rate and preserves staff identity', async () => {
    mockPrisma.staffTaxDeductionOverride.findUnique.mockResolvedValue({
      id: 'override-1',
      staffId: 'staff-1',
      roleType: StaffRole.teacher,
      ratePercent: 8,
      effectiveFrom: new Date('2026-04-01T00:00:00.000Z'),
      createdAt: new Date('2026-03-20T00:00:00.000Z'),
      staff: {
        user: {
          first_name: 'Van A',
          last_name: 'Nguyen',
        },
      },
    });
    mockPrisma.staffTaxDeductionOverride.update.mockResolvedValue({
      id: 'override-1',
      staffId: 'staff-1',
      roleType: StaffRole.teacher,
      ratePercent: 9.5,
      effectiveFrom: new Date('2026-04-18T00:00:00.000Z'),
      createdAt: new Date('2026-03-20T00:00:00.000Z'),
      staff: {
        user: {
          first_name: 'Van A',
          last_name: 'Nguyen',
        },
      },
    });

    const result = await service.updateStaffTaxDeductionOverride(
      'override-1',
      {
        ratePercent: 9.5,
        effectiveFrom: '2026-04-18',
      },
      {
        userId: 'admin-1',
        userEmail: 'admin@example.com',
        roleType: 'admin',
      },
    );

    expect(mockPrisma.staffTaxDeductionOverride.update).toHaveBeenCalledWith({
      where: { id: 'override-1' },
      data: {
        ratePercent: 9.5,
        effectiveFrom: new Date('2026-04-18'),
      },
      include: {
        staff: {
          select: {
            user: {
              select: {
                first_name: true,
                last_name: true,
              },
            },
          },
        },
      },
    });
    expect(actionHistoryService.recordUpdate).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({
        entityType: 'tax_deduction_staff_override',
        entityId: 'override-1',
      }),
    );
    expect(result).toEqual({
      id: 'override-1',
      staffId: 'staff-1',
      staffName: 'Nguyen Van A',
      roleType: StaffRole.teacher,
      ratePercent: 9.5,
      effectiveFrom: '2026-04-18',
      createdAt: '2026-03-20T00:00:00.000Z',
    });
  });

  it('throws not found when updating a missing role default rate', async () => {
    mockPrisma.roleTaxDeductionRate.findUnique.mockResolvedValue(null);

    await expect(
      service.updateRoleTaxDeductionRate('missing-id', {
        ratePercent: 10,
        effectiveFrom: '2026-04-14',
      }),
    ).rejects.toThrow(
      new NotFoundException('Role default tax deduction rate not found.'),
    );
  });

  it('normalizes duplicate update conflicts into a bad request', async () => {
    mockPrisma.roleTaxDeductionRate.findUnique.mockResolvedValue({
      id: 'role-rate-1',
      roleType: StaffRole.teacher,
      ratePercent: 10,
      effectiveFrom: new Date('2026-04-01T00:00:00.000Z'),
      createdAt: new Date('2026-03-20T00:00:00.000Z'),
    });
    mockPrisma.roleTaxDeductionRate.update.mockRejectedValue({
      code: 'P2002',
    });

    await expect(
      service.updateRoleTaxDeductionRate('role-rate-1', {
        ratePercent: 12,
        effectiveFrom: '2026-04-14',
      }),
    ).rejects.toThrow(
      new BadRequestException('A rate already exists for this effective date.'),
    );
  });
});
