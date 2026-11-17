import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ActionHistoryActor,
  ActionHistoryService,
} from '../action-history/action-history.service';
import { PrismaService } from '../prisma/prisma.service';
import { assertActorNotEditingOwnCompensation } from 'src/common/staff-role-policy';

/**
 * Bonus trả kèm staff tối thiểu — không lộ CCCD/ngân hàng/thông tin cá nhân
 * cho người chỉ có quyền xem thưởng (#270).
 */
const BONUS_STAFF_SELECT = {
  id: true,
  status: true,
  roles: true,
  userId: true,
} as const;
import { PaginationQueryDto } from '../dtos/pagination.dto';
import { CreateBonusDto, UpdateBonusDto } from '../dtos/bonus.dto';

@Injectable()
export class BonusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actionHistoryService: ActionHistoryService,
  ) {}

  private getBonusSnapshot(id: string) {
    return this.prisma.bonus.findUnique({
      where: { id },
      include: { staff: { select: BONUS_STAFF_SELECT } },
    });
  }

  async getBonuses(
    query: PaginationQueryDto & {
      staffId?: string;
      month?: string;
      status?: string;
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

    const where: any = {};

    if (query.staffId) {
      where.staffId = query.staffId;
    }

    if (query.month) {
      where.month = query.month;
    }

    if (query.status) {
      where.status = query.status;
    }

    const total = await this.prisma.bonus.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const skip = (safePage - 1) * limit;

    const data = await this.prisma.bonus.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        staff: { select: BONUS_STAFF_SELECT },
      },
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

  async getBonusById(id: string) {
    const bonus = await this.prisma.bonus.findUnique({
      where: { id },
      include: { staff: { select: BONUS_STAFF_SELECT } },
    });

    if (!bonus) {
      throw new NotFoundException('Bonus not found');
    }

    return bonus;
  }

  async getBonusOwnershipById(id: string) {
    const bonus = await this.prisma.bonus.findUnique({
      where: { id },
      select: {
        id: true,
        staffId: true,
      },
    });

    if (!bonus) {
      throw new NotFoundException('Bonus not found');
    }

    return bonus;
  }

  /**
   * `allowSelf`: chỉ route tự khai thưởng (`/users/me/staff-bonuses`, ép trạng
   * thái chờ thanh toán) được bỏ qua luật «không tự sửa lương của mình» (#265).
   */
  async createBonus(
    data: CreateBonusDto,
    auditActor?: ActionHistoryActor,
    options?: { allowSelf?: boolean },
  ) {
    if (!options?.allowSelf) {
      await assertActorNotEditingOwnCompensation(this.prisma, auditActor, [
        data.staffId,
      ]);
    }
    return this.prisma.$transaction(async (tx) => {
      const createdBonus = await tx.bonus.create({
        data: {
          staffId: data.staffId,
          workType: data.workType,
          month: data.month,
          amount: data.amount ?? 0,
          status: data.status,
          note: data.note,
        },
      });

      if (auditActor) {
        const afterValue = await tx.bonus.findUnique({
          where: { id: createdBonus.id },
          include: { staff: { select: BONUS_STAFF_SELECT } },
        });
        await this.actionHistoryService.recordCreate(tx, {
          actor: auditActor,
          entityType: 'bonus',
          entityId: createdBonus.id,
          description: 'Tạo khoản thưởng',
          afterValue,
        });
      }

      return createdBonus;
    });
  }

  async updateBonus(
    data: UpdateBonusDto,
    auditActor?: ActionHistoryActor,
    options?: { allowSelf?: boolean },
  ) {
    if (!data.id) {
      throw new NotFoundException('Bonus not found');
    }

    const existingBonus = await this.getBonusSnapshot(data.id);

    if (!existingBonus) {
      throw new NotFoundException('Bonus not found');
    }
    if (!options?.allowSelf) {
      await assertActorNotEditingOwnCompensation(this.prisma, auditActor, [
        existingBonus.staffId,
        data.staffId,
      ]);
    }

    const updateData: Omit<UpdateBonusDto, 'id'> = {};

    if (data.staffId !== undefined) updateData.staffId = data.staffId;
    if (data.workType !== undefined) updateData.workType = data.workType;
    if (data.month !== undefined) updateData.month = data.month;
    if (data.amount !== undefined) updateData.amount = data.amount;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.note !== undefined) updateData.note = data.note;

    return this.prisma.$transaction(async (tx) => {
      const updatedBonus = await tx.bonus.update({
        where: { id: data.id },
        data: updateData,
      });

      if (auditActor) {
        const afterValue = await tx.bonus.findUnique({
          where: { id: data.id },
          include: { staff: { select: BONUS_STAFF_SELECT } },
        });
        await this.actionHistoryService.recordUpdate(tx, {
          actor: auditActor,
          entityType: 'bonus',
          entityId: data.id,
          description: 'Cập nhật khoản thưởng',
          beforeValue: existingBonus,
          afterValue,
        });
      }

      return updatedBonus;
    });
  }

  async deleteBonus(
    id: string,
    auditActor?: ActionHistoryActor,
    options?: { allowSelf?: boolean },
  ) {
    const existingBonus = await this.getBonusSnapshot(id);

    if (!existingBonus) {
      throw new NotFoundException('Bonus not found');
    }
    if (!options?.allowSelf) {
      await assertActorNotEditingOwnCompensation(this.prisma, auditActor, [
        existingBonus.staffId,
      ]);
    }

    return this.prisma.$transaction(async (tx) => {
      const deletedBonus = await tx.bonus.delete({
        where: { id },
      });

      if (auditActor) {
        await this.actionHistoryService.recordDelete(tx, {
          actor: auditActor,
          entityType: 'bonus',
          entityId: id,
          description: 'Xóa khoản thưởng',
          beforeValue: existingBonus,
        });
      }

      return deletedBonus;
    });
  }
}
