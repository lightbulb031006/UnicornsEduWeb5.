import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentStatus } from '../../generated/enums';
import {
  ActionHistoryActor,
  ActionHistoryService,
} from '../action-history/action-history.service';
import { PaginationQueryDto } from '../dtos/pagination.dto';
import {
  CostBulkStatusUpdateResult,
  CreateCostDto,
  UpdateCostDto,
} from '../dtos/cost.dto';
import { Prisma } from '../../generated/client';
import { PrismaService } from '../prisma/prisma.service';

const COST_DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseCostDateInput(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  const dateOnlyMatch = COST_DATE_ONLY_PATTERN.exec(trimmedValue);
  if (dateOnlyMatch) {
    const [, yearValue, monthValue, dayValue] = dateOnlyMatch;
    const year = Number(yearValue);
    const month = Number(monthValue);
    const day = Number(dayValue);
    const parsedDate = new Date(Date.UTC(year, month - 1, day));

    if (
      parsedDate.getUTCFullYear() !== year ||
      parsedDate.getUTCMonth() !== month - 1 ||
      parsedDate.getUTCDate() !== day
    ) {
      throw new BadRequestException('Cost date must be a valid ISO date');
    }

    return parsedDate;
  }

  const parsedDate = new Date(trimmedValue);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new BadRequestException('Cost date must be a valid ISO date');
  }

  return parsedDate;
}

