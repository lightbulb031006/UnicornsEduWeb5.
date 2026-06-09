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
  UserRole,
} from 'generated/enums';
import type {
  AssistantBulkPaymentStatusUpdateResultDto,
  AssistantCommissionScope,
  AssistantManagedCustomerCareListDto,
  AssistantManagedStudentListDto,
  AssistantSessionShareItemDto,
} from 'src/dtos/assistant-commission.dto';
import { getPreferredUserFullName } from 'src/common/user-name.util';
import { resolveTaxDeductionRate } from 'src/payroll/deduction-rates';
import { ASSISTANT_SHARE_EXCLUDE_SELF_MANAGED_SQL } from 'src/payroll/assistant-share.util';
import { PrismaService } from 'src/prisma/prisma.service';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const ASSISTANT_SHARE_RATE = 0.03;
const CHARGEABLE_ATTENDANCE_STATUSES: AttendanceStatus[] = [
  AttendanceStatus.present,
  AttendanceStatus.excused,
];

type AssistantCommissionListQuery = {
  scope?: AssistantCommissionScope;
  month?: string;
  page?: number;
  limit?: number;
};

type ManagedCustomerCareAggregateRow = {
  customerCareStaffId: string;
  fullName: string | null;
  totalShareAmount: unknown;
  pendingShareAmount: unknown;
  paidShareAmount: unknown;
};

type ManagedStudentAggregateRow = {
  studentId: string;
  fullName: string | null;
  totalShareAmount: unknown;
  pendingShareAmount: unknown;
  paidShareAmount: unknown;
};

function toNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parsePagination(query: AssistantCommissionListQuery) {
  const parsedPage = Number(query.page);
  const parsedLimit = Number(query.limit);
  const page =
    Number.isInteger(parsedPage) && parsedPage >= 1 ? parsedPage : DEFAULT_PAGE;
  const limit =
    Number.isInteger(parsedLimit) && parsedLimit >= 1
      ? Math.min(parsedLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;

  return { page, limit };
}

function parseMonthRange(monthKey: string): { start: Date; endExclusive: Date } {
  const matched = /^(\d{4})-(\d{2})$/.exec(monthKey.trim());
  if (!matched) {
    throw new BadRequestException('month must use YYYY-MM format.');
  }

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new BadRequestException('month must use YYYY-MM format.');
  }

  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    endExclusive: new Date(Date.UTC(year, month, 1)),
  };
}

function normalizeScope(scope?: string): AssistantCommissionScope {
  if (scope === 'all' || scope === 'month') {
    return scope;
  }

  return 'pending';
}

@Injectable()
export class AssistantCommissionService {
  constructor(private readonly prisma: PrismaService) {}

  private resolveStaffDisplayName(
    user?: {
      first_name?: string | null;
      last_name?: string | null;
      accountHandle?: string | null;
      email?: string | null;
    } | null,
  ) {
    return getPreferredUserFullName(user)?.trim() || 'Nhân sự chưa đặt tên';
  }

  private async resolveStaffProfile(userId: string) {
    return this.prisma.staffInfo.findFirst({
      where: { userId },
      select: {
        id: true,
        roles: true,
      },
    });
  }

  private async resolveAccessibleAssistantStaffId(
    userId: string,
    roleType: UserRole,
    requestedAssistantStaffId: string,
  ) {
    if (roleType === UserRole.admin) {
      return requestedAssistantStaffId;
    }

    if (roleType !== UserRole.staff) {
      throw new ForbiddenException(
        'Chỉ admin hoặc staff được phép xem dữ liệu hoa hồng trợ lí.',
      );
    }

    const staff = await this.resolveStaffProfile(userId);
    if (!staff) {
      throw new ForbiddenException(
        'Tài khoản staff hiện tại chưa có hồ sơ nhân sự.',
      );
    }

    const canAccess =
      staff.roles.includes(StaffRole.admin) ||
      staff.roles.includes(StaffRole.assistant) ||
      staff.roles.includes(StaffRole.accountant) ||
      staff.roles.includes(StaffRole.accountant_income) ||
      staff.roles.includes(StaffRole.accountant_expense);

    if (!canAccess) {
      throw new ForbiddenException(
        'Tài khoản hiện tại không có quyền xem hoa hồng trợ lí.',
      );
    }

    return requestedAssistantStaffId;
  }

