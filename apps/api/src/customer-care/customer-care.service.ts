import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'generated/client';
import {
  PaymentStatus,
  StaffRole,
  StudentClassStatus,
  UserRole,
  WalletTransactionType,
} from 'generated/enums';
import type {
  CustomerCareBulkPaymentStatusUpdateResultDto,
  CustomerCareCommissionDto,
  CustomerCareCommissionListQueryDto,
  CustomerCareCommissionScope,
  CustomerCareSessionCommissionDto,
  CustomerCareStudentListDto,
  CustomerCareTopUpHistoryListDto,
} from 'src/dtos/customer-care.dto';
import { resolveTaxDeductionRate } from 'src/payroll/deduction-rates';
import { PrismaService } from 'src/prisma/prisma.service';

const DEFAULT_DAYS = 30;
const RECENT_TOP_UP_DAYS = 21;
const RECENT_TOP_UP_THRESHOLD = 300_000;

function toNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

type CustomerCareCommissionAggregateRow = {
  studentId: string;
  fullName: string | null;
  totalCommission: unknown;
  pendingCommission: unknown;
  paidCommission: unknown;
};

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

function normalizeCommissionScope(
  query: CustomerCareCommissionListQueryDto = {},
): CustomerCareCommissionScope | 'days' {
  if (query.scope === 'month') {
    return 'month';
  }

  if (query.scope === 'pending') {
    return 'pending';
  }

  return 'days';
}

type CustomerCareStudentListQuery = {
  page?: number;
  limit?: number;
};

type CustomerCareTopUpHistoryQuery = CustomerCareStudentListQuery;

