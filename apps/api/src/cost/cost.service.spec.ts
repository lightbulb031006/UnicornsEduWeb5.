import { BadRequestException, NotFoundException } from '@nestjs/common';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));

import { PaymentStatus } from '../../generated/enums';
import { CostService } from './cost.service';

describe('CostService', () => {
  const mockPrisma = {
    costExtend: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const actionHistoryService = {
    recordCreate: jest.fn(),
    recordUpdate: jest.fn(),
    recordDelete: jest.fn(),
  };

  let service: CostService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      (callback: (db: typeof mockPrisma) => unknown) => callback(mockPrisma),
    );
    service = new CostService(
      mockPrisma as never,
      actionHistoryService as never,
    );
  });

  it('returns paginated list with clamped limit and case-insensitive category search', async () => {
    mockPrisma.costExtend.count.mockResolvedValue(1);
    mockPrisma.costExtend.findMany.mockResolvedValue([
      {
        id: 'f6f002ba-8a5c-4d8d-9e54-6d7057d155f9',
        category: 'Marketing',
      },
    ]);

    const result = await service.getCosts({
      page: 2,
      limit: 999,
      search: ' mark ',
    });

    expect(mockPrisma.costExtend.count).toHaveBeenCalledWith({
      where: {
        category: {
          contains: 'mark',
          mode: 'insensitive',
        },
      },
    });
    expect(mockPrisma.costExtend.findMany).toHaveBeenCalledWith({
      where: {
        category: {
          contains: 'mark',
          mode: 'insensitive',
        },
      },
      skip: 0,
      take: 100,
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toEqual({
      data: [
        {
          id: 'f6f002ba-8a5c-4d8d-9e54-6d7057d155f9',
          category: 'Marketing',
        },
      ],
      meta: {
        total: 1,
        page: 1,
        limit: 100,
      },
    });
  });

  it('throws NotFoundException when get by id misses', async () => {
    mockPrisma.costExtend.findUnique.mockResolvedValue(null);

    await expect(
      service.getCostById('78aa4875-a5d4-496f-b45e-95fef8f6f881'),
    ).rejects.toThrow(new NotFoundException('Cost not found'));
  });

  it('throws NotFoundException when update misses', async () => {
    mockPrisma.costExtend.findUnique.mockResolvedValue(null);

    await expect(
      service.updateCost({
        id: 'f9b92551-8fe9-4f47-9259-c4f44f8ee4b0',
        status: PaymentStatus.paid,
      }),
    ).rejects.toThrow(new NotFoundException('Cost not found'));
  });

  it('throws NotFoundException when delete misses', async () => {
    mockPrisma.costExtend.findUnique.mockResolvedValue(null);

    await expect(
      service.deleteCost('f2d57c88-f724-46df-9e4b-2f044f5dcf42'),
    ).rejects.toThrow(new NotFoundException('Cost not found'));
  });

  it('creates a cost without client-provided id and records audit using persisted id', async () => {
    const costDate = new Date('2026-03-20T00:00:00.000Z');

    mockPrisma.costExtend.create.mockResolvedValue({
      id: 'generated-cost-1',
      category: 'Marketing',
      amount: 100000,
      date: costDate,
    });

    await service.createCost(
      {
        category: 'Marketing',
        amount: 100000,
        date: '2026-03-20',
        month: '2026-03',
        status: PaymentStatus.pending,
      },
      {
        userId: 'user-1',
        userEmail: 'admin@example.com',
        roleType: 'admin',
      },
    );

    expect(mockPrisma.costExtend.create).toHaveBeenCalledWith({
      data: {
        month: '2026-03',
        category: 'Marketing',
        amount: 100000,
        date: costDate,
        status: PaymentStatus.pending,
      },
    });
    expect(actionHistoryService.recordCreate).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({
        entityType: 'cost',
        entityId: 'generated-cost-1',
      }),
    );
  });

  it('normalizes date-only values before updating a cost', async () => {
    const costDate = new Date('2026-05-20T00:00:00.000Z');
    mockPrisma.costExtend.findUnique.mockResolvedValue({
      id: 'cost-1',
      date: new Date('2026-05-19T00:00:00.000Z'),
    });
    mockPrisma.costExtend.update.mockResolvedValue({
      id: 'cost-1',
      date: costDate,
    });

    await service.updateCost({
      id: 'cost-1',
      date: '2026-05-20',
    });

    expect(mockPrisma.costExtend.update).toHaveBeenCalledWith({
      where: { id: 'cost-1' },
      data: {
        date: costDate,
      },
    });
  });

  it('rejects impossible date-only values before calling Prisma', async () => {
    await expect(
      service.createCost({
        category: 'Marketing',
        date: '2026-02-31',
      }),
    ).rejects.toThrow(new BadRequestException('Cost date must be a valid ISO date'));

    expect(mockPrisma.costExtend.create).not.toHaveBeenCalled();
  });

  it('rejects update when id is missing', async () => {
    await expect(
      service.updateCost({
        status: PaymentStatus.paid,
      } as never),
    ).rejects.toThrow(new BadRequestException('Cost id is required'));

    expect(mockPrisma.costExtend.findUnique).not.toHaveBeenCalled();
  });

  it('bulk updates only costs that change status and records audit entries', async () => {
    mockPrisma.costExtend.findMany
      .mockResolvedValueOnce([
        {
          id: 'cost-1',
          category: 'Marketing',
          status: PaymentStatus.pending,
        },
        {
          id: 'cost-2',
          category: 'Ads',
          status: PaymentStatus.paid,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'cost-1',
          category: 'Marketing',
          status: PaymentStatus.paid,
        },
      ]);

    const result = await service.updateCostStatuses(
      ['cost-1', 'cost-2'],
      PaymentStatus.paid,
      {
        userId: 'admin-1',
        userEmail: 'admin@example.com',
        roleType: 'admin',
      },
    );

    expect(mockPrisma.costExtend.updateMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ['cost-1'],
        },
      },
      data: {
        status: PaymentStatus.paid,
      },
    });
    expect(actionHistoryService.recordUpdate).toHaveBeenCalledTimes(1);
    expect(actionHistoryService.recordUpdate).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({
        entityType: 'cost',
        entityId: 'cost-1',
        description: 'Cập nhật trạng thái thanh toán khoản chi',
      }),
    );
    expect(result).toEqual({
      requestedCount: 2,
      updatedCount: 1,
    });
  });
});
