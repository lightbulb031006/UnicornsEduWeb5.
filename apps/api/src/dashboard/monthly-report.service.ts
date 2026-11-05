import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/client';
import type { StudentCustomerSource, StudentStatus } from 'generated/enums';
import type {
  AdminMonthlyReportDto,
  GetAdminMonthlyReportQueryDto,
  MonthlyReportCustomerCareRowDto,
  MonthlyReportMatrixCellDto,
  MonthlyReportNewStudentDto,
} from '../dtos/dashboard.dto';
import { PrismaService } from '../prisma/prisma.service';
import {
  FIRST_WALLET_TOP_UP_SQL,
  QUALIFYING_TOP_UP_WHERE_SQL,
} from './first-wallet-top-up.sql';
import { OLD_DROPPED_STUDENT_WHERE_SQL } from './dropped-student.sql';

export interface MonthlyReportStudentInput {
  id: string;
  fullName: string;
  status: StudentStatus;
  customerSource: StudentCustomerSource;
  dropOutDate: Date | null;
  dropOutReason: string | null;
  customerCareStaffId: string | null;
}

export interface MonthlyReportTopUpInput {
  studentId: string;
  /** Nạp hợp lệ trong tháng báo cáo. */
  inMonthAmount: number;
  inMonthCount: number;
  /** Nạp hợp lệ từ lần nạp đầu tới hết tháng báo cáo. */
  toMonthEndAmount: number;
}

export interface MonthlyReportClassInput {
  studentId: string;
  className: string;
  courseId: string;
  courseName: string;
}

/** Học phí đã học trong tháng của một học sinh ở một khoá (khoá của lớp có buổi). */
export interface MonthlyReportRevenueInput {
  studentId: string;
  courseId: string;
  courseName: string;
  revenue: number;
}

export interface MonthlyReportInput {
  month: string;
  year: string;
  monthStart: Date;
  monthEnd: Date;
  generatedAt: Date;
  students: MonthlyReportStudentInput[];
  /** studentId → lần nạp hợp lệ đầu tiên rơi vào tháng báo cáo. */
  firstTopUpInMonth: Map<string, Date>;
  topUps: MonthlyReportTopUpInput[];
  /** Lớp đầu tiên học sinh vào (cho học sinh mới). */
  firstClassByStudent: Map<string, MonthlyReportClassInput>;
  /** Lớp gần nhất học sinh vào (cho phụ lục học sinh nghỉ). */
  latestClassByStudent: Map<string, MonthlyReportClassInput>;
  staffNames: Map<string, string>;
  /**
   * Học phí đã học trong tháng (doanh thu) của học sinh mới, tách theo khoá của
   * lớp có buổi — học sinh đổi lớp sang khoá khác thì doanh thu theo lớp mới.
   */
  revenueInMonth: MonthlyReportRevenueInput[];
  /** Học sinh đang nghỉ thoả định nghĩa **Học sinh cũ nghỉ**; còn lại là thử nghỉ. */
  oldDroppedStudentIds: Set<string>;
}

const UNASSIGNED_STAFF_NAME = 'Chưa có CSKH';

function toDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Tổng hợp **Báo cáo tháng** từ dữ liệu đã truy vấn. Hàm thuần, không đụng DB.
 *
 * - Học sinh mới: lần nạp hợp lệ đầu tiên rơi vào tháng (góc nhìn admin).
 * - Học sinh nghỉ: **Học sinh cũ nghỉ** hiện đang nghỉ và `dropOutDate` trong
 *   tháng; học sinh thử nghỉ chỉ được đếm riêng ở KPI.
 * - Nghỉ sớm: học sinh mới của tháng mà hiện đang nghỉ (cả cũ nghỉ lẫn thử
 *   nghỉ), tách số theo nhóm.
 */
