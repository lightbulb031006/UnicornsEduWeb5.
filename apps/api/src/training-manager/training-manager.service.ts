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
import {
  ActionHistoryActor,
  ActionHistoryService,
} from 'src/action-history/action-history.service';
import {
  TRAINING_ACCESS_ROLES,
  resolveTrainingManagerIncomeRole,
} from 'src/common/training-access';
import { resolveTaxDeductionRate } from 'src/payroll/deduction-rates';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  computeTrainingManagerSessionSnapshot,
  normalizeTrainingManagerRatePercent,
} from './training-manager.utils';
import {
  assertActorNotEditingOwnCompensation,
  resolveStaffPolicyActor,
} from 'src/common/staff-role-policy';
import { computeStaffSensitiveView } from 'src/common/staff-sensitive-view';
import {
  assertCanEditClassManagerAllowanceRate,
  assertClassTrainingManagerUpdateAllowed,
  canAssignClassManager,
  canEditClassManagerAllowanceRate,
} from './class-manager-allowance-policy';
import {
  grantTrainingRoleForManager,
  resolveTrainingManagerAssignment,
} from './training-manager-assignment';

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

function toTrainingManagerAuditSnapshot(row: {
  trainingManagerStaffId: string | null;
  trainingManagerRatePercent: unknown;
}) {
  return {
    trainingManagerStaffId: row.trainingManagerStaffId,
    trainingManagerRatePercent:
      row.trainingManagerRatePercent == null
        ? null
        : toNumber(row.trainingManagerRatePercent),
  };
}