  private async canUpdatePaymentStatus(userId: string, roleType: UserRole) {
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

  private async assertAssistantStaffExists(assistantStaffId: string) {
    const assistantStaff = await this.prisma.staffInfo.findUnique({
      where: { id: assistantStaffId },
      select: { id: true, roles: true },
    });

    if (!assistantStaff) {
      throw new NotFoundException('Assistant staff not found');
    }

    if (!assistantStaff.roles.includes(StaffRole.assistant)) {
      throw new NotFoundException('Assistant staff not found');
    }

    return assistantStaff;
  }

  private async assertManagedCustomerCareStaff(
    assistantStaffId: string,
    customerCareStaffId: string,
  ) {
    if (customerCareStaffId === assistantStaffId) {
      throw new NotFoundException(
        'Customer-care staff not found for this assistant manager',
      );
    }

    const customerCareStaff = await this.prisma.staffInfo.findFirst({
      where: {
        id: customerCareStaffId,
        customerCareManagedByStaffId: assistantStaffId,
        roles: { has: StaffRole.customer_care },
      },
      select: {
        id: true,
        user: {
          select: {
            first_name: true,
            last_name: true,
            accountHandle: true,
            email: true,
          },
        },
      },
    });

    if (!customerCareStaff) {
      throw new NotFoundException(
        'Customer-care staff not found for this assistant manager',
      );
    }

    return {
      id: customerCareStaff.id,
      fullName: this.resolveStaffDisplayName(customerCareStaff.user),
    };
  }

  private buildScopeFilters(
    scope: AssistantCommissionScope,
    monthKey?: string,
  ): {
    attendancePaymentFilter: Prisma.Sql;
    sessionDateFilter: Prisma.Sql;
  } {
    if (scope === 'month') {
      if (!monthKey?.trim()) {
        throw new BadRequestException(
          'month is required when scope is month.',
        );
      }

      const { start, endExclusive } = parseMonthRange(monthKey);

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
          AND COALESCE(attendance.assistant_payment_status::text, ${PaymentStatus.pending}) = ${PaymentStatus.pending}
        `,
        sessionDateFilter: Prisma.empty,
      };
    }

    return {
      attendancePaymentFilter: Prisma.empty,
      sessionDateFilter: Prisma.empty,
    };
  }

  async getManagedCustomerCare(
    userId: string,
    roleType: UserRole,
    assistantStaffId: string,
    query: AssistantCommissionListQuery = {},
  ): Promise<AssistantManagedCustomerCareListDto> {
    const accessibleAssistantStaffId =
      await this.resolveAccessibleAssistantStaffId(
        userId,
        roleType,
        assistantStaffId,
      );
    await this.assertAssistantStaffExists(accessibleAssistantStaffId);

    const scope = normalizeScope(query.scope);
    const { page, limit } = parsePagination(query);
    const { attendancePaymentFilter, sessionDateFilter } =
      this.buildScopeFilters(scope, query.month);

    const managedStaff = await this.prisma.staffInfo.findMany({
      where: {
        customerCareManagedByStaffId: accessibleAssistantStaffId,
        roles: { has: StaffRole.customer_care },
        id: { not: accessibleAssistantStaffId },
      },
      select: {
        id: true,
        user: {
          select: {
            first_name: true,
            last_name: true,
            accountHandle: true,
            email: true,
          },
        },
      },
      orderBy: [
        { user: { first_name: 'asc' } },
        { user: { last_name: 'asc' } },
        { id: 'asc' },
      ],
    });

    if (managedStaff.length === 0) {
      return {
        data: [],
        meta: { total: 0, page: 1, limit },
      };
    }

    const aggregateRows = await this.prisma.$queryRaw<
      ManagedCustomerCareAggregateRow[]
    >(Prisma.sql`
      SELECT
        attendance.customer_care_staff_id AS "customerCareStaffId",
        COALESCE(SUM(
          ROUND((COALESCE(attendance.tuition_fee, 0) * 0.03)::numeric, 0)
        ), 0) AS "totalShareAmount",
        COALESCE(SUM(
          CASE
            WHEN COALESCE(attendance.assistant_payment_status::text, ${PaymentStatus.pending}) = ${PaymentStatus.pending}
            THEN ROUND((COALESCE(attendance.tuition_fee, 0) * 0.03)::numeric, 0)
            ELSE 0
          END
        ), 0) AS "pendingShareAmount",
        COALESCE(SUM(
          CASE
            WHEN attendance.assistant_payment_status::text = ${PaymentStatus.paid}
            THEN ROUND((COALESCE(attendance.tuition_fee, 0) * 0.03)::numeric, 0)
            ELSE 0
          END
        ), 0) AS "paidShareAmount"
      FROM attendance
      INNER JOIN sessions ON sessions.id = attendance.session_id
      WHERE attendance.assistant_manager_staff_id = ${accessibleAssistantStaffId}
        AND attendance.status IN (${Prisma.join(CHARGEABLE_ATTENDANCE_STATUSES)})
        AND attendance.customer_care_staff_id IS NOT NULL
        ${ASSISTANT_SHARE_EXCLUDE_SELF_MANAGED_SQL}
        ${attendancePaymentFilter}
        ${sessionDateFilter}
      GROUP BY attendance.customer_care_staff_id
    `);

    const aggregateByStaffId = new Map(
      aggregateRows.map((row) => [row.customerCareStaffId, row]),
    );

    const mergedRows = managedStaff.map((staff) => {
      const aggregate = aggregateByStaffId.get(staff.id);
      return {
        customerCareStaffId: staff.id,
        fullName: this.resolveStaffDisplayName(staff.user),
        totalShareAmount: toNumber(aggregate?.totalShareAmount),
        pendingShareAmount: toNumber(aggregate?.pendingShareAmount),
        paidShareAmount: toNumber(aggregate?.paidShareAmount),
      };
    });

    const filteredRows =
      scope === 'pending'
        ? mergedRows.filter((row) => row.pendingShareAmount > 0)
        : scope === 'month'
          ? mergedRows.filter((row) => row.totalShareAmount > 0)
          : mergedRows;

    const total = filteredRows.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const skip = (safePage - 1) * limit;

    return {
      data: filteredRows.slice(skip, skip + limit),
      meta: {
        total,
        page: safePage,
        limit,
      },
    };
  }

  async getStudentsByManagedCustomerCare(
    userId: string,
    roleType: UserRole,
    assistantStaffId: string,
    customerCareStaffId: string,
    query: AssistantCommissionListQuery = {},
  ): Promise<AssistantManagedStudentListDto> {
    const accessibleAssistantStaffId =
      await this.resolveAccessibleAssistantStaffId(
        userId,
        roleType,
        assistantStaffId,
      );
    await this.assertAssistantStaffExists(accessibleAssistantStaffId);
    await this.assertManagedCustomerCareStaff(
      accessibleAssistantStaffId,
      customerCareStaffId,
    );

    const scope = normalizeScope(query.scope);
    const { page, limit } = parsePagination(query);
    const { attendancePaymentFilter, sessionDateFilter } =
      this.buildScopeFilters(scope, query.month);

    const rows = await this.prisma.$queryRaw<ManagedStudentAggregateRow[]>(
      Prisma.sql`
        SELECT
          student_info.id AS "studentId",
          COALESCE(student_info.full_name, '') AS "fullName",
          COALESCE(SUM(
            ROUND((COALESCE(attendance.tuition_fee, 0) * 0.03)::numeric, 0)
          ), 0) AS "totalShareAmount",
          COALESCE(SUM(
            CASE
              WHEN COALESCE(attendance.assistant_payment_status::text, ${PaymentStatus.pending}) = ${PaymentStatus.pending}
              THEN ROUND((COALESCE(attendance.tuition_fee, 0) * 0.03)::numeric, 0)
              ELSE 0
            END
          ), 0) AS "pendingShareAmount",
          COALESCE(SUM(
            CASE
              WHEN attendance.assistant_payment_status::text = ${PaymentStatus.paid}
              THEN ROUND((COALESCE(attendance.tuition_fee, 0) * 0.03)::numeric, 0)
              ELSE 0
            END
          ), 0) AS "paidShareAmount"
        FROM attendance
        INNER JOIN sessions ON sessions.id = attendance.session_id
        INNER JOIN student_info ON student_info.id = attendance.student_id
        WHERE attendance.assistant_manager_staff_id = ${accessibleAssistantStaffId}
          AND attendance.customer_care_staff_id = ${customerCareStaffId}
          AND attendance.status IN (${Prisma.join(CHARGEABLE_ATTENDANCE_STATUSES)})
          ${ASSISTANT_SHARE_EXCLUDE_SELF_MANAGED_SQL}
          ${attendancePaymentFilter}
          ${sessionDateFilter}
        GROUP BY student_info.id, student_info.full_name
        ORDER BY student_info.full_name ASC, student_info.id ASC
      `,
    );

    const filteredRows = rows
      .map((row) => ({
        studentId: row.studentId,
        fullName: row.fullName?.trim() || 'Học sinh chưa đặt tên',
        totalShareAmount: toNumber(row.totalShareAmount),
        pendingShareAmount: toNumber(row.pendingShareAmount),
        paidShareAmount: toNumber(row.paidShareAmount),
      }))
      .filter((row) =>
        scope === 'pending'
          ? row.pendingShareAmount > 0
          : scope === 'month'
            ? row.totalShareAmount > 0
            : true,
      );

    const total = filteredRows.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const skip = (safePage - 1) * limit;

    return {
      data: filteredRows.slice(skip, skip + limit),
      meta: {
        total,
        page: safePage,
        limit,
      },
    };
  }

  async getSessionSharesByStudent(
    userId: string,
    roleType: UserRole,
    assistantStaffId: string,
    customerCareStaffId: string,
    studentId: string,
    query: AssistantCommissionListQuery = {},
  ): Promise<AssistantSessionShareItemDto[]> {
    const accessibleAssistantStaffId =
      await this.resolveAccessibleAssistantStaffId(
        userId,
        roleType,
        assistantStaffId,
      );
    await this.assertAssistantStaffExists(accessibleAssistantStaffId);
    const customerCareStaff = await this.assertManagedCustomerCareStaff(
      accessibleAssistantStaffId,
      customerCareStaffId,
    );

    const scope = normalizeScope(query.scope);
    const { attendancePaymentFilter, sessionDateFilter } =
      this.buildScopeFilters(scope, query.month);

    const attendances = await this.prisma.attendance.findMany({
      where: {
        assistantManagerStaffId: accessibleAssistantStaffId,
        customerCareStaffId,
        studentId,
        status: { in: CHARGEABLE_ATTENDANCE_STATUSES },
        ...(scope === 'pending'
          ? {
              OR: [
                { assistantPaymentStatus: PaymentStatus.pending },
                { assistantPaymentStatus: null },
              ],
            }
          : {}),
        ...(scope === 'month' && query.month?.trim()
          ? {
              session: {
                date: {
                  gte: parseMonthRange(query.month).start,
                  lt: parseMonthRange(query.month).endExclusive,
                },
              },
            }
          : {}),
      },
      select: {
        id: true,
        tuitionFee: true,
        status: true,
        assistantPaymentStatus: true,
        session: {
          select: {
            id: true,
            date: true,
            class: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        session: {
          date: 'desc',
        },
      },
    });

    if (scope === 'month' && !query.month?.trim()) {
      throw new BadRequestException(
        'month is required when scope is month.',
      );
    }

    // Prisma where doesn't combine raw sessionDateFilter for month in findMany above - already handled
    void attendancePaymentFilter;
    void sessionDateFilter;

    return attendances.map((attendance) => {
      const tuitionFee = toNumber(attendance.tuitionFee);
      const shareAmount = Math.round(tuitionFee * ASSISTANT_SHARE_RATE);

      return {
        attendanceId: attendance.id,
        sessionId: attendance.session.id,
        date: attendance.session.date.toISOString(),
        className: attendance.session.class?.name ?? null,
        tuitionFee,
        shareRatePercent: 3,
        shareAmount,
        attendanceStatus: attendance.status,
        paymentStatus:
          attendance.assistantPaymentStatus ?? PaymentStatus.pending,
        customerCareStaffName: customerCareStaff.fullName,
      };
    });
  }

  async bulkUpdatePaymentStatus(
    userId: string,
    roleType: UserRole,
    assistantStaffId: string,
    attendanceIds: string[],
    paymentStatus: PaymentStatus,
  ): Promise<AssistantBulkPaymentStatusUpdateResultDto> {
    const canUpdate = await this.canUpdatePaymentStatus(userId, roleType);
    if (!canUpdate) {
      throw new ForbiddenException(
        'Tài khoản hiện tại không có quyền cập nhật trạng thái thanh toán hoa hồng trợ lí.',
      );
    }

    const accessibleAssistantStaffId =
      await this.resolveAccessibleAssistantStaffId(
        userId,
        roleType,
        assistantStaffId,
      );
    await this.assertAssistantStaffExists(accessibleAssistantStaffId);

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

    return this.prisma.$transaction(async (tx) => {
      const existingAttendances = await tx.attendance.findMany({
        where: {
          id: { in: uniqueAttendanceIds },
          assistantManagerStaffId: accessibleAssistantStaffId,
          status: { in: CHARGEABLE_ATTENDANCE_STATUSES },
        },
        select: {
          id: true,
          assistantPaymentStatus: true,
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
            ? `Attendance not found for assistant manager: ${missingAttendanceId}`
            : 'Attendance not found for assistant manager',
        );
      }

      const changedAttendanceIds = existingAttendances
        .filter(
          (attendance) =>
            (attendance.assistantPaymentStatus ?? PaymentStatus.pending) !==
            paymentStatus,
        )
        .map((attendance) => attendance.id);

      if (changedAttendanceIds.length === 0) {
        return {
          assistantStaffId: accessibleAssistantStaffId,
          requestedCount: uniqueAttendanceIds.length,
          updatedCount: 0,
        };
      }

      let updatedCount = 0;

      if (paymentStatus === PaymentStatus.paid) {
        const taxRatePercent = await resolveTaxDeductionRate(tx, {
          staffId: accessibleAssistantStaffId,
          roleType: StaffRole.assistant,
          effectiveDate: new Date(),
        });

        const updateResult = await tx.attendance.updateMany({
          where: {
            id: { in: changedAttendanceIds },
          },
          data: {
            assistantPaymentStatus: PaymentStatus.paid,
            assistantTaxDeductionRatePercent: taxRatePercent,
          },
        });
        updatedCount = updateResult.count;
      } else {
        const updateResult = await tx.attendance.updateMany({
          where: {
            id: { in: changedAttendanceIds },
          },
          data: {
            assistantPaymentStatus: PaymentStatus.pending,
            assistantTaxDeductionRatePercent: 0,
          },
        });
        updatedCount = updateResult.count;
      }

      return {
        assistantStaffId: accessibleAssistantStaffId,
        requestedCount: uniqueAttendanceIds.length,
        updatedCount,
      };
    });
  }
}
