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
  SaleStudentOptionDto,
  SELF_MANAGED_EXTRA_ALLOWANCE_ROLES,
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

const EXTRA_ALLOWANCE_INCLUDE = {
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
  student: {
    select: {
      id: true,
      fullName: true,
    },
  },
} satisfies Prisma.ExtraAllowanceInclude;

const SALE_STUDENT_OPTION_LIMIT = 20;

type SelfServiceUser = { id: string; email: string; roleType: UserRole };

@Injectable()
export class ExtraAllowanceService {
  private static readonly SELF_MANAGED_EXTRA_ALLOWANCE_ROLES =
    new Set<StaffRole>(SELF_MANAGED_EXTRA_ALLOWANCE_ROLES);

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

  /**
   * Trợ cấp sale: bắt buộc học sinh + ghi chú, dù ai tạo. Role khác không gắn
   * học sinh. Chỉ kiểm lúc ghi — dòng sale có `student_id` null vì học sinh
   * đã bị xoá vẫn hợp lệ (ADR 2026-10-23).
   */
  private async resolveAllowanceStudentId(
    db: Prisma.TransactionClient | PrismaService,
    params: {
      roleType: StaffRole;
      studentId: string | null | undefined;
      note: string | null | undefined;
    },
  ): Promise<string | null> {
    if (params.roleType !== StaffRole.sale) {
      if (params.studentId) {
        throw new BadRequestException(
          'Chỉ trợ cấp sale mới được gắn học sinh.',
        );
      }
      return null;
    }

    if (!params.studentId) {
      throw new BadRequestException('Trợ cấp sale phải chọn học sinh.');
    }

    if (!params.note?.trim()) {
      throw new BadRequestException('Trợ cấp sale phải có ghi chú.');
    }

    const student = await db.studentInfo.findUnique({
      where: { id: params.studentId },
      select: { id: true },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    return student.id;
  }

  private getExtraAllowanceSnapshot(id: string) {
    return this.prisma.extraAllowance.findUnique({
      where: { id },
      include: EXTRA_ALLOWANCE_INCLUDE,
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
                student: {
                  fullName: {
                    contains: trimmedSearch,
                    mode: 'insensitive' as const,
                  },
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
      include: EXTRA_ALLOWANCE_INCLUDE,
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
      include: EXTRA_ALLOWANCE_INCLUDE,
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
      case StaffRole.sale:
        return 'Sale';
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

  /** Hồ sơ nhân sự của user đang đăng nhập, có role tự quản `roleType`. */
  private async getSelfManagedStaff(
    user: SelfServiceUser,
    roleType: StaffRole,
    action: string,
  ) {
    if (user.roleType !== UserRole.staff) {
      throw new ForbiddenException(
        `Chỉ tài khoản nhân sự mới được tự ${action} trợ cấp này.`,
      );
    }

    this.ensureSelfManagedRole(roleType);

    const staff = await this.prisma.staffInfo.findFirst({
      where: { userId: user.id },
      select: { id: true, roles: true },
    });

    if (!staff) {
      throw new BadRequestException('User has no linked staff record');
    }

    if (!staff.roles.includes(roleType)) {
      throw new ForbiddenException(
        `Chỉ nhân sự có role ${this.getSelfManagedRoleLabel(
          roleType,
        )} mới được tự ${action} trợ cấp này.`,
      );
    }

    return staff;
  }

  /**
   * Khoản trợ cấp tự quản của chính nhân sự, còn sửa/xoá được: khoản đã
   * thanh toán là chứng từ nên khoá.
   */
  private async getOwnUnpaidSelfManagedAllowance(
    staffId: string,
    allowanceId: string,
    roleType?: StaffRole,
  ) {
    const existingAllowance = await this.getExtraAllowanceSnapshot(allowanceId);

    if (
      !existingAllowance ||
      existingAllowance.staffId !== staffId ||
      !ExtraAllowanceService.SELF_MANAGED_EXTRA_ALLOWANCE_ROLES.has(
        existingAllowance.roleType,
      ) ||
      (roleType !== undefined && existingAllowance.roleType !== roleType)
    ) {
      throw new NotFoundException('Extra allowance not found');
    }

    if (existingAllowance.status === PaymentStatus.paid) {
      throw new ForbiddenException(
        'Khoản trợ cấp đã thanh toán, không sửa hoặc xoá được.',
      );
    }

    return existingAllowance;
  }

  /**
   * Staff self-service: only supported linked staff roles may create their own
   * pending extra allowance.
   */
  async createMyStaffExtraAllowance(
    user: SelfServiceUser,
    data: CreateMyStaffExtraAllowanceDto,
  ) {
    const staff = await this.getSelfManagedStaff(user, data.roleType, 'thêm');

    return this.createExtraAllowance(
      {
        staffId: staff.id,
        month: data.month,
        amount: data.amount ?? 0,
        status: PaymentStatus.pending,
        note: data.note,
        roleType: data.roleType,
        studentId: data.studentId,
      },
      {
        userId: user.id,
        userEmail: user.email,
        roleType: user.roleType,
      },
    );
  }

  async updateMyStaffExtraAllowance(
    user: SelfServiceUser,
    data: UpdateMyStaffExtraAllowanceDto,
  ) {
    const staff = await this.getSelfManagedStaff(user, data.roleType, 'chỉnh');
    await this.getOwnUnpaidSelfManagedAllowance(
      staff.id,
      data.id,
      data.roleType,
    );

    return this.updateExtraAllowance(
      {
        id: data.id,
        month: data.month,
        amount: data.amount,
        note: data.note,
        studentId: data.studentId,
      },
      {
        userId: user.id,
        userEmail: user.email,
        roleType: user.roleType,
      },
    );
  }

  async deleteMyStaffExtraAllowance(user: SelfServiceUser, id: string) {
    const existingAllowance = await this.prisma.extraAllowance.findUnique({
      where: { id },
      select: { roleType: true },
    });

    if (!existingAllowance) {
      throw new NotFoundException('Extra allowance not found');
    }

    const staff = await this.getSelfManagedStaff(
      user,
      existingAllowance.roleType,
      'xoá',
    );
    await this.getOwnUnpaidSelfManagedAllowance(staff.id, id);

    return this.deleteExtraAllowance(id, {
      userId: user.id,
      userEmail: user.email,
      roleType: user.roleType,
    });
  }

  /**
   * Picker học sinh cho Trợ cấp sale: mọi học sinh (kể cả nghỉ học), chỉ trả
   * trường đủ để nhận diện — không trả liên hệ, ví hay lớp.
   */
  async searchSaleStudentOptions(
    search?: string,
  ): Promise<SaleStudentOptionDto[]> {
    const trimmedSearch = search?.trim();

    return this.prisma.studentInfo.findMany({
      where: trimmedSearch
        ? {
            fullName: {
              contains: trimmedSearch,
              mode: 'insensitive' as const,
            },
          }
        : {},
      select: {
        id: true,
        fullName: true,
        birthYear: true,
        school: true,
        status: true,
      },
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      take: SALE_STUDENT_OPTION_LIMIT,
    });
  }

  /** Sale picker cho nhân sự đang đăng nhập — chỉ hồ sơ có role `sale`. */
  async searchMySaleStudentOptions(user: SelfServiceUser, search?: string) {
    await this.getSelfManagedStaff(user, StaffRole.sale, 'chọn học sinh cho');
    return this.searchSaleStudentOptions(search);
  }

  async createExtraAllowance(
    data: CreateExtraAllowanceDto,
    auditActor?: ActionHistoryActor,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertActiveStaffForAllowance(tx, data.staffId);
      const studentId = await this.resolveAllowanceStudentId(tx, {
        roleType: data.roleType,
        studentId: data.studentId,
        note: data.note,
      });
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
          studentId,
          taxDeductionRatePercent,
        },
      });

      if (auditActor) {
        const afterValue = await tx.extraAllowance.findUnique({
          where: { id: createdAllowance.id },
          include: EXTRA_ALLOWANCE_INCLUDE,
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

    const updateData: Omit<UpdateExtraAllowanceDto, 'id' | 'studentId'> = {};

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
      // Không gửi studentId = giữ học sinh cũ nếu vẫn là sale; đổi sang role khác thì gỡ.
      const nextStudentId = await this.resolveAllowanceStudentId(tx, {
        roleType: nextRoleType,
        studentId:
          data.studentId !== undefined
            ? data.studentId
            : nextRoleType === StaffRole.sale
              ? existingAllowance.studentId
              : undefined,
        note: data.note !== undefined ? data.note : existingAllowance.note,
      });
      const updatedAllowance = await tx.extraAllowance.update({
        where: { id: data.id },
        data: {
          ...updateData,
          studentId: nextStudentId,
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
          include: EXTRA_ALLOWANCE_INCLUDE,
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
        include: EXTRA_ALLOWANCE_INCLUDE,
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
          include: EXTRA_ALLOWANCE_INCLUDE,
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