@Injectable()
export class CostService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actionHistoryService: ActionHistoryService,
  ) {}

  async getCosts(
    query: PaginationQueryDto & {
      search?: string;
      year?: string;
      month?: string;
    },
  ) {
    const parsedPage = Number(query.page);
    const parsedLimit = Number(query.limit);
    const page =
      Number.isInteger(parsedPage) && parsedPage >= 1 ? parsedPage : 1;
    const limit =
      Number.isInteger(parsedLimit) && parsedLimit >= 1
        ? Math.min(parsedLimit, 100)
        : 20;

    const trimmedSearch = query.search?.trim();
    const year = query.year?.trim();
    const month = query.month?.trim();
    const hasMonthFilter =
      year && month && /^\d{4}$/.test(year) && /^(0?[1-9]|1[0-2])$/.test(month);
    const normalizedMonth = hasMonthFilter
      ? month.length === 1
        ? `0${month}`
        : month
      : null;
    const monthStart =
      hasMonthFilter && year && normalizedMonth
        ? new Date(Date.UTC(Number(year), Number(normalizedMonth) - 1, 1))
        : null;
    const nextMonthStart =
      monthStart != null
        ? new Date(
            Date.UTC(
              monthStart.getUTCFullYear(),
              monthStart.getUTCMonth() + 1,
              1,
            ),
          )
        : null;

    const where: Prisma.CostExtendWhereInput = {
      ...(trimmedSearch
        ? {
            category: {
              contains: trimmedSearch,
              mode: 'insensitive' as const,
            },
          }
        : {}),
      ...(monthStart && nextMonthStart
        ? {
            date: {
              gte: monthStart,
              lt: nextMonthStart,
            },
          }
        : {}),
    };

    const total = await this.prisma.costExtend.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const skip = (safePage - 1) * limit;

    const data = await this.prisma.costExtend.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    return {
      data,
      meta: {
        total,
        page: safePage,
        limit,
      },
    };
  }

  async getCostById(id: string) {
    const cost = await this.prisma.costExtend.findUnique({
      where: { id },
    });

    if (!cost) {
      throw new NotFoundException('Cost not found');
    }

    return cost;
  }

  async createCost(data: CreateCostDto, auditActor?: ActionHistoryActor) {
    return this.prisma.$transaction(async (tx) => {
      const createdCost = await tx.costExtend.create({
        data: {
          month: data.month,
          category: data.category,
          amount: data.amount,
          date: parseCostDateInput(data.date),
          status: data.status,
        },
      });

      if (auditActor) {
        await this.actionHistoryService.recordCreate(tx, {
          actor: auditActor,
          entityType: 'cost',
          entityId: createdCost.id,
          description: 'Tạo khoản chi',
          afterValue: createdCost,
        });
      }

      return createdCost;
    });
  }

  async updateCost(data: UpdateCostDto, auditActor?: ActionHistoryActor) {
    if (!data.id) {
      throw new BadRequestException('Cost id is required');
    }

    const existingCost = await this.prisma.costExtend.findUnique({
      where: { id: data.id },
    });

    if (!existingCost) {
      throw new NotFoundException('Cost not found');
    }

    const updateData: Prisma.CostExtendUpdateInput = {};
    if (data.month !== undefined) updateData.month = data.month;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.amount !== undefined) updateData.amount = data.amount;
    if (data.date !== undefined) updateData.date = parseCostDateInput(data.date);
    if (data.status !== undefined) updateData.status = data.status;

    return this.prisma.$transaction(async (tx) => {
      const updatedCost = await tx.costExtend.update({
        where: { id: data.id },
        data: updateData,
      });

      if (auditActor) {
        await this.actionHistoryService.recordUpdate(tx, {
          actor: auditActor,
          entityType: 'cost',
          entityId: data.id,
          description: 'Cập nhật khoản chi',
          beforeValue: existingCost,
          afterValue: updatedCost,
        });
      }

      return updatedCost;
    });
  }

  async updateCostStatuses(
    costIds: string[],
    status: PaymentStatus,
    auditActor?: ActionHistoryActor,
  ): Promise<CostBulkStatusUpdateResult> {
    const uniqueCostIds = Array.from(new Set(costIds));

    return this.prisma.$transaction(async (tx) => {
      const existingCosts = await tx.costExtend.findMany({
        where: {
          id: {
            in: uniqueCostIds,
          },
        },
      });

      if (existingCosts.length !== uniqueCostIds.length) {
        const existingIds = new Set(existingCosts.map((cost) => cost.id));
        const missingCostId = uniqueCostIds.find(
          (costId) => !existingIds.has(costId),
        );

        throw new NotFoundException(
          missingCostId ? `Cost not found: ${missingCostId}` : 'Cost not found',
        );
      }

      const changedCostIds = existingCosts
        .filter((cost) => (cost.status ?? PaymentStatus.pending) !== status)
        .map((cost) => cost.id);

      if (changedCostIds.length === 0) {
        return {
          requestedCount: uniqueCostIds.length,
          updatedCount: 0,
        };
      }

      const beforeValueByCostId = new Map(
        existingCosts
          .filter((cost) => changedCostIds.includes(cost.id))
          .map((cost) => [cost.id, cost]),
      );

      await tx.costExtend.updateMany({
        where: {
          id: {
            in: changedCostIds,
          },
        },
        data: {
          status,
        },
      });

      if (auditActor) {
        const updatedCosts = await tx.costExtend.findMany({
          where: {
            id: {
              in: changedCostIds,
            },
          },
        });
        const afterValueByCostId = new Map(
          updatedCosts.map((cost) => [cost.id, cost]),
        );

        for (const costId of changedCostIds) {
          await this.actionHistoryService.recordUpdate(tx, {
            actor: auditActor,
            entityType: 'cost',
            entityId: costId,
            description: 'Cập nhật trạng thái thanh toán khoản chi',
            beforeValue: beforeValueByCostId.get(costId) ?? null,
            afterValue: afterValueByCostId.get(costId) ?? null,
          });
        }
      }

      return {
        requestedCount: uniqueCostIds.length,
        updatedCount: changedCostIds.length,
      };
    });
  }

  async deleteCost(id: string, auditActor?: ActionHistoryActor) {
    const existingCost = await this.prisma.costExtend.findUnique({
      where: { id },
    });

    if (!existingCost) {
      throw new NotFoundException('Cost not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const deletedCost = await tx.costExtend.delete({
        where: { id },
      });

      if (auditActor) {
        await this.actionHistoryService.recordDelete(tx, {
          actor: auditActor,
          entityType: 'cost',
          entityId: id,
          description: 'Xóa khoản chi',
          beforeValue: existingCost,
        });
      }

      return deletedCost;
    });
  }
}