@Injectable()
export class CustomerCareService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveStaffProfile(userId: string) {
    return this.prisma.staffInfo.findFirst({
      where: { userId },
      select: {
        id: true,
        roles: true,
      },
    });
  }

  private async resolveAccessibleStaffId(
    userId: string,
    roleType: UserRole,
    requestedStaffId: string,
  ) {
    if (roleType === UserRole.admin) {
      return requestedStaffId;
    }

    if (roleType !== UserRole.staff) {
      throw new ForbiddenException(
        'Chỉ admin, kế toán, hoặc staff.customer_care mới được xem dữ liệu customer-care.',
      );
    }

    const staff = await this.resolveStaffProfile(userId);

    if (!staff) {
      throw new ForbiddenException(
        'Tài khoản staff hiện tại chưa có hồ sơ nhân sự để dùng màn CSKH.',
      );
    }

    if (
      staff.roles.includes(StaffRole.assistant) ||
      staff.roles.includes(StaffRole.accountant) ||
      staff.roles.includes(StaffRole.accountant_income)
    ) {
      return requestedStaffId;
    }

    if (!staff.roles.includes(StaffRole.customer_care)) {
      throw new ForbiddenException(
        'Màn CSKH chỉ mở cho admin, trợ lí, kế toán, hoặc staff có role customer_care.',
      );
    }

    if (staff.id !== requestedStaffId) {
      throw new ForbiddenException(
        'Nhân sự CSKH chỉ được xem dữ liệu của chính mình.',
      );
    }

    return staff.id;
  }

  private async canUpdateCommissionPaymentStatus(
    userId: string,
    roleType: UserRole,
  ) {
    if (roleType === UserRole.admin) {
      return true;
    }

    if (roleType !== UserRole.staff) {
      return false;
    }

    const staff = await this.resolveStaffProfile(userId);
    if (!staff) {
      return false;
    }

    return (
      staff.roles.includes(StaffRole.admin) ||
      staff.roles.includes(StaffRole.assistant) ||
      staff.roles.includes(StaffRole.accountant) ||
      staff.roles.includes(StaffRole.accountant_income) ||
      staff.roles.includes(StaffRole.accountant_expense)
    );
  }

  /** List students assigned to this staff in customer_care_service, sorted by accountBalance asc. */
  async getStudentsByStaffId(
    userId: string,
    roleType: UserRole,
    staffId: string,
    query: CustomerCareStudentListQuery = {},
  ): Promise<CustomerCareStudentListDto> {
    const accessibleStaffId = await this.resolveAccessibleStaffId(
      userId,
      roleType,
      staffId,
    );

    const staff = await this.prisma.staffInfo.findUnique({
      where: { id: accessibleStaffId },
      select: { id: true },
    });
    if (!staff) throw new NotFoundException('Staff not found');

    const parsedPage = Number(query.page);
    const parsedLimit = Number(query.limit);
    const page =
      Number.isInteger(parsedPage) && parsedPage >= 1 ? parsedPage : 1;
    const limit =
      Number.isInteger(parsedLimit) && parsedLimit >= 1
        ? Math.min(parsedLimit, 100)
        : 20;
    const total = await this.prisma.customerCareService.count({
      where: { staffId: accessibleStaffId },
    });
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const skip = (safePage - 1) * limit;

    const list = await this.prisma.customerCareService.findMany({
      where: { staffId: accessibleStaffId },
      skip,
      take: limit,
      select: {
        student: {
          select: {
            id: true,
            fullName: true,
            accountBalance: true,
            province: true,
            status: true,
            studentClasses: {
              where: { status: StudentClassStatus.active },
              select: {
                class: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: [
        {
          student: {
            accountBalance: 'asc',
          },
        },
        {
          student: {
            id: 'asc',
          },
        },
      ],
    });

    const studentIds = list.map((row) => row.student.id);
    const recentTopUpTotals =
      await this.getRecentTopUpTotalsByStudentId(studentIds);

    return {
      data: list.map((row) => {
        const recentTopUpTotal = recentTopUpTotals.get(row.student.id) ?? 0;
        return {
          id: row.student.id,
          fullName: row.student.fullName ?? '',
          accountBalance: row.student.accountBalance ?? 0,
          province: row.student.province ?? null,
          status: row.student.status,
          classes: row.student.studentClasses.map((studentClass) => ({
            id: studentClass.class.id,
            name: studentClass.class.name,
          })),
          recentTopUpTotalLast21Days: recentTopUpTotal,
          recentTopUpMeetsThreshold:
            recentTopUpTotal >= RECENT_TOP_UP_THRESHOLD,
        };
      }),
      meta: {
        total,
        page: safePage,
        limit,
      },
    };
  }

  private async getRecentTopUpTotalsByStudentId(
    studentIds: string[],
  ): Promise<Map<string, number>> {
    if (studentIds.length === 0) {
      return new Map();
    }

    const since = new Date();
    since.setDate(since.getDate() - RECENT_TOP_UP_DAYS);

    const rows = await this.prisma.walletTransactionsHistory.groupBy({
      by: ['studentId'],
      where: {
        studentId: { in: studentIds },
        type: WalletTransactionType.topup,
        createdAt: { gte: since },
      },
      _sum: { amount: true },
    });

    return new Map(rows.map((row) => [row.studentId, row._sum.amount ?? 0]));
  }

  async getTopUpHistoryByStaffId(
    userId: string,
    roleType: UserRole,
    staffId: string,
    query: CustomerCareTopUpHistoryQuery = {},
  ): Promise<CustomerCareTopUpHistoryListDto> {
    const accessibleStaffId = await this.resolveAccessibleStaffId(
      userId,
      roleType,
      staffId,
    );

    const staff = await this.prisma.staffInfo.findUnique({
      where: { id: accessibleStaffId },
      select: { id: true },
    });
    if (!staff) throw new NotFoundException('Staff not found');

    const parsedPage = Number(query.page);
    const parsedLimit = Number(query.limit);
    const page =
      Number.isInteger(parsedPage) && parsedPage >= 1 ? parsedPage : 1;
    const limit =
      Number.isInteger(parsedLimit) && parsedLimit >= 1
        ? Math.min(parsedLimit, 100)
        : 20;
    const where = {
      type: WalletTransactionType.topup,
      student: {
        customerCareServices: {
          staffId: accessibleStaffId,
        },
      },
    };
    const total = await this.prisma.walletTransactionsHistory.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const skip = (safePage - 1) * limit;

    const transactions = await this.prisma.walletTransactionsHistory.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        studentId: true,
        amount: true,
        note: true,
        date: true,
        createdAt: true,
        student: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
    });

    return {
      data: transactions.map((transaction) => ({
        id: transaction.id,
        studentId: transaction.student.id,
        studentName: transaction.student.fullName ?? '',
        amount: transaction.amount,
        note: transaction.note ?? null,
        date: transaction.date.toISOString(),
        createdAt: transaction.createdAt.toISOString(),
      })),
      meta: {
        total,
        page: safePage,
        limit,
      },
    };
  }

  private buildCommissionScopeFilters(
    scope: CustomerCareCommissionScope | 'days',
    query: CustomerCareCommissionListQueryDto,
  ): {
    attendancePaymentFilter: Prisma.Sql;
    sessionDateFilter: Prisma.Sql;
  } {
    if (scope === 'month') {
      if (!query.month?.trim()) {
        throw new BadRequestException('month is required when scope is month.');
      }

      const { start, endExclusive } = parseMonthRange(query.month);

      return {
        attendancePaymentFilter: Prisma.empty,
        sessionDateFilter: Prisma.sql`
          AND sessions.date >= ${start}
          AND sessions.date < ${endExclusive}
        `,
      };
    }

    if (scope === 'pending') {
      return {
        attendancePaymentFilter: Prisma.sql`
          AND COALESCE(attendance.customer_care_payment_status::text, ${PaymentStatus.pending}) = ${PaymentStatus.pending}
        `,
        sessionDateFilter: Prisma.empty,
      };
    }

    const days = query.days ?? DEFAULT_DAYS;
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    return {
      attendancePaymentFilter: Prisma.empty,
      sessionDateFilter: Prisma.sql`AND sessions.date >= ${since}`,
    };
  }

  /** List students with total commission for this staff. */
  async getCommissionsByStaffId(
    userId: string,
    roleType: UserRole,
    staffId: string,
    query: CustomerCareCommissionListQueryDto = {},
  ): Promise<CustomerCareCommissionDto[]> {
    const accessibleStaffId = await this.resolveAccessibleStaffId(
      userId,
      roleType,
      staffId,
    );

    const staff = await this.prisma.staffInfo.findUnique({
      where: { id: accessibleStaffId },
      select: { id: true },
    });
    if (!staff) throw new NotFoundException('Staff not found');

    const scope = normalizeCommissionScope(query);
    const { attendancePaymentFilter, sessionDateFilter } =
      this.buildCommissionScopeFilters(scope, query);

    const rows = await this.prisma.$queryRaw<
      CustomerCareCommissionAggregateRow[]
    >(
      Prisma.sql`
          SELECT
            student_info.id AS "studentId",
            COALESCE(student_info.full_name, '') AS "fullName",
            COALESCE(
              SUM(
                ROUND(
                  COALESCE(attendance.tuition_fee, 0)::numeric
                  * COALESCE(attendance.customer_care_coef, 0)
                )
              ),
              0
            ) AS "totalCommission",
            COALESCE(
              SUM(
                CASE
                  WHEN COALESCE(attendance.customer_care_payment_status::text, ${PaymentStatus.pending}) = ${PaymentStatus.pending}
                  THEN ROUND(
                    COALESCE(attendance.tuition_fee, 0)::numeric
                    * COALESCE(attendance.customer_care_coef, 0)
                  )
                  ELSE 0
                END
              ),
              0
            ) AS "pendingCommission",
            COALESCE(
              SUM(
                CASE
                  WHEN attendance.customer_care_payment_status::text = ${PaymentStatus.paid}
                  THEN ROUND(
                    COALESCE(attendance.tuition_fee, 0)::numeric
                    * COALESCE(attendance.customer_care_coef, 0)
                  )
                  ELSE 0
                END
              ),
              0
            ) AS "paidCommission"
          FROM attendance
          INNER JOIN sessions
            ON sessions.id = attendance.session_id
          INNER JOIN student_info
            ON student_info.id = attendance.student_id
          WHERE attendance.customer_care_staff_id = ${accessibleStaffId}
            ${attendancePaymentFilter}
            ${sessionDateFilter}
          GROUP BY student_info.id, student_info.full_name
        `,
    );

    const mappedRows = rows.map((row) => ({
      studentId: row.studentId,
      fullName: row.fullName ?? '',
      totalCommission: toNumber(row.totalCommission),
      pendingCommission: toNumber(row.pendingCommission),
      paidCommission: toNumber(row.paidCommission),
    }));

    if (scope === 'pending') {
      return mappedRows.filter((row) => row.pendingCommission > 0);
    }

    if (scope === 'month') {
      return mappedRows.filter((row) => row.totalCommission > 0);
    }

    return mappedRows;
  }

  /** Session-level commissions for one student under this staff. */
  async getSessionCommissionsByStudent(
    userId: string,
    roleType: UserRole,
    staffId: string,
    studentId: string,
    query: CustomerCareCommissionListQueryDto = {},
  ): Promise<CustomerCareSessionCommissionDto[]> {
    const accessibleStaffId = await this.resolveAccessibleStaffId(
      userId,
      roleType,
      staffId,
    );

    const staff = await this.prisma.staffInfo.findUnique({
      where: { id: accessibleStaffId },
      select: { id: true },
    });
    if (!staff) throw new NotFoundException('Staff not found');

    const scope = normalizeCommissionScope(query);
    const sessionDateWhere =
      scope === 'month'
        ? (() => {
            if (!query.month?.trim()) {
              throw new BadRequestException(
                'month is required when scope is month.',
              );
            }
            const { start, endExclusive } = parseMonthRange(query.month);
            return {
              gte: start,
              lt: endExclusive,
            };
          })()
        : scope === 'days'
          ? (() => {
              const days = query.days ?? DEFAULT_DAYS;
              const since = new Date();
              since.setDate(since.getDate() - days);
              since.setHours(0, 0, 0, 0);
              return { gte: since };
            })()
          : undefined;

    const attendances = await this.prisma.attendance.findMany({
      where: {
        customerCareStaffId: accessibleStaffId,
        studentId,
        ...(scope === 'pending'
          ? {
              OR: [
                { customerCarePaymentStatus: PaymentStatus.pending },
                { customerCarePaymentStatus: null },
              ],
            }
          : {}),
        ...(sessionDateWhere
          ? {
              session: { date: sessionDateWhere },
            }
          : {}),
      },
      select: {
        id: true,
        tuitionFee: true,
        customerCareCoef: true,
        customerCarePaymentStatus: true,
        session: {
          select: {
            id: true,
            date: true,
            class: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { session: { date: 'desc' } },
    });

    return attendances.map((attendance) => {
      const tuition = toNumber(attendance.tuitionFee);
      const coef = toNumber(attendance.customerCareCoef);
      const commission = Math.round(tuition * coef);
      return {
        attendanceId: attendance.id,
        sessionId: attendance.session.id,
        date: attendance.session.date.toISOString(),
        className: attendance.session.class?.name ?? null,
        tuitionFee: tuition,
        customerCareCoef: coef,
        commission,
        paymentStatus:
          attendance.customerCarePaymentStatus ?? PaymentStatus.pending,
      };
    });
  }

  async bulkUpdateCommissionPaymentStatus(
    userId: string,
    roleType: UserRole,
    staffId: string,
    attendanceIds: string[],
    paymentStatus: PaymentStatus,
  ): Promise<CustomerCareBulkPaymentStatusUpdateResultDto> {
    const canUpdate = await this.canUpdateCommissionPaymentStatus(
      userId,
      roleType,
    );
    if (!canUpdate) {
      throw new ForbiddenException(
        'Tài khoản hiện tại không có quyền cập nhật trạng thái thanh toán hoa hồng CSKH.',
      );
    }

    const accessibleStaffId = await this.resolveAccessibleStaffId(
      userId,
      roleType,
      staffId,
    );

    const uniqueAttendanceIds = Array.from(
      new Set(
        attendanceIds.filter(
          (attendanceId): attendanceId is string =>
            typeof attendanceId === 'string' && attendanceId.trim().length > 0,
        ),
      ),
    );

    if (uniqueAttendanceIds.length === 0) {
      throw new BadRequestException(
        'attendanceIds must contain at least one id.',
      );
    }

    if (
      paymentStatus !== PaymentStatus.pending &&
      paymentStatus !== PaymentStatus.paid
    ) {
      throw new BadRequestException(
        'paymentStatus must be either pending or paid.',
      );
    }

    const staff = await this.prisma.staffInfo.findUnique({
      where: { id: accessibleStaffId },
      select: { id: true },
    });
    if (!staff) {
      throw new NotFoundException('Staff not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const existingAttendances = await tx.attendance.findMany({
        where: {
          id: { in: uniqueAttendanceIds },
          customerCareStaffId: accessibleStaffId,
        },
        select: {
          id: true,
          customerCarePaymentStatus: true,
        },
      });

      if (existingAttendances.length !== uniqueAttendanceIds.length) {
        const existingIds = new Set(
          existingAttendances.map((attendance) => attendance.id),
        );
        const missingAttendanceId = uniqueAttendanceIds.find(
          (attendanceId) => !existingIds.has(attendanceId),
        );

        throw new NotFoundException(
          missingAttendanceId
            ? `Attendance not found for customer-care staff: ${missingAttendanceId}`
            : 'Attendance not found for customer-care staff',
        );
      }

      const changedAttendanceIds = existingAttendances
        .filter(
          (attendance) =>
            (attendance.customerCarePaymentStatus ?? PaymentStatus.pending) !==
            paymentStatus,
        )
        .map((attendance) => attendance.id);

      if (changedAttendanceIds.length === 0) {
        return {
          staffId: accessibleStaffId,
          requestedCount: uniqueAttendanceIds.length,
          updatedCount: 0,
        };
      }

      let updatedCount = 0;

      if (paymentStatus === PaymentStatus.paid) {
        const taxRatePercent = await resolveTaxDeductionRate(tx, {
          staffId: accessibleStaffId,
          roleType: StaffRole.customer_care,
          effectiveDate: new Date(),
        });

        const updateResult = await tx.attendance.updateMany({
          where: {
            id: { in: changedAttendanceIds },
          },
          data: {
            customerCarePaymentStatus: PaymentStatus.paid,
            customerCareTaxDeductionRatePercent: taxRatePercent,
          },
        });
        updatedCount = updateResult.count;
      } else {
        const updateResult = await tx.attendance.updateMany({
          where: {
            id: { in: changedAttendanceIds },
          },
          data: {
            customerCarePaymentStatus: PaymentStatus.pending,
            customerCareTaxDeductionRatePercent: 0,
          },
        });
        updatedCount = updateResult.count;
      }

      return {
        staffId: accessibleStaffId,
        requestedCount: uniqueAttendanceIds.length,
        updatedCount,
      };
    });
  }
}
