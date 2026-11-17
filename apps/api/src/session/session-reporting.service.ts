import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/client';
import { StaffRole, UserRole } from '../../generated/enums';
import { SALE_CS_HEAD_ROLE } from '../common/sale-cs-head-access';
import { hasAnyStaffRole } from '../common/staff-role-policy';
import { SessionUnpaidSummaryItem } from '../dtos/session.dto';
import { PrismaService } from '../prisma/prisma.service';
import {
  previewNextSessionOrdinal,
  withSessionOrdinals,
} from './session-ordinal.util';
import {
  StaffOperationsAccessService,
  seesClassAsTrainingManager,
} from '../staff-ops/staff-operations-access.service';
import { getUserFullNameFromParts } from '../common/user-name.util';
import { SQL_TEACHER_SESSION_CAPPED_GROSS } from '../common/teacher-session-allowance-sql.util';
import {
  redactOtherTeachersSessions,
  redactSessionsForAccountantView,
  redactSessionForTrainingHeadView,
  redactSessionForTrainingManagerView,
  redactSessionsForTrainingManagerView,
  resolveAccountantFinanceView,
} from '../common/accountant-finance-redaction.util';

@Injectable()
export class SessionReportingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staffOperationsAccess: StaffOperationsAccessService,
  ) {}

  private buildMonthRange(month: string, year: string) {
    const monthValue = Number.parseInt(month, 10);
    const yearValue = Number.parseInt(year, 10);

    const isInvalidMonth =
      !Number.isInteger(monthValue) || monthValue < 1 || monthValue > 12;
    const isInvalidYear =
      !Number.isInteger(yearValue) || yearValue < 1970 || yearValue > 2100;

    if (isInvalidMonth || isInvalidYear) {
      throw new BadRequestException('month/year không hợp lệ.');
    }

    const monthIndex = monthValue - 1;
    const start = new Date(Date.UTC(yearValue, monthIndex, 1));
    const end = new Date(Date.UTC(yearValue, monthIndex + 1, 1));

    return {
      start,
      end,
    };
  }

  private buildSessionsByClassWhere(
    classId: string,
    month: string,
    year: string,
    teacherId?: string,
  ): Prisma.SessionWhereInput {
    const range = this.buildMonthRange(month, year);

    return {
      classId,
      ...(teacherId ? { teacherId } : {}),
      date: {
        gte: range.start,
        lt: range.end,
      },
    };
  }

  private readonly attendanceInclude = {
    include: {
      student: {
        select: { id: true, fullName: true },
      },
    },
  } as const;

  // Chỉ lấy id + tên gia sư: không trả CCCD/ngân hàng/địa chỉ... cho người xem lịch buổi học.
  private readonly teacherSelect = {
    select: {
      id: true,
      user: {
        select: {
          first_name: true,
          last_name: true,
        },
      },
    },
  } as const;

  private readonly makeupScheduleEventSelect = {
    select: {
      originalDate: true,
    },
  } as const;

  private withDerivedTeacherFullName<
    T extends {
      teacher: {
        id: string;
        user: { first_name: string | null; last_name: string | null } | null;
      } | null;
    },
  >(session: T) {
    return {
      ...session,
      teacher: session.teacher
        ? {
            ...session.teacher,
            fullName: getUserFullNameFromParts(session.teacher.user) ?? '',
          }
        : null,
    };
  }

  async getSessionsByClassId(classId: string, month: string, year: string) {
    const sessions = await this.prisma.session.findMany({
      where: this.buildSessionsByClassWhere(classId, month, year),
      include: {
        teacher: this.teacherSelect,
        attendance: this.attendanceInclude,
        makeupScheduleEvent: this.makeupScheduleEventSelect,
      },
      orderBy: {
        date: 'desc',
      },
    });

    return withSessionOrdinals(
      this.prisma,
      sessions.map((session) => this.withDerivedTeacherFullName(session)),
    );
  }

  async getSessionsByClassIdForStaff(
    userId: string,
    roleType: UserRole,
    classId: string,
    month: string,
    year: string,
  ) {
    const actor = await this.staffOperationsAccess.resolveClassViewerActor(
      userId,
      roleType,
    );
    const access = await this.staffOperationsAccess.resolveClassAccess(
      actor,
      classId,
    );
    const accessMode = access.mode;

    const sessions = await this.prisma.session.findMany({
      // Gia sư thấy mọi buổi của lớp; buổi của gia sư khác được redact còn nhận xét ở dưới.
      where: this.buildSessionsByClassWhere(classId, month, year),
      include: {
        teacher: this.teacherSelect,
        attendance: this.attendanceInclude,
        makeupScheduleEvent: this.makeupScheduleEventSelect,
      },
      orderBy: {
        date: 'desc',
      },
    });

    const mappedSessions = await withSessionOrdinals(
      this.prisma,
      sessions.map((session) => this.withDerivedTeacherFullName(session)),
    );

    // #277: Ban Đào tạo xem lịch sử buổi — không học phí / vận hành. 14/11:
    // Trưởng ban Đào tạo thấy thêm trợ cấp, hệ số, trạng thái thanh toán trợ
    // cấp gia sư để chỉnh tay (`PATCH /staff-ops/sessions/:id/training-head`).
    if (accessMode === 'training_manager') {
      return redactSessionsForTrainingManagerView(mappedSessions, {
        keepTeacherCompensation: access.isTrainingHead,
      });
    }
    if (accessMode === 'training_head') {
      // Lớp không quản lý: ẩn thêm trợ cấp quản lý lớp từng buổi.
      return mappedSessions.map((session) =>
        redactSessionForTrainingHeadView(session),
      );
    }

    if (accessMode === 'teacher') {
      const resolvedView = resolveAccountantFinanceView(roleType, actor.roles);
      // Quyết định 13/11: gia sư không thấy học phí, kể cả trên buổi của
      // mình — trừ khi kiêm role được xem học phí (Admin, trưởng phòng, Kế
      // toán thu). Góc nhìn `expense` chỉ che học phí.
      const financeView =
        resolvedView === 'full' &&
        !hasAnyStaffRole(actor.roles, [
          StaffRole.admin,
          SALE_CS_HEAD_ROLE,
          StaffRole.accountant_income,
        ])
          ? 'expense'
          : resolvedView;
      // #275 hợp quyền: kiêm Quản lý lớp (hoặc #277 Trưởng ban Đào tạo) →
      // buổi của gia sư khác hiện như Quản lý lớp, không chỉ còn phần nhận xét.
      if (seesClassAsTrainingManager(access)) {
        return mappedSessions.map((session) =>
          session.teacherId === actor.id
            ? redactSessionsForAccountantView([session], financeView)[0]
            : access.isClassManager
              ? redactSessionForTrainingManagerView(session, {
                  keepTeacherCompensation: access.isTrainingHead,
                })
              : redactSessionForTrainingHeadView(session),
        );
      }
      return redactSessionsForAccountantView(
        redactOtherTeachersSessions(mappedSessions, actor.id),
        financeView,
      );
    }

    return redactSessionsForAccountantView(
      mappedSessions,
      resolveAccountantFinanceView(roleType, actor.roles),
    );
  }

  /** Số thứ tự buổi mới nếu tạo tại (date, startTime) — dùng cho bản copy Nhận xét lúc tạo buổi. */
  async getNextSessionOrdinal(
    classId: string,
    date: string,
    startTime?: string,
  ): Promise<{ ordinal: number }> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? ''))) {
      throw new BadRequestException('date không hợp lệ.');
    }
    const normalizedStartTime = startTime?.trim() || null;
    if (
      normalizedStartTime &&
      !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(normalizedStartTime)
    ) {
      throw new BadRequestException('startTime không hợp lệ.');
    }

    return {
      ordinal: await previewNextSessionOrdinal(
        this.prisma,
        classId,
        date,
        normalizedStartTime,
      ),
    };
  }

  async getNextSessionOrdinalForStaff(
    userId: string,
    roleType: UserRole,
    classId: string,
    date: string,
    startTime?: string,
  ) {
    const actor = await this.staffOperationsAccess.resolveClassViewerActor(
      userId,
      roleType,
    );
    await this.staffOperationsAccess.resolveClassViewAccessMode(actor, classId);
    return this.getNextSessionOrdinal(classId, date, startTime);
  }

  async getSessionsByTeacherId(teacherId: string, month: string, year: string) {
    const range = this.buildMonthRange(month, year);

    const sessions = await this.prisma.session.findMany({
      where: {
        teacherId,
        date: {
          gte: range.start,
          lt: range.end,
        },
      },
      include: {
        class: { select: { id: true, name: true } },
        attendance: this.attendanceInclude,
        makeupScheduleEvent: this.makeupScheduleEventSelect,
        teacher: this.teacherSelect,
      },
      orderBy: {
        date: 'desc',
      },
    });

    return withSessionOrdinals(
      this.prisma,
      sessions.map((session) => this.withDerivedTeacherFullName(session)),
    );
  }

  async getUnpaidSessionsByTeacherId(
    teacherId: string,
    days = 14,
  ): Promise<SessionUnpaidSummaryItem[]> {
    const safeDays = Number.isInteger(days) && days > 0 ? days : 14;

    return this.prisma.$queryRaw<SessionUnpaidSummaryItem[]>(Prisma.sql`
      SELECT
        sessions.class_id AS "classId",
        classes.name AS "className",
        SUM(
          ${SQL_TEACHER_SESSION_CAPPED_GROSS} -
          ROUND(
            (
              ${SQL_TEACHER_SESSION_CAPPED_GROSS} * COALESCE(sessions.teacher_tax_rate_percent, 0)
            ) / 100.0,
            0
          )
        ) AS "totalAllowance"
      FROM sessions
      JOIN classes ON classes.id = sessions.class_id
      WHERE sessions.teacher_id = ${teacherId}
        AND sessions.teacher_payment_status = 'unpaid'
        AND sessions.date >= CURRENT_DATE - make_interval(days => ${safeDays - 1})
        AND sessions.date < CURRENT_DATE + INTERVAL '1 day'
        AND EXISTS (
          SELECT 1
          FROM attendance
          WHERE attendance.session_id = sessions.id
        )
      GROUP BY sessions.class_id, classes.name
    `);
  }
}
