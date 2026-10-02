import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/client';
import { PaymentStatus, StaffRole, UserRole } from 'generated/enums';
import {
  ActionHistoryActor,
  ActionHistoryService,
} from '../action-history/action-history.service';
import {
  ExtraAllowanceBulkStatusUpdateResult,
  CreateExtraAllowanceDto,
  CreateMyStaffExtraAllowanceDto,
  UpdateExtraAllowanceDto,
  UpdateMyStaffExtraAllowanceDto,
} from '../dtos/extra-allowance.dto';
import { PaginationQueryDto } from '../dtos/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import {
  parseMonthKeyToEffectiveDate,
  resolveTaxDeductionRate,
} from '../payroll/deduction-rates';
import { getUserFullNameFromParts } from '../common/user-name.util';
import { assertStaffCanReceiveAssignment } from '../common/profile-status.policy';

@Injectable()
export class ExtraAllowanceService {
  private static readonly SELF_MANAGED_EXTRA_ALLOWANCE_ROLES =
    new Set<StaffRole>([
      StaffRole.communication,
      StaffRole.technical,
      StaffRole.training,
    ]);

  constructor(
    private readonly prisma: PrismaService,
    private readonly actionHistoryService: ActionHistoryService,
  ) {}

  private buildStaffDisplayName(
    staff: {
      user?: { first_name: string | null; last_name: string | null } | null;
    } | null,
  ) {
    return getUserFullNameFromParts(staff?.user) ?? '';
  }

  private withDerivedStaffFullName<
    T extends {
      staff: {
        id: string;
        roles: StaffRole[];
        status: string | null;
        user?: { first_name: string | null; last_name: string | null } | null;
      } | null;
    },
  >(record: T) {
    return {
      ...record,
      staff: record.staff
        ? {
            id: record.staff.id,
            fullName: this.buildStaffDisplayName(record.staff),
            roles: record.staff.roles,
            status: record.staff.status,
          }
        : null,
    };
  }

  private resolveTaxEffectiveDate(monthKey: string) {
    try {
      return parseMonthKeyToEffectiveDate(monthKey);
    } catch {
      throw new BadRequestException('month must be in YYYY-MM format');
    }
  }

  private async assertActiveStaffForAllowance(
    db: Prisma.TransactionClient | PrismaService,
    staffId: string,
  ) {
    const staff = await db.staffInfo.findUnique({
      where: { id: staffId },
      select: { id: true, status: true },
    });

    if (!staff) {
      throw new NotFoundException('Staff not found');
    }

    assertStaffCanReceiveAssignment(staff.status);
  }

  private getExtraAllowanceSnapshot(id: string) {
    return this.prisma.extraAllowance.findUnique({
      where: { id },
      include: {
        staff: {
          select: {
            id: true,
            user: {
              select: {
                first_name: true,
                last_name: true,
              },
            },
            roles: true,
            status: true,
          },
        },
      },
    });
  }