export function buildAdminMonthlyReport(
  input: MonthlyReportInput,
): AdminMonthlyReportDto {
  const topUpByStudent = new Map(
    input.topUps.map((row) => [row.studentId, row]),
  );
  const isInMonth = (value: Date | null) =>
    value != null && value >= input.monthStart && value < input.monthEnd;

  const newStudents = input.students.filter((student) =>
    input.firstTopUpInMonth.has(student.id),
  );
  const droppedInMonth = input.students.filter(
    (student) =>
      student.status === 'inactive' && isInMonth(student.dropOutDate),
  );
  const isOldDropped = (student: MonthlyReportStudentInput) =>
    input.oldDroppedStudentIds.has(student.id);
  const trialDroppedCount = droppedInMonth.filter(
    (student) => !isOldDropped(student),
  ).length;
  const droppedStudents = droppedInMonth
    .filter(isOldDropped)
    .sort(
      (a, b) =>
        (a.dropOutDate?.getTime() ?? 0) - (b.dropOutDate?.getTime() ?? 0) ||
        a.fullName.localeCompare(b.fullName, 'vi'),
    );
  const isEarlyDrop = (student: MonthlyReportStudentInput) =>
    student.status === 'inactive';
  const isEarlyDropOld = (student: MonthlyReportStudentInput) =>
    isEarlyDrop(student) && isOldDropped(student);
  const staffNameOf = (staffId: string | null) =>
    staffId ? (input.staffNames.get(staffId) ?? null) : null;

  // Ma trận Nguồn khách × Khoá học: số học sinh theo khoá của lớp đầu tiên,
  // doanh thu theo khoá của lớp có buổi (đổi lớp sang khoá khác không kéo
  // doanh thu về khoá cũ).
  const cells = new Map<string, MonthlyReportMatrixCellDto>();
  const courseNames = new Map<string, string>();
  const cellOf = (
    customerSource: StudentCustomerSource,
    courseId: string | null,
  ) => {
    const key = `${customerSource}|${courseId ?? ''}`;
    let cell = cells.get(key);
    if (!cell) {
      cell = {
        customerSource,
        courseId,
        newCount: 0,
        earlyDropCount: 0,
        earlyDropOldCount: 0,
        earningCount: 0,
        revenue: 0,
      };
      cells.set(key, cell);
    }
    return cell;
  };
  for (const student of newStudents) {
    const firstClass = input.firstClassByStudent.get(student.id) ?? null;
    if (firstClass) courseNames.set(firstClass.courseId, firstClass.courseName);
    const cell = cellOf(student.customerSource, firstClass?.courseId ?? null);
    cell.newCount += 1;
    if (isEarlyDrop(student)) cell.earlyDropCount += 1;
    if (isEarlyDropOld(student)) cell.earlyDropOldCount += 1;
  }
  const sourceByNewStudent = new Map(
    newStudents.map((student) => [student.id, student.customerSource]),
  );
  const revenueByNewStudent = new Map<string, number>();
  for (const row of input.revenueInMonth) {
    const customerSource = sourceByNewStudent.get(row.studentId);
    if (customerSource == null || row.revenue <= 0) continue;
    courseNames.set(row.courseId, row.courseName);
    const cell = cellOf(customerSource, row.courseId);
    cell.earningCount += 1;
    cell.revenue += row.revenue;
    revenueByNewStudent.set(
      row.studentId,
      (revenueByNewStudent.get(row.studentId) ?? 0) + row.revenue,
    );
  }

  // Bảng theo CSKH.
  const staffIds = new Set<string | null>();
  for (const student of input.students) {
    if (
      student.status === 'active' ||
      input.firstTopUpInMonth.has(student.id) ||
      droppedStudents.includes(student) ||
      (topUpByStudent.get(student.id)?.inMonthCount ?? 0) > 0
    ) {
      staffIds.add(student.customerCareStaffId);
    }
  }
  const customerCare: MonthlyReportCustomerCareRowDto[] = [...staffIds]
    .map((staffId) => {
      const owned = input.students.filter(
        (student) => student.customerCareStaffId === staffId,
      );
      const ownedNew = owned.filter((student) =>
        input.firstTopUpInMonth.has(student.id),
      );
      const ownedDropped = droppedStudents.filter(
        (student) => student.customerCareStaffId === staffId,
      );
      let totalTopUpInMonth = 0;
      let topUpTransactionCount = 0;
      for (const student of owned) {
        const topUp = topUpByStudent.get(student.id);
        totalTopUpInMonth += topUp?.inMonthAmount ?? 0;
        topUpTransactionCount += topUp?.inMonthCount ?? 0;
      }
      return {
        staffId,
        staffName: staffNameOf(staffId) ?? UNASSIGNED_STAFF_NAME,
        activeStudents: owned.filter((student) => student.status === 'active')
          .length,
        newStudents: ownedNew.length,
        droppedStudents: ownedDropped.length,
        netChange: ownedNew.length - ownedDropped.length,
        earlyDropCount: ownedNew.filter(isEarlyDrop).length,
        earlyDropOldCount: ownedNew.filter(isEarlyDropOld).length,
        totalTopUpInMonth,
        topUpTransactionCount,
      };
    })
    .sort(
      (a, b) =>
        Number(a.staffId == null) - Number(b.staffId == null) ||
        b.totalTopUpInMonth - a.totalTopUpInMonth ||
        a.staffName.localeCompare(b.staffName, 'vi'),
    );

  const newStudentRows: MonthlyReportNewStudentDto[] = newStudents
    .map((student) => {
      const firstClass = input.firstClassByStudent.get(student.id) ?? null;
      return {
        studentId: student.id,
        fullName: student.fullName,
        customerCareStaffName: staffNameOf(student.customerCareStaffId),
        className: firstClass?.className ?? null,
        courseId: firstClass?.courseId ?? null,
        courseName: firstClass?.courseName ?? null,
        customerSource: student.customerSource,
        firstTopUpAt: input.firstTopUpInMonth.get(student.id)!.toISOString(),
        totalTopUp: topUpByStudent.get(student.id)?.toMonthEndAmount ?? 0,
        revenueInMonth: revenueByNewStudent.get(student.id) ?? 0,
        isEarlyDrop: isEarlyDrop(student),
        earlyDropKind: isEarlyDrop(student)
          ? isOldDropped(student)
            ? ('old' as const)
            : ('trial' as const)
          : null,
        dropOutDate:
          isEarlyDrop(student) && student.dropOutDate
            ? toDateKey(student.dropOutDate)
            : null,
      };
    })
    .sort(
      (a, b) =>
        a.firstTopUpAt.localeCompare(b.firstTopUpAt) ||
        a.fullName.localeCompare(b.fullName, 'vi'),
    );

  let totalTopUpInMonth = 0;
  let topUpTransactionCount = 0;
  for (const row of input.topUps) {
    totalTopUpInMonth += row.inMonthAmount;
    topUpTransactionCount += row.inMonthCount;
  }
  const earlyDropCount = newStudents.filter(isEarlyDrop).length;

  return {
    month: input.month,
    year: input.year,
    generatedAt: input.generatedAt.toISOString(),
    kpi: {
      totalTopUpInMonth,
      topUpTransactionCount,
      activeStudents: input.students.filter(
        (student) => student.status === 'active',
      ).length,
      newStudents: newStudents.length,
      droppedStudents: droppedStudents.length,
      trialDroppedStudents: trialDroppedCount,
      netChange: newStudents.length - droppedStudents.length,
      earlyDropOldCount: newStudents.filter(isEarlyDropOld).length,
      newStillActive: newStudents.length - earlyDropCount,
    },
    courses: [...courseNames.entries()]
      .map(([courseId, courseName]) => ({ courseId, courseName }))
      .sort((a, b) => a.courseName.localeCompare(b.courseName, 'vi')),
    matrix: [...cells.values()],
    customerCare,
    newStudents: newStudentRows,
    droppedStudents: droppedStudents.map((student) => ({
      studentId: student.id,
      fullName: student.fullName,
      customerCareStaffName: staffNameOf(student.customerCareStaffId),
      className: input.latestClassByStudent.get(student.id)?.className ?? null,
      dropOutDate: toDateKey(student.dropOutDate!),
      dropOutReason: student.dropOutReason,
    })),
  };
}