@Injectable()
export class TrainingManagerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actionHistoryService: ActionHistoryService,
  ) {}

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
        roles: { hasSome: [...TRAINING_ACCESS_ROLES] },
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
    actor: ActionHistoryActor & { userId: string; roleType: UserRole },
  ) {
    const policyActor = await resolveStaffPolicyActor(this.prisma, actor);
    if (
      !canAssignClassManager(policyActor) &&
      !canEditClassManagerAllowanceRate(policyActor)
    ) {
      throw new ForbiddenException(
        'Chỉ Admin hoặc Trưởng ban Đào tạo được giao / gỡ Quản lý lớp.',
      );
    }

    const existing = await this.prisma.class.findUnique({
      where: { id: classId },
      select: {
        id: true,
        trainingManagerStaffId: true,
        trainingManagerRatePercent: true,
      },
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

    // #276: % trợ cấp quản lý lớp chỉ Admin sửa; giao/gỡ quản lý theo
    // `canAssignClassManager` (#277: Admin + Trưởng ban Đào tạo, mọi lớp).
    // Chỉ xét phần thật sự đổi.
    const currentRate =
      existing.trainingManagerRatePercent == null
        ? null
        : toNumber(existing.trainingManagerRatePercent);
    assertClassTrainingManagerUpdateAllowed(policyActor, {
      changesManager:
        nextStaffId !== undefined &&
        nextStaffId !== existing.trainingManagerStaffId,
      changesRate: nextRate !== undefined && nextRate !== currentRate,
    });

    // Gia sư kiêm quản lý lớp: staff `teacher` chưa thuộc Ban Đào Tạo được cấp
    // thêm `training` để quyền staff-ops / trợ cấp quản lý chạy như nhân sự Đào Tạo.
    // Trưởng ban (`training_head`) đã có quyền nên không bị cấp thêm.
    let grantTrainingRoleToStaffId: string | null = null;
    if (nextStaffId) {
      ({ grantTrainingRoleToStaffId } = await resolveTrainingManagerAssignment(
        this.prisma,
        nextStaffId,
      ));
    }

    if (nextRate != null && (nextRate < 0 || nextRate > 100)) {
      throw new BadRequestException(
        'trainingManagerRatePercent must be between 0 and 100.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedClass = await tx.class.update({
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

      await grantTrainingRoleForManager(tx, grantTrainingRoleToStaffId);

      // Form lớp gửi endpoint này kèm mỗi lần lưu gia sư — chỉ ghi khi
      // quản lý hoặc % thật sự đổi để lịch sử không bị nhiễu.
      const beforeValue = toTrainingManagerAuditSnapshot(existing);
      const afterValue = toTrainingManagerAuditSnapshot(updatedClass);
      if (
        beforeValue.trainingManagerStaffId !==
          afterValue.trainingManagerStaffId ||
        beforeValue.trainingManagerRatePercent !==
          afterValue.trainingManagerRatePercent
      ) {
        await this.actionHistoryService.recordUpdate(tx, {
          actor,
          entityType: 'class',
          entityId: classId,
          description: 'Cập nhật quản lý lớp / % quản lý',
          beforeValue,
          afterValue,
        });
      }

      return updatedClass;
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

    const actor = await resolveStaffPolicyActor(this.prisma, {
      userId,
      roleType,
    });
    if (!actor.isAdmin && !actor.staffId) {
      throw new ForbiddenException('Staff profile required');
    }

    // #270: trợ cấp quản lý lớp là thu nhập cá nhân → Admin, Kế toán chi,
    // chính người đó. Kế toán thu không còn xem.
    if (!computeStaffSensitiveView(actor, staffId).income) {
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
        trainingManagerRatePercent: unknown;
        monthTotal: unknown;
        pendingTotal: unknown;
      }>
    >(Prisma.sql`
      SELECT
        classes.id AS "classId",
        COALESCE(classes.name, '') AS "className",
        classes.training_manager_rate_percent AS "trainingManagerRatePercent",
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
      GROUP BY classes.id, classes.name, classes.training_manager_rate_percent
      ORDER BY classes.name ASC
    `);

    const data = rows.map((row) => ({
      classId: row.classId,
      className: row.className?.trim() || 'Lớp chưa đặt tên',
      trainingManagerRatePercent: toNumber(row.trainingManagerRatePercent),
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

  async updateSessionRatePercent(
    actor: ActionHistoryActor & { userId: string; roleType: UserRole },
    staffId: string,
    sessionId: string,
    ratePercentInput: unknown,
  ): Promise<TrainingManagerSessionAllowanceDto> {
    // #276: % trợ cấp quản lý lớp trên buổi — chỉ Admin.
    assertCanEditClassManagerAllowanceRate(
      await resolveStaffPolicyActor(this.prisma, actor),
    );

    const ratePercent = normalizeTrainingManagerRatePercent(ratePercentInput);
    if (ratePercent == null || ratePercent <= 0) {
      throw new BadRequestException(
        'trainingManagerRatePercent must be greater than 0 and at most 100.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const session = await tx.session.findFirst({
        where: { id: sessionId, trainingManagerStaffId: staffId },
        select: {
          id: true,
          date: true,
          trainingManagerStaffId: true,
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
      if (!session) {
        throw new NotFoundException(
          'Buổi học không thuộc quản lý lớp của nhân sự này.',
        );
      }
      if (session.trainingManagerPaymentStatus === PaymentStatus.paid) {
        throw new BadRequestException(
          'Buổi đã thanh toán trợ cấp QLL — chuyển về Chưa thanh toán trước khi sửa %.',
        );
      }

      // Cùng công thức cột «Học phí buổi» của danh sách khoản.
      const sessionTuitionTotal = session.attendance.reduce(
        (sum, row) => sum + (row.tuitionFee ?? 0),
        0,
      );
      const snapshot = computeTrainingManagerSessionSnapshot({
        sessionTuitionTotal,
        trainingManagerStaffId: staffId,
        trainingManagerRatePercent: ratePercent,
      });

      await tx.session.update({
        where: { id: session.id },
        data: {
          trainingManagerRatePercent: snapshot.trainingManagerRatePercent,
          trainingManagerAllowanceAmount:
            snapshot.trainingManagerAllowanceAmount,
          trainingManagerPaymentStatus: snapshot.trainingManagerPaymentStatus,
        },
      });

      const beforeValue = {
        trainingManagerStaffId: session.trainingManagerStaffId,
        trainingManagerRatePercent: toNumber(
          session.trainingManagerRatePercent,
        ),
        trainingManagerAllowanceAmount: session.trainingManagerAllowanceAmount,
      };
      const afterValue = {
        trainingManagerStaffId: staffId,
        trainingManagerRatePercent: snapshot.trainingManagerRatePercent,
        trainingManagerAllowanceAmount: snapshot.trainingManagerAllowanceAmount,
      };
      if (
        beforeValue.trainingManagerRatePercent !==
        afterValue.trainingManagerRatePercent
      ) {
        await this.actionHistoryService.recordUpdate(tx, {
          actor,
          entityType: 'session',
          entityId: session.id,
          description: 'Điều chỉnh % quản lý lớp của buổi học',
          beforeValue,
          afterValue,
        });
      }

      return {
        sessionId: session.id,
        date: session.date.toISOString(),
        sessionTuitionTotal,
        trainingManagerRatePercent: snapshot.trainingManagerRatePercent,
        allowanceAmount: snapshot.trainingManagerAllowanceAmount ?? 0,
        paymentStatus:
          snapshot.trainingManagerPaymentStatus ?? PaymentStatus.pending,
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
    await assertActorNotEditingOwnCompensation(
      this.prisma,
      { userId, roleType },
      [staffId],
    );

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
      // #270: Kế toán thu không xử lý khoản chi nhân sự.
      const canEdit =
        actor?.roles.includes(StaffRole.admin) ||
        actor?.roles.includes(StaffRole.accountant_expense);
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

    let taxRatePercent = 0;
    if (paymentStatus === PaymentStatus.paid) {
      const manager = await this.prisma.staffInfo.findUnique({
        where: { id: accessibleStaffId },
        select: { roles: true },
      });
      taxRatePercent = await resolveTaxDeductionRate(this.prisma, {
        staffId: accessibleStaffId,
        roleType:
          resolveTrainingManagerIncomeRole(manager?.roles) ??
          StaffRole.training,
        effectiveDate: new Date(),
      });
    }

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