  async getExtraAllowances(
    query: PaginationQueryDto & {
      search?: string;
      year?: string;
      month?: string;
      roleType?: string;
      status?: string;
      staffId?: string;
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
    const trimmedStaffId = query.staffId?.trim();
    const normalizedRoleType = query.roleType?.trim();
    const normalizedStatus = query.status?.trim();
    const monthKey =
      year && month && /^\d{4}$/.test(year) && /^(0?[1-9]|1[0-2])$/.test(month)
        ? `${year}-${month.length === 1 ? `0${month}` : month}`
        : null;
    const roleTypeFilter: StaffRole | undefined = Object.values(
      StaffRole,
    ).includes(normalizedRoleType as StaffRole)
      ? (normalizedRoleType as StaffRole)
      : undefined;
    const statusFilter: PaymentStatus | undefined = Object.values(
      PaymentStatus,
    ).includes(normalizedStatus as PaymentStatus)
      ? (normalizedStatus as PaymentStatus)
      : undefined;

    const where: Prisma.ExtraAllowanceWhereInput = {
      ...(trimmedSearch
        ? {
            OR: [
              {
                note: {
                  contains: trimmedSearch,
                  mode: 'insensitive' as const,
                },
              },
              {
                staff: {
                  OR: [
                    {
                      user: {
                        first_name: {
                          contains: trimmedSearch,
                          mode: 'insensitive' as const,
                        },
                      },
                    },
                    {
                      user: {
                        last_name: {
                          contains: trimmedSearch,
                          mode: 'insensitive' as const,
                        },
                      },
                    },
                  ],
                },
              },
            ],
          }
        : {}),
      ...(monthKey ? { month: monthKey } : {}),
      ...(roleTypeFilter ? { roleType: roleTypeFilter } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(trimmedStaffId ? { staffId: trimmedStaffId } : {}),
    };

    const total = await this.prisma.extraAllowance.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const skip = (safePage - 1) * limit;

    const data = await this.prisma.extraAllowance.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ month: 'desc' }, { createdAt: 'desc' }],
      include: {
        staff: {
          select: {
            id: true,
            user: {
              select: {
                first_name: true,
                last_name: true,
              },
            },
            roles: true,
            status: true,
          },
        },
      },
    });

    return {
      data: data.map((item) => this.withDerivedStaffFullName(item)),
      meta: {
        total,
        page: safePage,
        limit,
      },
    };
  }

  async getExtraAllowanceById(id: string) {
    const allowance = await this.prisma.extraAllowance.findUnique({
      where: { id },
      include: {
        staff: {
          select: {
            id: true,
            user: {
              select: {
                first_name: true,
                last_name: true,
              },
            },
            roles: true,
            status: true,
          },
        },
      },
    });

    if (!allowance) {
      throw new NotFoundException('Extra allowance not found');
    }

    return this.withDerivedStaffFullName(allowance);
  }

  private getSelfManagedRoleLabel(roleType: StaffRole) {
    switch (roleType) {
      case StaffRole.communication:
        return 'Truyền thông';
      case StaffRole.technical:
        return 'Kỹ thuật';
      case StaffRole.training:
        return 'Đào Tạo';
      default:
        return roleType;
    }
  }

  private ensureSelfManagedRole(roleType: StaffRole) {
    if (
      !ExtraAllowanceService.SELF_MANAGED_EXTRA_ALLOWANCE_ROLES.has(roleType)
    ) {
      throw new ForbiddenException('Role này không được tự quản lý trợ cấp.');
    }
  }

  /**
   * Staff self-service: only supported linked staff roles may create their own
   * pending extra allowance.
   */
  async createMyStaffExtraAllowance(
    user: { id: string; email: string; roleType: UserRole },
    data: CreateMyStaffExtraAllowanceDto,
  ) {
    if (user.roleType !== UserRole.staff) {
      throw new ForbiddenException(
        'Chỉ tài khoản nhân sự mới được tự tạo trợ cấp này.',
      );
    }

    this.ensureSelfManagedRole(data.roleType);

    const staff = await this.prisma.staffInfo.findFirst({
      where: { userId: user.id },
      select: { id: true, roles: true },
    });

    if (!staff) {
      throw new BadRequestException('User has no linked staff record');
    }

    if (!staff.roles.includes(data.roleType)) {
      throw new ForbiddenException(
        `Chỉ nhân sự có role ${this.getSelfManagedRoleLabel(
          data.roleType,
        )} mới được tự thêm trợ cấp này.`,
      );
    }

    return this.createExtraAllowance(
      {
        staffId: staff.id,
        month: data.month,
        amount: data.amount ?? 0,
        status: PaymentStatus.pending,
        note: data.note,
        roleType: data.roleType,
      },
      {
        userId: user.id,
        userEmail: user.email,
        roleType: user.roleType,
      },
    );
  }

  async updateMyStaffExtraAllowance(
    user: { id: string; email: string; roleType: UserRole },
    data: UpdateMyStaffExtraAllowanceDto,
  ) {
    if (user.roleType !== UserRole.staff) {
      throw new ForbiddenException(
        'Chỉ tài khoản nhân sự mới được tự chỉnh trợ cấp này.',
      );
    }

    this.ensureSelfManagedRole(data.roleType);

    const staff = await this.prisma.staffInfo.findFirst({
      where: { userId: user.id },
      select: { id: true, roles: true },
    });

    if (!staff) {
      throw new BadRequestException('User has no linked staff record');
    }

    if (!staff.roles.includes(data.roleType)) {
      throw new ForbiddenException(
        `Chỉ nhân sự có role ${this.getSelfManagedRoleLabel(
          data.roleType,
        )} mới được tự chỉnh trợ cấp này.`,
      );
    }

    const existingAllowance = await this.getExtraAllowanceSnapshot(data.id);

    if (
      !existingAllowance ||
      existingAllowance.staffId !== staff.id ||
      existingAllowance.roleType !== data.roleType
    ) {
      throw new NotFoundException('Extra allowance not found');
    }

    return this.updateExtraAllowance(
      {
        id: data.id,
        month: data.month,
        amount: data.amount,
        note: data.note,
      },
      {
        userId: user.id,
        userEmail: user.email,
        roleType: user.roleType,
      },
    );
  }

  async createExtraAllowance(
    data: CreateExtraAllowanceDto,
    auditActor?: ActionHistoryActor,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertActiveStaffForAllowance(tx, data.staffId);
      const taxDeductionRatePercent = await resolveTaxDeductionRate(tx, {
        staffId: data.staffId,
        roleType: data.roleType,
        effectiveDate: this.resolveTaxEffectiveDate(data.month),
      });
      const createdAllowance = await tx.extraAllowance.create({
        data: {
          staffId: data.staffId,
          month: data.month,
          amount: data.amount ?? 0,
          status: data.status,
          note: data.note,
          roleType: data.roleType,
          taxDeductionRatePercent,
        },
      });

      if (auditActor) {
        const afterValue = await tx.extraAllowance.findUnique({
          where: { id: createdAllowance.id },
          include: {
            staff: {
              select: {
                id: true,
                user: {
                  select: {
                    first_name: true,
                    last_name: true,
                  },
                },
                roles: true,
                status: true,
              },
            },
          },
        });
        await this.actionHistoryService.recordCreate(tx, {
          actor: auditActor,
          entityType: 'extra_allowance',
          entityId: createdAllowance.id,
          description: 'Tạo trợ cấp thêm',
          afterValue,
        });
      }

      return createdAllowance;
    });
  }

  async updateExtraAllowance(
    data: UpdateExtraAllowanceDto,
    auditActor?: ActionHistoryActor,
  ) {
    if (!data.id) {
      throw new NotFoundException('Extra allowance not found');
    }

    const existingAllowance = await this.getExtraAllowanceSnapshot(data.id);

    if (!existingAllowance) {
      throw new NotFoundException('Extra allowance not found');
    }

    const updateData: Omit<UpdateExtraAllowanceDto, 'id'> = {};

    if (data.staffId !== undefined) updateData.staffId = data.staffId;
    if (data.month !== undefined) updateData.month = data.month;
    if (data.amount !== undefined) updateData.amount = data.amount;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.note !== undefined) updateData.note = data.note;
    if (data.roleType !== undefined) updateData.roleType = data.roleType;

    return this.prisma.$transaction(async (tx) => {
      const nextStaffId = data.staffId ?? existingAllowance.staffId;
      const nextRoleType = data.roleType ?? existingAllowance.roleType;
      const nextMonth = data.month ?? existingAllowance.month;
      await this.assertActiveStaffForAllowance(tx, nextStaffId);
      const updatedAllowance = await tx.extraAllowance.update({
        where: { id: data.id },
        data: {
          ...updateData,
          taxDeductionRatePercent: await resolveTaxDeductionRate(tx, {
            staffId: nextStaffId,
            roleType: nextRoleType,
            effectiveDate: this.resolveTaxEffectiveDate(nextMonth),
          }),
        },
      });

      if (auditActor) {
        const afterValue = await tx.extraAllowance.findUnique({
          where: { id: data.id },
          include: {
            staff: {
              select: {
                id: true,
                user: {
                  select: {
                    first_name: true,
                    last_name: true,
                  },
                },
                roles: true,
                status: true,
              },
            },
          },
        });
        await this.actionHistoryService.recordUpdate(tx, {
          actor: auditActor,
          entityType: 'extra_allowance',
          entityId: data.id,
          description: 'Cập nhật trợ cấp thêm',
          beforeValue: existingAllowance,
          afterValue,
        });
      }

      return updatedAllowance;
    });
  }

  async updateExtraAllowanceStatuses(
    allowanceIds: string[],
    status: PaymentStatus,
    auditActor?: ActionHistoryActor,
  ): Promise<ExtraAllowanceBulkStatusUpdateResult> {
    const uniqueAllowanceIds = Array.from(new Set(allowanceIds));

    return this.prisma.$transaction(async (tx) => {
      const existingAllowances = await tx.extraAllowance.findMany({
        where: {
          id: {
            in: uniqueAllowanceIds,
          },
        },
        include: {
          staff: {
            select: {
              id: true,
              user: {
                select: {
                  first_name: true,
                  last_name: true,
                },
              },
              roles: true,
              status: true,
            },
          },
        },
      });

      if (existingAllowances.length !== uniqueAllowanceIds.length) {
        const existingIds = new Set(existingAllowances.map((item) => item.id));
        const missingAllowanceId = uniqueAllowanceIds.find(
          (allowanceId) => !existingIds.has(allowanceId),
        );

        throw new NotFoundException(
          missingAllowanceId
            ? `Extra allowance not found: ${missingAllowanceId}`
            : 'Extra allowance not found',
        );
      }

      const changedAllowanceIds = existingAllowances
        .filter(
          (allowance) => (allowance.status ?? PaymentStatus.pending) !== status,
        )
        .map((allowance) => allowance.id);

      if (changedAllowanceIds.length === 0) {
        return {
          requestedCount: uniqueAllowanceIds.length,
          updatedCount: 0,
        };
      }

      // Set: tra cứu O(1) thay vì Array.includes quét lại cả mảng mỗi phần tử.
      const changedAllowanceIdSet = new Set(changedAllowanceIds);
      const beforeValueByAllowanceId = new Map(
        existingAllowances
          .filter((allowance) => changedAllowanceIdSet.has(allowance.id))
          .map((allowance) => [allowance.id, allowance]),
      );

      await tx.extraAllowance.updateMany({
        where: {
          id: {
            in: changedAllowanceIds,
          },
        },
        data: {
          status,
        },
      });

      if (auditActor) {
        const updatedAllowances = await tx.extraAllowance.findMany({
          where: {
            id: {
              in: changedAllowanceIds,
            },
          },
          include: {
            staff: {
              select: {
                id: true,
                user: {
                  select: {
                    first_name: true,
                    last_name: true,
                  },
                },
                roles: true,
                status: true,
              },
            },
          },
        });
        const afterValueByAllowanceId = new Map(
          updatedAllowances.map((allowance) => [allowance.id, allowance]),
        );

        for (const allowanceId of changedAllowanceIds) {
          await this.actionHistoryService.recordUpdate(tx, {
            actor: auditActor,
            entityType: 'extra_allowance',
            entityId: allowanceId,
            description: 'Cập nhật trạng thái thanh toán trợ cấp thêm',
            beforeValue: beforeValueByAllowanceId.get(allowanceId) ?? null,
            afterValue: afterValueByAllowanceId.get(allowanceId) ?? null,
          });
        }
      }

      return {
        requestedCount: uniqueAllowanceIds.length,
        updatedCount: changedAllowanceIds.length,
      };
    });
  }

  async deleteExtraAllowance(id: string, auditActor?: ActionHistoryActor) {
    const existingAllowance = await this.getExtraAllowanceSnapshot(id);

    if (!existingAllowance) {
      throw new NotFoundException('Extra allowance not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const deletedAllowance = await tx.extraAllowance.delete({
        where: { id },
      });

      if (auditActor) {
        await this.actionHistoryService.recordDelete(tx, {
          actor: auditActor,
          entityType: 'extra_allowance',
          entityId: id,
          description: 'Xóa trợ cấp thêm',
          beforeValue: existingAllowance,
        });
      }

      return deletedAllowance;
    });
  }
}
