import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'generated/client';
import {
  AttendanceStatus,
  PaymentStatus,
  StaffRole,
  StaffStatus,
  UserRole,
} from 'generated/enums';
import type {
  TrainingManagerBulkPaymentStatusUpdateResultDto,
  TrainingManagerManagedClassListDto,
  TrainingManagerSessionAllowanceDto,
  TrainingManagerStaffOptionDto,
  UpdateClassTrainingManagerDto,
} from 'src/dtos/training-manager.dto';
import { resolveTaxDeductionRate } from 'src/payroll/deduction-rates';
import { PrismaService } from 'src/prisma/prisma.service';
import { normalizeTrainingManagerRatePercent } from './training-manager.utils';

function parseMonthRange(monthKey: string): {
  start: Date;
  endExclusive: Date;
} {
  const matched = /^(\d{4})-(\d{2})$/.exec(monthKey.trim());
  if (!matched) {
    throw new BadRequestException('month must use YYYY-MM format.');
  }

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    throw new BadRequestException('month must use YYYY-MM format.');
  }

  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    endExclusive: new Date(Date.UTC(year, month, 1)),
  };
}

function toNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

@Injectable()
export class TrainingManagerService {
  constructor(private readonly prisma: PrismaService) {}

  async searchTrainingManagerOptions(query: {
    search?: string;
    limit?: number;
  }): Promise<TrainingManagerStaffOptionDto[]> {
    const limit =
      Number.isInteger(query.limit) && (query.limit as number) >= 1
        ? Math.min(query.limit as number, 50)
        : 20;
    const search = query.search?.trim();

    const rows = await this.prisma.staffInfo.findMany({
      where: {
        roles: { has: StaffRole.training },
        status: StaffStatus.active,
        ...(search
          ? {
              user: {
                is: {
                  OR: [
                    {
                      first_name: {
                        contains: search,
                        mode: 'insensitive',
                      },
                    },
                    {
                      last_name: {
                        contains: search,
                        mode: 'insensitive',
                      },
                    },
                  ],
                },
              },
            }
          : {}),
      },
      select: {
        id: true,
        status: true,
        roles: true,
        user: {
          select: {
            first_name: true,
            last_name: true,
          },
        },
      },
      orderBy: [
        { user: { first_name: 'asc' } },
        { user: { last_name: 'asc' } },
      ],
      take: limit,
    });

    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      roles: row.roles,
      fullName:
        [row.user?.first_name, row.user?.last_name]
          .filter(Boolean)
          .join(' ')
          .trim() || '—',
    }));
  }

  async updateClassTrainingManager(
    classId: string,
    dto: UpdateClassTrainingManagerDto,
    actor: { userId: string; roleType: UserRole },
  ) {
    if (actor.roleType !== UserRole.admin) {
      const staff = await this.prisma.staffInfo.findFirst({
        where: { userId: actor.userId },
        select: { roles: true },
      });
      if (!staff?.roles.includes(StaffRole.assistant)) {
        throw new ForbiddenException(
          'Chỉ admin hoặc trợ lí được chỉnh quản lý lớp.',
        );
      }
    }

    const existing = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Class not found');
    }

    const nextStaffId =
      dto.trainingManagerStaffId === undefined
        ? undefined
        : dto.trainingManagerStaffId?.trim() || null;
    const nextRate =
      dto.trainingManagerRatePercent === undefined
        ? undefined
        : normalizeTrainingManagerRatePercent(dto.trainingManagerRatePercent);

    if (nextStaffId) {
      const manager = await this.prisma.staffInfo.findUnique({
        where: { id: nextStaffId },
        select: { id: true, roles: true, status: true },
      });
      if (!manager) {
        throw new NotFoundException('Training manager staff not found');
      }
      if (
        manager.status !== StaffStatus.active ||
        !manager.roles.includes(StaffRole.training)
      ) {
        throw new BadRequestException(
          'Quản lý lớp phải là nhân sự Đào Tạo đang hoạt động.',
        );
      }
    }

    if (nextRate != null && (nextRate < 0 || nextRate > 100)) {
      throw new BadRequestException(
        'trainingManagerRatePercent must be between 0 and 100.',
      );
    }

    return this.prisma.class.update({
      where: { id: classId },
      data: {
        ...(nextStaffId !== undefined
          ? { trainingManagerStaffId: nextStaffId }
          : {}),
        ...(nextRate !== undefined
          ? { trainingManagerRatePercent: nextRate }
          : {}),
      },
      select: {
        id: true,
        trainingManagerStaffId: true,
        trainingManagerRatePercent: true,
        trainingManager: {
          select: {
            id: true,
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
  }

  private async resolveAccessibleStaffId(
    userId: string,
    roleType: UserRole,
    staffId: string,
  ): Promise<string> {
    if (roleType === UserRole.admin) {
      return staffId;
    }

    const actor = await this.prisma.staffInfo.findFirst({
      where: { userId },
      select: { id: true, roles: true },
    });
    if (!actor) {
      throw new ForbiddenException('Staff profile required');
    }

    if (actor.id === staffId) {
      return staffId;
    }

    const canViewOthers =
      actor.roles.includes(StaffRole.assistant) ||
      actor.roles.includes(StaffRole.accountant_income) ||
      actor.roles.includes(StaffRole.accountant_expense) ||
      actor.roles.includes(StaffRole.accountant);

    if (!canViewOthers) {
      throw new ForbiddenException('Không có quyền xem hồ sơ nhân sự này.');
    }

    return staffId;
  }

  async getManagedClassesByStaffId(
    userId: string,
    roleType: UserRole,
    staffId: string,
    monthKey: string,
  ): Promise<TrainingManagerManagedClassListDto> {
    const accessibleStaffId = await this.resolveAccessibleStaffId(
      userId,
      roleType,
      staffId,
    );
    const staff = await this.prisma.staffInfo.findUnique({
      where: { id: accessibleStaffId },
      select: { id: true },
    });
    if (!staff) {
      throw new NotFoundException('Staff not found');
    }

    const { start, endExclusive } = parseMonthRange(monthKey);
    const rows = await this.prisma.$queryRaw<
      Array<{
        classId: string;
        className: string | null;
        monthTotal: unknown;
        pendingTotal: unknown;
      }>
    >(Prisma.sql`
      SELECT
        classes.id AS "classId",
        COALESCE(classes.name, '') AS "className",
        COALESCE(
          SUM(
            CASE
              WHEN sessions.date >= ${start}
                AND sessions.date < ${endExclusive}
              THEN COALESCE(sessions.training_manager_allowance_amount, 0)
              ELSE 0
            END
          ),
          0
        ) AS "monthTotal",
        COALESCE(
          SUM(
            CASE
              WHEN COALESCE(sessions.training_manager_payment_status::text, ${PaymentStatus.pending}) = ${PaymentStatus.pending}
              THEN COALESCE(sessions.training_manager_allowance_amount, 0)
              ELSE 0
            END
          ),
          0
        ) AS "pendingTotal"
      FROM classes
      LEFT JOIN sessions
        ON sessions.class_id = classes.id
        AND sessions.training_manager_staff_id = ${accessibleStaffId}
      WHERE classes.training_manager_staff_id = ${accessibleStaffId}
      GROUP BY classes.id, classes.name
      ORDER BY classes.name ASC
    `);

    const data = rows.map((row) => ({
      classId: row.classId,
      className: row.className?.trim() || 'Lớp chưa đặt tên',
      monthTotal: toNumber(row.monthTotal),
      pendingTotal: toNumber(row.pendingTotal),
    }));

    const summary = data.reduce(
      (acc, row) => ({
        classCount: acc.classCount + 1,
        totalMonth: acc.totalMonth + row.monthTotal,
        totalPending: acc.totalPending + row.pendingTotal,
      }),
      { classCount: 0, totalMonth: 0, totalPending: 0 },
    );

    return { data, summary };
  }

  async getSessionAllowancesByClass(
    userId: string,
    roleType: UserRole,
    staffId: string,
    classId: string,
    monthKey: string,
  ): Promise<TrainingManagerSessionAllowanceDto[]> {
    const accessibleStaffId = await this.resolveAccessibleStaffId(
      userId,
      roleType,
      staffId,
    );

    const classRecord = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, trainingManagerStaffId: true },
    });
    if (!classRecord) {
      throw new NotFoundException('Class not found');
    }
    if (classRecord.trainingManagerStaffId !== accessibleStaffId) {
      throw new ForbiddenException(
        'Lớp học không thuộc phạm vi quản lý của nhân sự này.',
      );
    }

    const { start, endExclusive } = parseMonthRange(monthKey);
    const sessions = await this.prisma.session.findMany({
      where: {
        classId,
        trainingManagerStaffId: accessibleStaffId,
        date: {
          gte: start,
          lt: endExclusive,
        },
        OR: [
          { trainingManagerAllowanceAmount: { gt: 0 } },
          { trainingManagerRatePercent: { gt: 0 } },
        ],
      },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        date: true,
        trainingManagerRatePercent: true,
        trainingManagerAllowanceAmount: true,
        trainingManagerPaymentStatus: true,
        attendance: {
          where: {
            status: {
              in: [AttendanceStatus.present, AttendanceStatus.excused],
            },
          },
          select: { tuitionFee: true },
        },
      },
    });

    return sessions.map((session) => {
      const sessionTuitionTotal = session.attendance.reduce(
        (sum, row) => sum + (row.tuitionFee ?? 0),
        0,
      );
      const ratePercent = toNumber(session.trainingManagerRatePercent);
      const allowanceAmount = session.trainingManagerAllowanceAmount ?? 0;

      return {
        sessionId: session.id,
        date: session.date.toISOString(),
        sessionTuitionTotal,
        trainingManagerRatePercent: ratePercent,
        allowanceAmount,
        paymentStatus:
          session.trainingManagerPaymentStatus ?? PaymentStatus.pending,
      };
    });
  }

  async bulkUpdatePaymentStatus(
    userId: string,
    roleType: UserRole,
    staffId: string,
    sessionIds: string[],
    paymentStatus: PaymentStatus,
  ): Promise<TrainingManagerBulkPaymentStatusUpdateResultDto> {
    if (
      paymentStatus !== PaymentStatus.pending &&
      paymentStatus !== PaymentStatus.paid
    ) {
      throw new BadRequestException('paymentStatus must be pending or paid.');
    }

    const accessibleStaffId = await this.resolveAccessibleStaffId(
      userId,
      roleType,
      staffId,
    );

    if (roleType === UserRole.staff) {
      const actor = await this.prisma.staffInfo.findFirst({
        where: { userId },
        select: { roles: true },
      });
      const canEdit =
        actor?.roles.includes(StaffRole.assistant) ||
        actor?.roles.includes(StaffRole.accountant_income) ||
        actor?.roles.includes(StaffRole.accountant_expense) ||
        actor?.roles.includes(StaffRole.accountant);
      if (!canEdit) {
        throw new ForbiddenException(
          'Không có quyền cập nhật trạng thái thanh toán quản lý lớp.',
        );
      }
    }

    const uniqueSessionIds = Array.from(new Set(sessionIds.filter(Boolean)));
    if (uniqueSessionIds.length === 0) {
      return {
        staffId: accessibleStaffId,
        requestedCount: 0,
        updatedCount: 0,
      };
    }

    const sessions = await this.prisma.session.findMany({
      where: {
        id: { in: uniqueSessionIds },
        trainingManagerStaffId: accessibleStaffId,
      },
      select: {
        id: true,
        trainingManagerPaymentStatus: true,
      },
    });

    if (sessions.length !== uniqueSessionIds.length) {
      throw new BadRequestException(
        'Một hoặc nhiều buổi học không thuộc quản lý lớp này.',
      );
    }

    const taxRatePercent =
      paymentStatus === PaymentStatus.paid
        ? await resolveTaxDeductionRate(this.prisma, {
            staffId: accessibleStaffId,
            roleType: StaffRole.training,
            effectiveDate: new Date(),
          })
        : 0;

    const updateResult = await this.prisma.session.updateMany({
      where: {
        id: { in: uniqueSessionIds },
        trainingManagerStaffId: accessibleStaffId,
        trainingManagerPaymentStatus: {
          not: paymentStatus,
        },
      },
      data: {
        trainingManagerPaymentStatus: paymentStatus,
        trainingManagerTaxDeductionRatePercent: taxRatePercent,
      },
    });

    return {
      staffId: accessibleStaffId,
      requestedCount: uniqueSessionIds.length,
      updatedCount: updateResult.count,
    };
  }
}