type ClassSqlRow = {
  student_id: string;
  class_name: string;
  course_id: string;
  course_name: string;
};

@Injectable()
export class MonthlyReportService {
  constructor(private readonly prisma: PrismaService) {}

  async getAdminMonthlyReport(
    query: GetAdminMonthlyReportQueryDto,
  ): Promise<AdminMonthlyReportDto> {
    const year = Number(query.year);
    const month = Number(query.month);
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 1));

    const [students, firstTopUps, topUps, staffRows] = await Promise.all([
      this.prisma.studentInfo.findMany({
        select: {
          id: true,
          fullName: true,
          status: true,
          customerSource: true,
          dropOutDate: true,
          dropOutReason: true,
          customerCareServices: { select: { staffId: true } },
        },
      }),
      this.prisma.$queryRaw<{ student_id: string; first_top_up_at: Date }[]>(
        Prisma.sql`
          SELECT student_id, first_top_up_at
          FROM (${FIRST_WALLET_TOP_UP_SQL}) AS first_wallet_top_up
          WHERE first_top_up_at >= ${monthStart}
            AND first_top_up_at < ${monthEnd}
        `,
      ),
      this.prisma.$queryRaw<
        {
          student_id: string;
          in_month_amount: bigint | number | null;
          in_month_count: bigint | number | null;
          to_month_end_amount: bigint | number | null;
        }[]
      >(Prisma.sql`
        SELECT
          wallet_transactions_history.student_id AS student_id,
          SUM(wallet_transactions_history.amount)
            FILTER (WHERE wallet_transactions_history.created_at >= ${monthStart})
            AS in_month_amount,
          COUNT(*)
            FILTER (WHERE wallet_transactions_history.created_at >= ${monthStart})
            AS in_month_count,
          SUM(wallet_transactions_history.amount) AS to_month_end_amount
        FROM wallet_transactions_history
        WHERE ${QUALIFYING_TOP_UP_WHERE_SQL}
          AND wallet_transactions_history.created_at < ${monthEnd}
        GROUP BY wallet_transactions_history.student_id
      `),
      this.prisma.$queryRaw<{ id: string; full_name: string | null }[]>(
        Prisma.sql`
          SELECT
            staff_info.id,
            NULLIF(
              TRIM(CONCAT(COALESCE(users.last_name, ''), ' ', COALESCE(users.first_name, ''))),
              ''
            ) AS full_name
          FROM staff_info
          INNER JOIN users ON users.id = staff_info.user_id
          WHERE EXISTS (
            SELECT 1 FROM customer_care_service
            WHERE customer_care_service.staff_id = staff_info.id
          )
        `,
      ),
    ]);

    const firstTopUpInMonth = new Map(
      firstTopUps.map((row) => [row.student_id, row.first_top_up_at]),
    );
    const inactiveIds = students
      .filter((student) => student.status === 'inactive')
      .map((student) => student.id);
    const oldDroppedStudentIds =
      await this.findOldDroppedStudentIds(inactiveIds);
    const droppedIds = students
      .filter(
        (student) =>
          oldDroppedStudentIds.has(student.id) &&
          student.dropOutDate != null &&
          student.dropOutDate >= monthStart &&
          student.dropOutDate < monthEnd,
      )
      .map((student) => student.id);

    const newStudentIds = [...firstTopUpInMonth.keys()];
    const [firstClasses, latestClasses, revenueInMonth] = await Promise.all([
      this.findClassPerStudent(newStudentIds, 'first'),
      this.findClassPerStudent(droppedIds, 'latest'),
      this.findRevenueInMonth(newStudentIds, monthStart, monthEnd),
    ]);

    return buildAdminMonthlyReport({
      month: query.month,
      year: query.year,
      monthStart,
      monthEnd,
      generatedAt: new Date(),
      students: students.map((student) => ({
        id: student.id,
        fullName: student.fullName,
        status: student.status,
        customerSource: student.customerSource,
        dropOutDate: student.dropOutDate,
        dropOutReason: student.dropOutReason,
        customerCareStaffId: student.customerCareServices?.staffId ?? null,
      })),
      firstTopUpInMonth,
      topUps: topUps.map((row) => ({
        studentId: row.student_id,
        inMonthAmount: Number(row.in_month_amount ?? 0),
        inMonthCount: Number(row.in_month_count ?? 0),
        toMonthEndAmount: Number(row.to_month_end_amount ?? 0),
      })),
      firstClassByStudent: firstClasses,
      latestClassByStudent: latestClasses,
      staffNames: new Map(
        staffRows.map((row) => [row.id, row.full_name ?? 'Nhân sự']),
      ),
      revenueInMonth,
      oldDroppedStudentIds,
    });
  }

  /**
   * Học phí đã học trong tháng theo học sinh × khoá của lớp có buổi:
   * `tuition_fee` của buổi có mặt/nghỉ phép có `sessions.date` trong tháng.
   * `tuition_fee` đã gồm thu bù học thử và tổng gói của lớp bán một lần, khớp
   * doanh thu dashboard.
   */
  private async findRevenueInMonth(
    studentIds: string[],
    monthStart: Date,
    monthEnd: Date,
  ): Promise<MonthlyReportRevenueInput[]> {
    if (studentIds.length === 0) return [];
    const rows = await this.prisma.$queryRaw<
      {
        student_id: string;
        course_id: string;
        course_name: string;
        revenue: bigint | number | null;
      }[]
    >(Prisma.sql`
      SELECT
        attendance.student_id AS student_id,
        courses.id AS course_id,
        courses.name AS course_name,
        COALESCE(SUM(COALESCE(attendance.tuition_fee, 0)), 0) AS revenue
      FROM attendance
      INNER JOIN sessions ON sessions.id = attendance.session_id
      INNER JOIN classes ON classes.id = sessions.class_id
      INNER JOIN courses ON courses.id = classes.course_id
      WHERE attendance.student_id IN (${Prisma.join(studentIds)})
        AND attendance.status IN ('present', 'excused')
        AND sessions.date >= ${monthStart}
        AND sessions.date < ${monthEnd}
      GROUP BY attendance.student_id, courses.id, courses.name
    `);
    return rows.map((row) => ({
      studentId: row.student_id,
      courseId: row.course_id,
      courseName: row.course_name,
      revenue: Number(row.revenue ?? 0),
    }));
  }

  /** Lọc trong `studentIds` những học sinh thoả định nghĩa **Học sinh cũ nghỉ**. */
  private async findOldDroppedStudentIds(
    studentIds: string[],
  ): Promise<Set<string>> {
    if (studentIds.length === 0) return new Set();
    const rows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT student_info.id
      FROM student_info
      WHERE student_info.id IN (${Prisma.join(studentIds)})
        AND ${OLD_DROPPED_STUDENT_WHERE_SQL}
    `);
    return new Set(rows.map((row) => row.id));
  }

  /** Lớp đầu tiên (hoặc gần nhất) học sinh vào, theo `student_classes.created_at`. */
  private async findClassPerStudent(
    studentIds: string[],
    pick: 'first' | 'latest',
  ): Promise<Map<string, MonthlyReportClassInput>> {
    if (studentIds.length === 0) return new Map();
    const order = pick === 'first' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    const rows = await this.prisma.$queryRaw<ClassSqlRow[]>(Prisma.sql`
      SELECT DISTINCT ON (student_classes.student_id)
        student_classes.student_id AS student_id,
        classes.name AS class_name,
        courses.id AS course_id,
        courses.name AS course_name
      FROM student_classes
      INNER JOIN classes ON classes.id = student_classes.class_id
      INNER JOIN courses ON courses.id = classes.course_id
      WHERE student_classes.student_id IN (${Prisma.join(studentIds)})
      ORDER BY student_classes.student_id, student_classes.created_at ${order}
    `);
    return new Map(
      rows.map((row) => [
        row.student_id,
        {
          studentId: row.student_id,
          className: row.class_name,
          courseId: row.course_id,
          courseName: row.course_name,
        },
      ]),
    );
  }
}
