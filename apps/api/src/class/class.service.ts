import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  AttendanceStatus,
  ClassPricingMode,
  ClassStatus,
  StaffRole,
  StaffStatus,
  StudentClassStatus,
  UserRole,
} from 'generated/enums';
import {
  ActionHistoryActor,
  ActionHistoryService,
} from 'src/action-history/action-history.service';
import { PaginationQueryDto } from 'src/dtos/pagination.dto';
import {
  CreateClassDto,
  CreateStaffOpsClassDto,
  ClassStatusActionDto,
  ScheduleSlotDto,
  UpdateClassBasicInfoDto,
  UpdateClassDto,
  UpdateClassPricingModeDto,
  UpdateClassScheduleDto,
  UpdateClassStudentsDto,
  UpdateClassStudentTuitionDto,
  UpdateClassTeacherCompensationDto,
  UpdateClassTeachersDto,
} from 'src/dtos/class.dto';
import { Prisma } from '../../generated/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { StaffOperationsAccessService } from 'src/staff-ops/staff-operations-access.service';
import { CalendarService } from 'src/calendar/calendar.service';
import { Logger } from '@nestjs/common';
import { getUserFullNameFromParts } from 'src/common/user-name.util';
import {
  generateClassId,
  isEntityIdUniqueConstraintError,
} from 'src/common/entity-id';
import {
  hasCustomTuitionOverride,
  hasCustomPackageOverride,
  normalizeNullableMoney,
  normalizeStudentClassCustomTuitionMoney,
  resolveDerivedTuitionPerSession,
  resolveEffectivePackageFields,
  resolveEffectiveTuitionPerSession,
  resolveSessionChargeTuitionFee,
} from 'src/common/student-class-tuition.util';
import {
  assertCanEnableBlockPricing,
  clockHmsFromUnknown,
  isBlockPricingMode,
  isFrozenSessionPaymentStatus,
  resolveAllowanceReconstructionBlockCount,
  resolveSnapshotBlockCountForPricingMode,
} from 'src/common/class-pricing-mode.util';
import {
  dualWritePerBlockClassFields,
  perSessionToPerBlock,
  presentCustomAllowanceAsPerSession,
  standardBlockCountFromSlots,
  storeCustomAllowanceFromPerSessionInput,
} from 'src/common/block-pricing.util';
import { resolveClassTeacherCustomAllowanceOnWrite } from './class-teacher-allowance.util';
import {
  redactClassForAccountantView,
  redactClassForTrainingManagerView,
  redactClassListForAccountantView,
  redactClassListForTrainingManagerView,
  redactClassStudentWalletBalances,
  resolveAccountantFinanceView,
} from 'src/common/accountant-finance-redaction.util';
import {
  assertStaffCanReceiveAssignment,
  assertStudentCanJoinActiveWorkflow,
} from 'src/common/profile-status.policy';
import {
  buildClassEndEligibility,
  getClassTeacherSessionSettlement,
} from 'src/common/class-teacher-session-settlement.util';
import { resolveLiveSessionAllowanceSnapshots } from 'src/session/session-allowance.util';
import { computeTrainingManagerSessionSnapshot } from 'src/training-manager/training-manager.utils';
import { syncLessonPlanHeadCommissions } from 'src/payroll/lesson-plan-head-commission.util';

/** `0` is stored as unlimited (same semantics as `null`) across SQL aggregates. */
function normalizeMaxAllowancePerSessionWrite(
  value: number | null | undefined,
): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (value === 0) {
    return null;
  }
  return value;
}

function normalizeRatePercent(
  value: Prisma.Decimal | number | string | null | undefined,
): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return Math.min(100, Math.round(parsed * 100) / 100);
}

function isStudentClassActiveStatus(
  status: StudentClassStatus | null | undefined,
): boolean {
  return status === StudentClassStatus.active;
}

function isClassTeacherActiveStatus(
  status: string | null | undefined,
): boolean {
  return status == null || status === 'active';
}

function toDateOnly(value = new Date()) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function withOptionalReason(description: string, reason?: string | null) {
  const trimmedReason = reason?.trim();
  return trimmedReason
    ? `${description} - Lý do: ${trimmedReason}`
    : description;
}

type StoredClassScheduleEntry = {
  id?: string;
  dayOfWeek?: number;
  from?: string;
  to?: string;
  end?: string;
  teacherId?: string;
  googleCalendarEventId?: string;
  meetLink?: string;
  createdAt?: string;
  deletedAt?: string;
};

type TeacherAssignmentPayload = {
  teacherId: string;
  customAllowance: number | null;
  operatingDeductionRatePercent: number;
};

type TeacherAssignmentRecord = {
  classId?: string;
  teacherId?: string;
  status: string | null;
  customAllowance: number | null;
  operatingDeductionRatePercent: Prisma.Decimal | number | string | null;
  teacher: {
    id: string;
    user: {
      first_name: string | null;
      last_name: string | null;
    } | null;
    status: string | null;
  } | null;
};

@Injectable()
export class ClassService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staffOperationsAccess: StaffOperationsAccessService,
    private readonly actionHistoryService: ActionHistoryService,
    private readonly calendarService: CalendarService,
  ) {}

  private readonly logger = new Logger(ClassService.name);

  // In-memory lock theo classId để chặn 2 request update lịch cùng lớp
  // chạy chồng nhau trong cùng 1 process (bổ sung cho optimistic lock ở DB,
  // vốn là chốt chặn chính cho trường hợp nhiều pod).
  private readonly activeScheduleUpdates = new Set<string>();

  private buildStaffDisplayName(staff: {
    user: {
      first_name: string | null;
      last_name: string | null;
    } | null;
  }) {
    return getUserFullNameFromParts(staff.user) ?? '';
  }

  private mapTeacherAssignment(
    record: TeacherAssignmentRecord,
    options?: {
      standardBlockCount?: number | null;
      storedAsPerBlock?: boolean;
    },
  ) {
    if (!record.teacher) {
      this.logger.warn(
        `Skipping class teacher assignment with missing teacher relation: classId=${record.classId ?? 'unknown'} teacherId=${record.teacherId ?? 'unknown'}`,
      );
      return null;
    }

    if (
      !isClassTeacherActiveStatus(record.status) ||
      record.teacher.status !== StaffStatus.active
    ) {
      return null;
    }

    const operatingDeductionRatePercent = normalizeRatePercent(
      record.operatingDeductionRatePercent,
    );

    return {
      id: record.teacher.id,
      fullName: this.buildStaffDisplayName(record.teacher),
      status: record.teacher.status,
      assignmentStatus: record.status,
      customAllowance: presentCustomAllowanceAsPerSession(
        record.customAllowance,
        options?.standardBlockCount,
        options?.storedAsPerBlock === true,
      ),
      operatingDeductionRatePercent,
    };
  }

  private mapTeacherAssignments(
    records: TeacherAssignmentRecord[],
    options?: {
      standardBlockCount?: number | null;
      storedAsPerBlock?: boolean;
    },
  ) {
    return records.flatMap((record) => {
      const assignment = this.mapTeacherAssignment(record, options);
      return assignment ? [assignment] : [];
    });
  }

  private async loadStandardBlockCount(
    db: Pick<PrismaService, 'classScheduleEntry'> | Prisma.TransactionClient,
    classId: string,
  ): Promise<number | null> {
    const rows = await db.classScheduleEntry.findMany({
      where: { classId, effectiveTo: null },
      select: { from: true, to: true },
    });
    return standardBlockCountFromSlots(rows);
  }

  private isTeacherActor(roles: string[]) {
    return (
      roles.includes(StaffRole.teacher) && !this.hasElevatedClassAccess(roles)
    );
  }

  private hasElevatedClassAccess(roles: string[]) {
    return (
      roles.includes(StaffRole.admin) ||
      roles.includes(StaffRole.assistant) ||
      roles.includes(StaffRole.accountant) ||
      roles.includes(StaffRole.accountant_income) ||
      roles.includes(StaffRole.accountant_expense)
    );
  }

  private shouldScopeStaffClassesToTeacher(roles: string[]) {
    return (
      roles.includes(StaffRole.teacher) && !this.hasElevatedClassAccess(roles)
    );
  }

  private shouldScopeStaffClassesToTrainingManager(roles: string[]) {
    return (
      roles.includes(StaffRole.training) && !this.hasElevatedClassAccess(roles)
    );
  }

  /**
   * Class.schedule JSON không còn được ghi (chỉ giữ backup lịch sử tại thời
   * điểm migrate sang bảng class_schedule_entries). Chuyển 1 row DB sang
   * shape StoredClassScheduleEntry cũ để tái dùng với CalendarService (vẫn
   * nhận StoredClassScheduleEntry[] cho phần đồng bộ Google Calendar).
   */
  private toStoredScheduleEntry(row: {
    id: string;
    dayOfWeek: number;
    from: string;
    to: string;
    teacherId: string | null;
    googleCalendarEventId: string | null;
    meetLink: string | null;
    createdAt: Date;
    effectiveTo?: Date | null;
  }): StoredClassScheduleEntry {
    return {
      id: row.id,
      dayOfWeek: row.dayOfWeek,
      from: row.from,
      to: row.to,
      teacherId: row.teacherId ?? undefined,
      googleCalendarEventId: row.googleCalendarEventId ?? undefined,
      meetLink: row.meetLink ?? undefined,
      createdAt: row.createdAt.toISOString(),
      deletedAt: row.effectiveTo
        ? new Date(row.effectiveTo).toISOString()
        : undefined,
    };
  }

  private parseEffectiveFromDate(value?: string): Date {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return new Date(`${value}T00:00:00.000Z`);
    }
    return toDateOnly();
  }

  private normalizeTimeValue(
    value: Date | string | null | undefined,
  ): string | undefined {
    if (!value) {
      return undefined;
    }

    if (typeof value === 'string') {
      const match = /^(\d{2}:\d{2})(?::(\d{2}))?$/.exec(value.trim());
      if (!match) {
        return undefined;
      }

      return `${match[1]}:${match[2] ?? '00'}`;
    }

    const hours = String(value.getHours()).padStart(2, '0');
    const minutes = String(value.getMinutes()).padStart(2, '0');
    const seconds = String(value.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  /**
   * Diff `dto.schedule`/`dto.removedEntryIds` với các row `class_schedule_entries`
   * đang active (effectiveTo=null) của lớp, rồi áp trực tiếp lên DB trong transaction:
   * slot đổi nội dung/bị xoá → soft-close (effectiveTo), slot mới/thay thế → insert
   * row mới với effectiveFrom tường minh. Không đụng Class.schedule JSON (deprecated).
   */
  private async applyScheduleUpdateTx(
    tx: Prisma.TransactionClient,
    classId: string,
    nextEntries: UpdateClassScheduleDto['schedule'],
    removedEntryIds: string[] | undefined,
  ): Promise<{
    finalActiveTeacherIds: string[];
    closedEntries: StoredClassScheduleEntry[];
  }> {
    const removedEntryIdSet = new Set(removedEntryIds ?? []);
    const existingActive = await tx.classScheduleEntry.findMany({
      where: { classId, effectiveTo: null },
    });
    const existingById = new Map(
      existingActive.map((entry) => [entry.id, entry]),
    );

    const closeIds = new Map<string, Date>();
    const createRows: Prisma.ClassScheduleEntryCreateManyInput[] = [];
    const keptActiveTeacherIds: string[] = [];

    for (const entry of nextEntries) {
      const existingEntry =
        entry.id != null ? existingById.get(entry.id) : undefined;
      const fromNormalized = this.normalizeTimeValue(entry.from) ?? entry.from;
      const toNormalized = this.normalizeTimeValue(entry.to) ?? entry.to;
      const effectiveFromDate = this.parseEffectiveFromDate(
        entry.effectiveFrom,
      );

      const existingEffectiveFrom =
        existingEntry?.effectiveFrom instanceof Date
          ? `${existingEntry.effectiveFrom.getUTCFullYear()}-${String(existingEntry.effectiveFrom.getUTCMonth() + 1).padStart(2, '0')}-${String(existingEntry.effectiveFrom.getUTCDate()).padStart(2, '0')}`
          : null;
      const incomingEffectiveFrom = entry.effectiveFrom ?? null;
      const effectiveFromChanged =
        existingEntry &&
        (incomingEffectiveFrom
          ? incomingEffectiveFrom !== existingEffectiveFrom
          : existingEffectiveFrom !== null);

      const unchanged =
        existingEntry &&
        existingEntry.dayOfWeek === entry.dayOfWeek &&
        existingEntry.from === fromNormalized &&
        existingEntry.to === toNormalized &&
        existingEntry.teacherId === (entry.teacherId ?? null) &&
        !effectiveFromChanged;

      if (unchanged) {
        if (entry.teacherId) keptActiveTeacherIds.push(entry.teacherId);
        continue;
      }

      if (existingEntry) {
        closeIds.set(existingEntry.id, effectiveFromDate);
      }

      createRows.push({
        id: randomUUID(),
        classId,
        teacherId: entry.teacherId ?? null,
        dayOfWeek: entry.dayOfWeek,
        from: fromNormalized,
        to: toNormalized,
        effectiveFrom: effectiveFromDate,
      });
      if (entry.teacherId) keptActiveTeacherIds.push(entry.teacherId);
    }

    const today = toDateOnly();
    for (const removeId of removedEntryIdSet) {
      if (closeIds.has(removeId)) continue;
      if (!existingById.has(removeId)) continue;
      closeIds.set(removeId, today);
    }

    const closedEntries: StoredClassScheduleEntry[] = [];
    for (const [entryId, effectiveTo] of closeIds) {
      const row = existingById.get(entryId);
      if (!row) continue;
      await tx.classScheduleEntry.updateMany({
        where: { id: entryId, classId, effectiveTo: null },
        data: { effectiveTo },
      });
      closedEntries.push(this.toStoredScheduleEntry({ ...row, effectiveTo }));
    }

    if (createRows.length > 0) {
      await tx.classScheduleEntry.createMany({ data: createRows });
    }

    return {
      finalActiveTeacherIds: Array.from(new Set(keptActiveTeacherIds)),
      closedEntries,
    };
  }

  /**
   * Soft-close (effectiveTo = hôm nay) toàn bộ slot lịch cố định đang active
   * của các giáo viên vừa bị gỡ khỏi lớp. Thay cho việc soft-delete trong
   * Class.schedule JSON trước đây.
   */
  private async closeScheduleEntriesForTeachers(
    tx: Prisma.TransactionClient,
    classId: string,
    removedTeacherIds: Set<string>,
  ): Promise<{
    closedEntries: StoredClassScheduleEntry[];
    removedScheduleEntries: number;
  }> {
    if (removedTeacherIds.size === 0) {
      return { closedEntries: [], removedScheduleEntries: 0 };
    }

    const rows = await tx.classScheduleEntry.findMany({
      where: {
        classId,
        effectiveTo: null,
        teacherId: { in: Array.from(removedTeacherIds) },
      },
    });
    if (rows.length === 0) {
      return { closedEntries: [], removedScheduleEntries: 0 };
    }

    const effectiveTo = toDateOnly();
    await tx.classScheduleEntry.updateMany({
      where: { id: { in: rows.map((row) => row.id) } },
      data: { effectiveTo },
    });

    return {
      closedEntries: rows.map((row) =>
        this.toStoredScheduleEntry({ ...row, effectiveTo }),
      ),
      removedScheduleEntries: rows.length,
    };
  }

  /** Soft-close toàn bộ slot lịch cố định đang active của 1 lớp (dùng khi kết thúc lớp). */
  private async closeAllScheduleEntriesForClass(
    tx: Prisma.TransactionClient,
    classId: string,
  ): Promise<StoredClassScheduleEntry[]> {
    const rows = await tx.classScheduleEntry.findMany({
      where: { classId, effectiveTo: null },
    });
    if (rows.length === 0) return [];

    const effectiveTo = toDateOnly();
    await tx.classScheduleEntry.updateMany({
      where: { id: { in: rows.map((row) => row.id) } },
      data: { effectiveTo },
    });
    return rows.map((row) =>
      this.toStoredScheduleEntry({ ...row, effectiveTo }),
    );
  }

  private getActiveClassTeacherWhere(
    classId: string,
    teacherId?: string,
  ): Prisma.ClassTeacherWhereInput {
    return {
      classId,
      ...(teacherId ? { teacherId } : {}),
      OR: [{ status: null }, { status: 'active' }],
    };
  }

  private async deleteFutureMakeupEvents(
    classId: string,
    actor: ActionHistoryActor | undefined,
    teacherId?: string,
  ) {
    const futureMakeupEvents = await this.prisma.makeupScheduleEvent.findMany({
      where: {
        classId,
        ...(teacherId ? { teacherId } : {}),
        date: { gte: toDateOnly() },
      },
      select: { id: true },
      orderBy: { date: 'asc' },
    });

    for (const event of futureMakeupEvents) {
      await this.calendarService.deleteMakeupScheduleEvent(event.id, actor);
    }

    return futureMakeupEvents.length;
  }

  private async getClassDetailSnapshot(
    db: Pick<
      PrismaService,
      | 'class'
      | 'classTeacher'
      | 'studentClass'
      | 'classScheduleEntry'
      | '$queryRaw'
    >,
    id: string,
  ) {
    const classInfo = await db.class.findUnique({
      where: { id },
      include: {
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
        course: true,
      },
    });

    if (!classInfo) {
      return null;
    }

    const classRecord = await db.classTeacher.findMany({
      where: {
        classId: id,
        OR: [{ status: null }, { status: 'active' }],
        teacher: { is: { status: StaffStatus.active } },
      },
      select: {
        classId: true,
        teacherId: true,
        status: true,
        customAllowance: true,
        operatingDeductionRatePercent: true,
        teacher: {
          select: {
            id: true,
            user: {
              select: {
                first_name: true,
                last_name: true,
              },
            },
            status: true,
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { teacherId: 'asc' }],
    });

    const classStudents = await db.studentClass.findMany({
      where: { classId: id },
      include: {
        student: {
          include: {
            customerCareServices: {
              select: {
                staff: {
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
            },
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { studentId: 'asc' }],
    });

    const students = classStudents.map((student) => {
      const customTuitionPerSession = normalizeStudentClassCustomTuitionMoney(
        student.customStudentTuitionPerSession,
      );
      const customTuitionPackageTotal = normalizeStudentClassCustomTuitionMoney(
        student.customTuitionPackageTotal,
      );
      const customTuitionPackageSession =
        normalizeStudentClassCustomTuitionMoney(
          student.customTuitionPackageSession,
        );
      const effectiveTuitionPackageTotal =
        customTuitionPackageTotal ??
        normalizeNullableMoney(classInfo.tuitionPackageTotal);
      const effectiveTuitionPackageSession =
        customTuitionPackageSession ??
        normalizeNullableMoney(classInfo.tuitionPackageSession);
      const effectiveTuitionPerSession = resolveEffectiveTuitionPerSession({
        customTuitionPerSession,
        classTuitionPerSession: classInfo.studentTuitionPerSession,
        effectivePackageTotal: effectiveTuitionPackageTotal,
        effectivePackageSession: effectiveTuitionPackageSession,
        hasCustomPackageOverride: hasCustomPackageOverride({
          customTuitionPackageTotal,
          customTuitionPackageSession,
        }),
      });
      const { customerCareServices, ...studentInfo } = student.student;
      const customerCareStaff = customerCareServices?.staff
        ? {
            id: customerCareServices.staff.id,
            fullName:
              getUserFullNameFromParts(customerCareServices.staff.user) ?? '',
          }
        : null;

      return {
        ...studentInfo,
        status: student.status,
        accountBalance: student.student.accountBalance ?? 0,
        customerCareStaff,
        customTuitionPerSession,
        customTuitionPerBlock: student.customTuitionPerBlock ?? null,
        customTuitionPackageTotal,
        customTuitionPackageSession,
        effectiveTuitionPerSession,
        effectiveTuitionPackageTotal,
        effectiveTuitionPackageSession,
        tuitionPackageSource: hasCustomTuitionOverride({
          customTuitionPerSession,
          customTuitionPackageTotal,
          customTuitionPackageSession,
        })
          ? 'custom'
          : effectiveTuitionPackageTotal != null ||
              effectiveTuitionPackageSession != null ||
              normalizeNullableMoney(classInfo.studentTuitionPerSession) != null
            ? 'class'
            : 'unset',
        totalAttendedSession: student.totalAttendedSession,
      };
    });

    const teacherSessionSettlement = await getClassTeacherSessionSettlement(
      db,
      id,
    );
    const endClassEligibility = buildClassEndEligibility(
      classInfo.status,
      teacherSessionSettlement,
    );

    // Class.schedule JSON không còn được ghi — build schedule trả về từ
    // bảng class_schedule_entries (nguồn dữ liệu chính) để tương thích
    // ngược với FE.
    const scheduleEntryRows = await db.classScheduleEntry.findMany({
      where: { classId: id, effectiveTo: null },
      orderBy: [{ dayOfWeek: 'asc' }, { from: 'asc' }],
    });
    const standardBlockCount = standardBlockCountFromSlots(scheduleEntryRows);
    const teachers = this.mapTeacherAssignments(classRecord, {
      standardBlockCount,
      storedAsPerBlock: classInfo.allowancePerBlockPerStudent != null,
    });
    const schedule = scheduleEntryRows.map((row) => ({
      id: row.id,
      dayOfWeek: row.dayOfWeek,
      from: row.from,
      to: row.to,
      teacherId: row.teacherId ?? undefined,
      googleCalendarEventId: row.googleCalendarEventId ?? undefined,
      meetLink: row.meetLink ?? undefined,
      createdAt: row.createdAt.toISOString(),
      effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
    }));

    return {
      ...classInfo,
      schedule,
      trainingManager: classInfo.trainingManager
        ? {
            id: classInfo.trainingManager.id,
            fullName:
              getUserFullNameFromParts(classInfo.trainingManager.user) ?? '',
          }
        : null,
      teachers,
      students,
      endClassEligibility,
      sessionTuitionTotal: students.reduce(
        (sum, student) =>
          sum +
          (isStudentClassActiveStatus(student.status)
            ? (student.effectiveTuitionPerSession ?? 0)
            : 0),
        0,
      ),
    };
  }

  private async getClassAuditSnapshot(
    db: Pick<
      PrismaService,
      | 'class'
      | 'classTeacher'
      | 'studentClass'
      | 'classScheduleEntry'
      | '$queryRaw'
    >,
    id: string,
  ) {
    return this.getClassDetailSnapshot(db, id);
  }

  async getClasses(
    query: PaginationQueryDto & {
      search?: string;
      status?: string;
      courseId?: string;
      teacherId?: string;
      trainingManagerStaffId?: string;
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
    const normalizedStatus = query.status?.trim();
    const courseId = query.courseId?.trim();
    const teacherId = query.teacherId?.trim();
    const trainingManagerStaffId = query.trainingManagerStaffId?.trim();

    const statusFilter: ClassStatus | undefined =
      normalizedStatus === ClassStatus.running
        ? ClassStatus.running
        : normalizedStatus === ClassStatus.ended
          ? ClassStatus.ended
          : undefined;

    const where = {
      ...(trimmedSearch
        ? {
            name: {
              contains: trimmedSearch,
              mode: 'insensitive' as const,
            },
          }
        : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(courseId ? { courseId } : {}),
      ...(teacherId
        ? {
            teachers: {
              some: {
                teacherId,
                OR: [{ status: null }, { status: 'active' }],
                teacher: { is: { status: StaffStatus.active } },
              },
            },
          }
        : {}),
      ...(trainingManagerStaffId ? { trainingManagerStaffId } : {}),
    };

    const total = await this.prisma.class.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const skip = (safePage - 1) * limit;

    const data = await this.prisma.class.findMany({
      where,
      skip,
      take: limit,
      include: {
        course: true,
      },
      orderBy: [
        {
          course: {
            sortOrder: 'asc',
          },
        },
        {
          name: 'asc',
        },
      ],
    });

    const classIds = data.map((item) => item.id);
    const classTeachers =
      classIds.length > 0
        ? await this.prisma.classTeacher.findMany({
            where: {
              classId: {
                in: classIds,
              },
              OR: [{ status: null }, { status: 'active' }],
              teacher: { is: { status: StaffStatus.active } },
            },
            select: {
              classId: true,
              teacherId: true,
              status: true,
              customAllowance: true,
              operatingDeductionRatePercent: true,
              teacher: {
                select: {
                  id: true,
                  user: {
                    select: {
                      first_name: true,
                      last_name: true,
                    },
                  },
                  status: true,
                },
              },
            },
          })
        : [];

    const teachersByClassId = classTeachers.reduce<
      Record<string, typeof classTeachers>
    >((acc, item) => {
      const current = acc[item.classId] ?? [];
      return {
        ...acc,
        [item.classId]: [...current, item],
      };
    }, {});

    const studentCounts =
      classIds.length > 0
        ? await this.prisma.studentClass.groupBy({
            by: ['classId'],
            where: {
              classId: {
                in: classIds,
              },
              status: StudentClassStatus.active,
            },
            _count: {
              _all: true,
            },
          })
        : [];

    const studentCountByClassId = studentCounts.reduce<Record<string, number>>(
      (acc, item) => ({
        ...acc,
        [item.classId]: item._count._all,
      }),
      {},
    );

    const scheduleRows =
      classIds.length > 0
        ? await this.prisma.classScheduleEntry.findMany({
            where: { classId: { in: classIds }, effectiveTo: null },
            select: { classId: true, from: true, to: true },
          })
        : [];
    const slotsByClassId = scheduleRows.reduce<
      Record<string, Array<{ from: string; to: string }>>
    >((acc, row) => {
      const current = acc[row.classId] ?? [];
      current.push({ from: row.from, to: row.to });
      acc[row.classId] = current;
      return acc;
    }, {});

    return {
      data: data.map((item) => {
        const standardBlockCount = standardBlockCountFromSlots(
          slotsByClassId[item.id] ?? [],
        );
        return {
          ...item,
          studentCount: studentCountByClassId[item.id] ?? 0,
          teachers: this.mapTeacherAssignments(
            teachersByClassId[item.id] ?? [],
            {
              standardBlockCount,
              storedAsPerBlock: item.allowancePerBlockPerStudent != null,
            },
          ),
        };
      }),
      meta: {
        total,
        page: safePage,
        limit,
      },
    };
  }

  async getClassById(id: string) {
    const classInfo = await this.getClassDetailSnapshot(this.prisma, id);

    if (!classInfo) {
      throw new NotFoundException('Class not found');
    }

    return classInfo;
  }

  async listClassesMissingStandardBlockCount() {
    const classes = await this.prisma.class.findMany({
      select: {
        id: true,
        name: true,
        status: true,
        scheduleEntries: {
          where: { effectiveTo: null },
          select: { from: true, to: true },
        },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });

    return classes
      .filter(
        (item) => standardBlockCountFromSlots(item.scheduleEntries) == null,
      )
      .map((item) => ({
        id: item.id,
        name: item.name,
        status: item.status,
        activeSlotCount: item.scheduleEntries.length,
        reason:
          item.scheduleEntries.length === 0
            ? 'no_active_schedule'
            : 'mixed_or_invalid_slot_duration',
      }));
  }

  private getTeacherPayload(data: {
    teachers?: {
      teacher_id: string;
      custom_allowance?: number | null;
      operating_deduction_rate_percent?: number;
      tax_rate_percent?: number;
    }[];
    teacher_ids?: string[];
  }): TeacherAssignmentPayload[] {
    if (data.teachers && data.teachers.length > 0) {
      return data.teachers.map((t) => ({
        teacherId: t.teacher_id,
        customAllowance: t.custom_allowance ?? null,
        operatingDeductionRatePercent: normalizeRatePercent(
          t.operating_deduction_rate_percent ?? t.tax_rate_percent,
        ),
      }));
    }
    if (data.teacher_ids && data.teacher_ids.length > 0) {
      return data.teacher_ids.map((teacherId) => ({
        teacherId,
        customAllowance: null,
        operatingDeductionRatePercent: 0,
      }));
    }
    return [];
  }

  private async assertActiveStaffIds(
    db: Prisma.TransactionClient | PrismaService,
    staffIds: string[],
  ) {
    const uniqueStaffIds = Array.from(new Set(staffIds.filter(Boolean)));
    if (uniqueStaffIds.length === 0) {
      return;
    }

    const staff = await db.staffInfo.findMany({
      where: { id: { in: uniqueStaffIds } },
      select: { id: true, status: true },
    });

    if (staff.length !== uniqueStaffIds.length) {
      throw new NotFoundException('One or more staff not found');
    }

    for (const item of staff) {
      assertStaffCanReceiveAssignment(item.status);
    }
  }

  private async assertActiveStudentIds(
    db: Prisma.TransactionClient | PrismaService,
    studentIds: string[],
  ) {
    const uniqueStudentIds = Array.from(new Set(studentIds.filter(Boolean)));
    if (uniqueStudentIds.length === 0) {
      return;
    }

    const students = await db.studentInfo.findMany({
      where: { id: { in: uniqueStudentIds } },
      select: { id: true, status: true },
    });

    if (students.length !== uniqueStudentIds.length) {
      throw new NotFoundException('One or more students not found');
    }

    for (const student of students) {
      assertStudentCanJoinActiveWorkflow(student.status);
    }
  }

  async getStudentsByClassId(classId: string) {
    const classInfo = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { id: true },
    });

    if (!classInfo) {
      throw new NotFoundException('Class not found');
    }

    const classStudents = await this.prisma.studentClass.findMany({
      where: { classId, status: StudentClassStatus.active },
      include: {
        student: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return classStudents;
  }

  async getClassesForStaff(
    userId: string,
    roleType: UserRole,
    query: PaginationQueryDto & {
      search?: string;
      status?: string;
      courseId?: string;
    },
  ) {
    const actor = await this.staffOperationsAccess.resolveActor(
      userId,
      roleType,
    );
    const classes = await this.getClasses({
      ...query,
      ...(this.shouldScopeStaffClassesToTeacher(actor.roles)
        ? { teacherId: actor.id }
        : {}),
      ...(this.shouldScopeStaffClassesToTrainingManager(actor.roles)
        ? { trainingManagerStaffId: actor.id }
        : {}),
    });

    const financeView = resolveAccountantFinanceView(roleType, actor.roles);
    const accountantScoped = redactClassListForAccountantView(
      classes,
      financeView,
    );

    if (this.shouldScopeStaffClassesToTrainingManager(actor.roles)) {
      return redactClassListForTrainingManagerView(accountantScoped);
    }

    return accountantScoped;
  }

  async getClassByIdForStaff(userId: string, roleType: UserRole, id: string) {
    const actor = await this.staffOperationsAccess.resolveClassViewerActor(
      userId,
      roleType,
    );
    const accessMode =
      await this.staffOperationsAccess.resolveClassViewAccessMode(actor, id);

    const classDetail = await this.getClassById(id);
    const financeView = resolveAccountantFinanceView(roleType, actor.roles);
    let result = redactClassForAccountantView(classDetail, financeView);

    if (accessMode === 'training_manager') {
      result = redactClassForTrainingManagerView(result);
    }

    if (accessMode === 'admin') {
      return redactClassStudentWalletBalances(result, { mode: 'full' });
    }

    if (accessMode === 'teacher' || accessMode === 'training_manager') {
      return redactClassStudentWalletBalances(result, { mode: 'none' });
    }

    if (accessMode === 'customer_care') {
      const assignedStudents = await this.prisma.customerCareService.findMany({
        where: {
          staffId: actor.id,
          student: {
            studentClasses: {
              some: { classId: id },
            },
          },
        },
        select: { studentId: true },
      });
      return redactClassStudentWalletBalances(result, {
        mode: 'allowlist',
        allowedStudentIds: new Set(
          assignedStudents.map((row) => row.studentId),
        ),
      });
    }

    return redactClassStudentWalletBalances(result, { mode: 'none' });
  }

  async createClassForStaff(
    userId: string,
    roleType: UserRole,
    dto: CreateStaffOpsClassDto,
    auditActor?: ActionHistoryActor,
  ) {
    const actor = await this.staffOperationsAccess.resolveActor(
      userId,
      roleType,
    );
    if (this.isTeacherActor(actor.roles)) {
      throw new ForbiddenException('Giáo viên không được phép tạo lớp học.');
    }

    return this.createClass(
      {
        name: dto.name,
        course_id: dto.course_id,
        status: dto.status,
        schedule: dto.schedule,
      },
      auditActor,
    );
  }

  async updateClassScheduleForStaff(
    userId: string,
    roleType: UserRole,
    id: string,
    dto: UpdateClassScheduleDto,
    auditActor?: ActionHistoryActor,
  ) {
    const actor = await this.staffOperationsAccess.resolveActor(
      userId,
      roleType,
    );
    if (this.isTeacherActor(actor.roles)) {
      await this.staffOperationsAccess.assertTeacherAssignedToClass(
        actor.id,
        id,
      );
      await this.assertTeacherOnlyOwnScheduleEntries(actor.id, id, dto);
      // Chỉ Admin/Trợ lý được backdate ngày hiệu lực; gia sư tự sửa lịch của
      // chính mình luôn dùng now() -- bỏ qua effectiveFrom nếu có gửi lên,
      // tránh gia sư tự backdate qua gọi thẳng API (bypass UI).
      dto = {
        ...dto,
        schedule: dto.schedule.map((entry) => ({
          ...entry,
          effectiveFrom: undefined,
        })),
      };
    }
    return this.updateClassSchedule(id, dto, auditActor);
  }

  /**
   * Gia sư tự cập nhật lịch (qua /staff-ops) chỉ được thêm/sửa/xoá đúng slot
   * của chính mình — không được đụng tới slot của gia sư khác trong cùng lớp.
   */
  private async assertTeacherOnlyOwnScheduleEntries(
    teacherId: string,
    classId: string,
    dto: UpdateClassScheduleDto,
  ) {
    const foreignEntry = dto.schedule.find(
      (entry) => entry.teacherId && entry.teacherId !== teacherId,
    );
    if (foreignEntry) {
      throw new ForbiddenException(
        'Gia sư chỉ được thêm/sửa lịch của chính mình.',
      );
    }

    if (dto.removedEntryIds && dto.removedEntryIds.length > 0) {
      const entries = await this.prisma.classScheduleEntry.findMany({
        where: { classId, id: { in: dto.removedEntryIds }, effectiveTo: null },
        select: { id: true, teacherId: true },
      });
      const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
      const foreignRemoval = dto.removedEntryIds.find((entryId) => {
        const entry = entriesById.get(entryId);
        return !entry || entry.teacherId !== teacherId;
      });
      if (foreignRemoval) {
        throw new ForbiddenException(
          'Gia sư chỉ được xoá lịch của chính mình.',
        );
      }
    }
  }

  async createClass(data: CreateClassDto, auditActor?: ActionHistoryActor) {
    return this.withEntityIdRetry(() => this.createClassOnce(data, auditActor));
  }

  private async resolveDefaultCourseId(
    db: Prisma.TransactionClient | PrismaService,
  ) {
    const defaultCourse = await db.course.findFirst({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true },
    });
    if (!defaultCourse) {
      throw new NotFoundException(
        'Không có khoá học nào đang hoạt động. Vui lòng chọn khoá học.',
      );
    }
    return defaultCourse.id;
  }

  /**
   * Resolve courseId and fetch the course's defaultDurationDays.
   * Returns null for defaultDurationDays when the course is unlimited.
   */
  private async resolveCourseWithDuration(
    db: Prisma.TransactionClient | PrismaService,
    courseId?: string,
  ): Promise<{ courseId: string; defaultDurationDays: number | null }> {
    if (courseId) {
      const course = await db.course.findUnique({
        where: { id: courseId },
        select: { id: true, defaultDurationDays: true },
      });
      if (!course) {
        throw new NotFoundException('Khoá học không tồn tại.');
      }
      return {
        courseId: course.id,
        defaultDurationDays: course.defaultDurationDays,
      };
    }
    const defaultCourse = await db.course.findFirst({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, defaultDurationDays: true },
    });
    if (!defaultCourse) {
      throw new NotFoundException(
        'Không có khoá học nào đang hoạt động. Vui lòng chọn khoá học.',
      );
    }
    return {
      courseId: defaultCourse.id,
      defaultDurationDays: defaultCourse.defaultDurationDays,
    };
  }

  /** Chốt ngày hết hạn nội dung từ Course.defaultDurationDays. */
  private computeContentAccessExpiresAt(
    defaultDurationDays: number | null,
  ): Date | null {
    if (defaultDurationDays == null || defaultDurationDays <= 0) {
      return null;
    }
    const now = new Date();
    const expires = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    expires.setUTCDate(expires.getUTCDate() + defaultDurationDays);
    return expires;
  }

  private async createClassOnce(
    data: CreateClassDto,
    auditActor?: ActionHistoryActor,
  ) {
    const hasSchedule = data.schedule && data.schedule.length > 0;
    const standardBlockCount = standardBlockCountFromSlots(
      ((data.schedule ?? []) as ScheduleSlotDto[]).map((entry) => ({
        from: entry.from,
        to: entry.to,
      })),
    );
    const perBlockFields = dualWritePerBlockClassFields({
      allowancePerSessionPerStudent: data.allowance_per_session_per_student,
      maxAllowancePerSession: normalizeMaxAllowancePerSessionWrite(
        data.max_allowance_per_session,
      ),
      studentTuitionPerSession: data.student_tuition_per_session,
      studentTuitionPerBlock: data.student_tuition_per_block,
      standardBlockCount,
    });
    const pricingMode = data.pricing_mode ?? ClassPricingMode.per_session;
    if (isBlockPricingMode(pricingMode)) {
      assertCanEnableBlockPricing(standardBlockCount);
    }

    const classDetail = await this.prisma.$transaction(async (tx) => {
      const resolved = await this.resolveCourseWithDuration(tx, data.course_id);

      const createdClass = await tx.class.create({
        data: {
          id: generateClassId(),
          name: data.name,
          courseId: resolved.courseId,
          status: data.status,
          maxStudents: data.max_students,
          allowancePerSessionPerStudent: data.allowance_per_session_per_student,
          maxAllowancePerSession: normalizeMaxAllowancePerSessionWrite(
            data.max_allowance_per_session,
          ),
          scaleAmount: data.scale_amount,
          studentTuitionPerSession: data.student_tuition_per_session,
          tuitionPackageTotal: data.tuition_package_total,
          tuitionPackageSession: data.tuition_package_session,
          contentAccessExpiresAt: this.computeContentAccessExpiresAt(
            resolved.defaultDurationDays,
          ),
          pricingMode,
          ...perBlockFields,
        },
      });

      if (hasSchedule) {
        const scheduleEntries = data.schedule as unknown as ScheduleSlotDto[];
        await tx.classScheduleEntry.createMany({
          data: scheduleEntries.map((entry) => ({
            id: randomUUID(),
            classId: createdClass.id,
            teacherId: entry.teacherId ?? null,
            dayOfWeek: entry.dayOfWeek,
            from: this.normalizeTimeValue(entry.from) ?? entry.from,
            to: this.normalizeTimeValue(entry.to) ?? entry.to,
            effectiveFrom: this.parseEffectiveFromDate(entry.effectiveFrom),
          })),
        });
      }

      const teacherPayload = this.getTeacherPayload(data);
      await this.assertActiveStaffIds(
        tx,
        teacherPayload.map((teacher) => teacher.teacherId),
      );
      await this.assertActiveStudentIds(tx, data.student_ids ?? []);

      if (teacherPayload.length > 0) {
        await tx.classTeacher.createMany({
          data: teacherPayload.map((t) => ({
            classId: createdClass.id,
            teacherId: t.teacherId,
            customAllowance: storeCustomAllowanceFromPerSessionInput(
              t.customAllowance,
              standardBlockCount,
            ),
            operatingDeductionRatePercent: t.operatingDeductionRatePercent,
            status: 'active',
          })),
        });
      }

      if (data.student_ids && data.student_ids.length > 0) {
        await tx.studentClass.createMany({
          data: data.student_ids.map((studentId) => ({
            classId: createdClass.id,
            studentId,
            status: StudentClassStatus.active,
          })),
        });
      }

      const detail = await this.getClassDetailSnapshot(tx, createdClass.id);
      if (!detail) {
        throw new NotFoundException('Class not found');
      }

      if (auditActor) {
        await this.actionHistoryService.recordCreate(tx, {
          actor: auditActor,
          entityType: 'class',
          entityId: createdClass.id,
          description: 'Tạo lớp học',
          afterValue: detail,
        });
      }

      return detail;
    });

    if (hasSchedule) {
      try {
        await this.calendarService.syncScheduleWithCalendar(classDetail.id, []);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `[ClassService] Failed to sync schedule with Google Calendar for new class ${classDetail.id}: ${message}`,
        );
      }
    }

    return classDetail;
  }

  private async withEntityIdRetry<T>(operation: () => Promise<T>): Promise<T> {
    const maxAttempts = 5;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (!isEntityIdUniqueConstraintError(error)) {
          throw error;
        }
        lastError = error;
      }
    }

    throw new BadRequestException(
      'Could not generate a unique class id. Please retry.',
      { cause: lastError },
    );
  }

  async updateClass(data: UpdateClassDto, auditActor?: ActionHistoryActor) {
    const existingClass = await this.prisma.class.findUnique({
      where: { id: data.id },
      select: { id: true },
    });

    if (!existingClass) {
      throw new NotFoundException('Class not found');
    }

    if (data.schedule !== undefined) {
      throw new BadRequestException(
        'PATCH /class không nhận schedule. Hãy dùng PATCH /class/:id/schedule.',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const beforeValue = auditActor
        ? await this.getClassAuditSnapshot(tx, data.id)
        : null;
      const teacherPayload =
        data.teachers !== undefined || data.teacher_ids !== undefined
          ? this.getTeacherPayload(data)
          : null;
      let removedScheduleEntries = 0;
      let oldSchedule: StoredClassScheduleEntry[] = [];
      let removedTeacherIds: string[] = [];

      if (teacherPayload !== null) {
        await this.assertActiveStaffIds(
          tx,
          teacherPayload.map((teacher) => teacher.teacherId),
        );

        const existingTeachers = await tx.classTeacher.findMany({
          where: { classId: data.id },
          select: {
            teacherId: true,
            operatingDeductionRatePercent: true,
          },
        });
        const nextTeacherIds = new Set(
          teacherPayload.map((teacher) => teacher.teacherId),
        );
        const removedTeacherIdSet = new Set(
          existingTeachers
            .map((teacher) => teacher.teacherId)
            .filter((teacherId) => !nextTeacherIds.has(teacherId)),
        );
        const scheduleRemoval = await this.closeScheduleEntriesForTeachers(
          tx,
          data.id,
          removedTeacherIdSet,
        );
        oldSchedule = scheduleRemoval.closedEntries;
        removedScheduleEntries = scheduleRemoval.removedScheduleEntries;
        removedTeacherIds = Array.from(removedTeacherIdSet);

        await tx.classTeacher.deleteMany({
          where: { classId: data.id },
        });

        const standardBlockCount = await this.loadStandardBlockCount(
          tx,
          data.id,
        );
        if (teacherPayload.length > 0) {
          await tx.classTeacher.createMany({
            data: teacherPayload.map((t) => ({
              classId: data.id,
              teacherId: t.teacherId,
              customAllowance: storeCustomAllowanceFromPerSessionInput(
                t.customAllowance,
                standardBlockCount,
              ),
              operatingDeductionRatePercent: t.operatingDeductionRatePercent,
              status: 'active',
            })),
          });
        }
      }

      if (data.student_ids !== undefined) {
        const normalizedStudentIds = Array.from(new Set(data.student_ids));
        await this.assertActiveStudentIds(tx, normalizedStudentIds);

        const existingStudentClasses = await tx.studentClass.findMany({
          where: { classId: data.id },
          select: { studentId: true },
        });

        const existingStudentIdSet = new Set(
          existingStudentClasses.map((item) => item.studentId),
        );
        const incomingStudentIdSet = new Set(normalizedStudentIds);
        const studentIdsToInactive = existingStudentClasses
          .map((item) => item.studentId)
          .filter((studentId) => !incomingStudentIdSet.has(studentId));

        if (studentIdsToInactive.length > 0) {
          await tx.studentClass.updateMany({
            where: {
              classId: data.id,
              studentId: { in: studentIdsToInactive },
            },
            data: {
              status: StudentClassStatus.inactive,
            },
          });
        }

        if (normalizedStudentIds.length > 0) {
          const studentIdsToActivate = normalizedStudentIds.filter(
            (studentId) => existingStudentIdSet.has(studentId),
          );
          const studentIdsToCreate = normalizedStudentIds.filter(
            (studentId) => !existingStudentIdSet.has(studentId),
          );

          if (studentIdsToActivate.length > 0) {
            await Promise.all(
              studentIdsToActivate.map((studentId) =>
                tx.studentClass.updateMany({
                  where: {
                    classId: data.id,
                    studentId,
                  },
                  data: {
                    status: StudentClassStatus.active,
                    customStudentTuitionPerSession: null,
                    customTuitionPerBlock: null,
                    customTuitionPackageTotal: null,
                    customTuitionPackageSession: null,
                  },
                }),
              ),
            );
          }

          if (studentIdsToCreate.length > 0) {
            await tx.studentClass.createMany({
              data: studentIdsToCreate.map((studentId) => ({
                classId: data.id,
                studentId,
                status: StudentClassStatus.active,
              })),
            });
          }
        }
      }

      const standardBlockCount = await this.loadStandardBlockCount(tx, data.id);
      const updatedClass = await tx.class.update({
        where: { id: data.id },
        data: {
          name: data.name,
          courseId: data.course_id,
          status: data.status,
          maxStudents: data.max_students,
          allowancePerSessionPerStudent: data.allowance_per_session_per_student,
          maxAllowancePerSession: normalizeMaxAllowancePerSessionWrite(
            data.max_allowance_per_session,
          ),
          scaleAmount: data.scale_amount,
          studentTuitionPerSession: data.student_tuition_per_session,
          tuitionPackageTotal: data.tuition_package_total,
          tuitionPackageSession: data.tuition_package_session,
          ...dualWritePerBlockClassFields({
            allowancePerSessionPerStudent:
              data.allowance_per_session_per_student,
            maxAllowancePerSession: normalizeMaxAllowancePerSessionWrite(
              data.max_allowance_per_session,
            ),
            studentTuitionPerSession: data.student_tuition_per_session,
            studentTuitionPerBlock: data.student_tuition_per_block,
            standardBlockCount,
            clearWhenUnknown: true,
          }),
        },
      });

      const classRecord = await tx.classTeacher.findMany({
        where: {
          classId: data.id,
          OR: [{ status: null }, { status: 'active' }],
          teacher: { is: { status: StaffStatus.active } },
        },
        select: {
          classId: true,
          teacherId: true,
          status: true,
          customAllowance: true,
          operatingDeductionRatePercent: true,
          teacher: {
            select: {
              id: true,
              user: {
                select: {
                  first_name: true,
                  last_name: true,
                },
              },
              status: true,
            },
          },
        },
      });

      if (auditActor) {
        const afterValue = await this.getClassAuditSnapshot(tx, data.id);
        if (afterValue) {
          await this.actionHistoryService.recordUpdate(tx, {
            actor: auditActor,
            entityType: 'class',
            entityId: data.id,
            description: 'Cập nhật lớp học',
            beforeValue,
            afterValue,
          });
        }
      }

      return {
        response: {
          ...updatedClass,
          teachers: this.mapTeacherAssignments(classRecord),
        },
        removedScheduleEntries,
        oldSchedule,
        removedTeacherIds,
      };
    });

    if (result.removedScheduleEntries > 0) {
      this.logger.log(
        `[ClassService] Removed fixed schedule slots for removed teachers in class ${data.id}: removedScheduleEntries=${result.removedScheduleEntries}, removedTeacherIds=${result.removedTeacherIds.join(',')}`,
      );
      await this.calendarService.syncScheduleWithCalendar(
        data.id,
        result.oldSchedule,
      );
    }

    return result.response;
  }

  async updateClassBasicInfo(
    id: string,
    dto: UpdateClassBasicInfoDto,
    auditActor?: ActionHistoryActor,
  ) {
    const existing = await this.prisma.class.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new NotFoundException('Class not found');
    }

    if (
      dto.status === ClassStatus.ended &&
      existing.status === ClassStatus.running
    ) {
      throw new BadRequestException(
        'Dùng POST /class/:id/end để kết thúc lớp (đóng roster, gia sư, lịch cố định và lịch bù).',
      );
    }

    const data: Prisma.ClassUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.course_id !== undefined) data.courseId = dto.course_id;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.max_students !== undefined) data.maxStudents = dto.max_students;
    if (dto.allowance_per_session_per_student !== undefined) {
      data.allowancePerSessionPerStudent =
        dto.allowance_per_session_per_student;
    }
    if (dto.max_allowance_per_session !== undefined) {
      data.maxAllowancePerSession = normalizeMaxAllowancePerSessionWrite(
        dto.max_allowance_per_session,
      );
    }
    if (dto.scale_amount !== undefined) data.scaleAmount = dto.scale_amount;
    if (dto.student_tuition_per_session !== undefined) {
      data.studentTuitionPerSession = dto.student_tuition_per_session;
    }
    if (dto.tuition_package_total !== undefined) {
      data.tuitionPackageTotal = dto.tuition_package_total;
    }
    if (dto.tuition_package_session !== undefined) {
      data.tuitionPackageSession = dto.tuition_package_session;
    }
    if (dto.no_attendance !== undefined) {
      data.noAttendance = dto.no_attendance;
    }
    if (dto.content_access_expires_at !== undefined) {
      data.contentAccessExpiresAt = dto.content_access_expires_at
        ? new Date(`${dto.content_access_expires_at}T00:00:00.000Z`)
        : null;
    }

    return this.prisma.$transaction(async (tx) => {
      const beforeValue = auditActor
        ? await this.getClassAuditSnapshot(tx, id)
        : null;
      const standardBlockCount = await this.loadStandardBlockCount(tx, id);
      if (dto.allowance_per_session_per_student !== undefined) {
        Object.assign(
          data,
          dualWritePerBlockClassFields({
            allowancePerSessionPerStudent:
              dto.allowance_per_session_per_student,
            standardBlockCount,
          }),
        );
      }
      if (dto.max_allowance_per_session !== undefined) {
        Object.assign(
          data,
          dualWritePerBlockClassFields({
            maxAllowancePerSession: normalizeMaxAllowancePerSessionWrite(
              dto.max_allowance_per_session,
            ),
            standardBlockCount,
          }),
        );
      }
      if (
        dto.student_tuition_per_session !== undefined ||
        dto.student_tuition_per_block !== undefined
      ) {
        Object.assign(
          data,
          dualWritePerBlockClassFields({
            studentTuitionPerSession: dto.student_tuition_per_session,
            studentTuitionPerBlock: dto.student_tuition_per_block,
            standardBlockCount,
          }),
        );
      }
      await tx.class.update({
        where: { id },
        data,
      });

      const afterValue = await this.getClassAuditSnapshot(tx, id);
      if (!afterValue) {
        throw new NotFoundException('Class not found');
      }

      if (auditActor) {
        await this.actionHistoryService.recordUpdate(tx, {
          actor: auditActor,
          entityType: 'class',
          entityId: id,
          description: 'Cập nhật thông tin cơ bản lớp học',
          beforeValue,
          afterValue,
        });
      }

      return afterValue;
    });
  }

  async updateClassPricingMode(
    id: string,
    dto: UpdateClassPricingModeDto,
    auditActor?: ActionHistoryActor,
  ) {
    const existing = await this.prisma.class.findUnique({
      where: { id },
      select: { id: true, pricingMode: true },
    });
    if (!existing) {
      throw new NotFoundException('Class not found');
    }

    const nextMode = dto.pricing_mode;
    if (isBlockPricingMode(nextMode)) {
      const standardBlockCount = await this.loadStandardBlockCount(
        this.prisma,
        id,
      );
      assertCanEnableBlockPricing(standardBlockCount);
    }

    return this.prisma.$transaction(async (tx) => {
      const beforeValue = auditActor
        ? await this.getClassAuditSnapshot(tx, id)
        : null;

      if (existing.pricingMode !== nextMode) {
        await tx.class.update({
          where: { id },
          data: { pricingMode: nextMode },
        });
        await this.recalculateUnpaidSessionsForPricingMode(tx, id, nextMode);
      }

      const afterValue = await this.getClassAuditSnapshot(tx, id);
      if (!afterValue) {
        throw new NotFoundException('Class not found');
      }

      if (auditActor) {
        await this.actionHistoryService.recordUpdate(tx, {
          actor: auditActor,
          entityType: 'class',
          entityId: id,
          description: 'Đổi chế độ tính tiền lớp học',
          beforeValue,
          afterValue,
        });
      }

      return afterValue;
    });
  }

  private async recalculateUnpaidSessionsForPricingMode(
    tx: Prisma.TransactionClient,
    classId: string,
    pricingMode: ClassPricingMode,
  ) {
    const classRow = await tx.class.findUnique({
      where: { id: classId },
      select: {
        studentTuitionPerSession: true,
        studentTuitionPerBlock: true,
        tuitionPackageTotal: true,
        tuitionPackageSession: true,
        allowancePerSessionPerStudent: true,
        allowancePerBlockPerStudent: true,
        scaleAmount: true,
        trainingManagerStaffId: true,
        trainingManagerRatePercent: true,
      },
    });
    if (!classRow) {
      throw new NotFoundException('Class not found');
    }

    const standardBlockCount = await this.loadStandardBlockCount(tx, classId);
    const classTeachers = await tx.classTeacher.findMany({
      where: { classId },
      select: { teacherId: true, customAllowance: true },
    });
    const customAllowanceByTeacherId = new Map(
      classTeachers.map((row) => [row.teacherId, row.customAllowance]),
    );

    const sessions = await tx.session.findMany({
      where: { classId },
      include: {
        attendance: {
          select: {
            id: true,
            studentId: true,
            status: true,
            tuitionFee: true,
            transactionId: true,
          },
        },
      },
    });

    const studentIds = [
      ...new Set(
        sessions.flatMap((session) =>
          session.attendance.map((row) => row.studentId),
        ),
      ),
    ];
    const studentClasses =
      studentIds.length === 0
        ? []
        : await tx.studentClass.findMany({
            where: { classId, studentId: { in: studentIds } },
            select: {
              studentId: true,
              customStudentTuitionPerSession: true,
              customTuitionPerBlock: true,
              customTuitionPackageTotal: true,
              customTuitionPackageSession: true,
            },
          });
    const studentClassByStudentId = new Map(
      studentClasses.map((row) => [row.studentId, row]),
    );

    for (const session of sessions) {
      if (isFrozenSessionPaymentStatus(session.teacherPaymentStatus)) {
        continue;
      }

      const startHms = clockHmsFromUnknown(session.startTime);
      const endHms = clockHmsFromUnknown(session.endTime);
      const snapshotBlockCount = resolveSnapshotBlockCountForPricingMode({
        pricingMode,
        startTime: startHms,
        endTime: endHms,
        standardBlockCount,
      });
      const reconstructionBlocks = resolveAllowanceReconstructionBlockCount({
        snapshotBlockCount,
        startTime: startHms,
        endTime: endHms,
        standardBlockCount,
      });
      const storedAsPerBlock = classRow.allowancePerBlockPerStudent != null;
      const chargeableCount = session.attendance.filter(
        (row) =>
          row.status === AttendanceStatus.present ||
          row.status === AttendanceStatus.excused,
      ).length;
      const liveAllowance = resolveLiveSessionAllowanceSnapshots({
        pricingMode,
        customAllowanceStored: customAllowanceByTeacherId.get(
          session.teacherId,
        ),
        classDefaultPerStudent: classRow.allowancePerSessionPerStudent,
        classDefaultPerBlock: classRow.allowancePerBlockPerStudent,
        scaleAmount: classRow.scaleAmount,
        reconstructionBlocks,
        storedAsPerBlock,
        snapshotBlockCount,
        chargeableStudentCount: chargeableCount,
        presentCustomAsPerSession: presentCustomAllowanceAsPerSession(
          customAllowanceByTeacherId.get(session.teacherId),
          reconstructionBlocks,
          storedAsPerBlock,
        ),
      });
      const snapshotPerStudentAllowance =
        liveAllowance.snapshotPerStudentAllowance;
      const snapshotScaleAmount = liveAllowance.snapshotScaleAmount;
      const allowanceAmount = liveAllowance.allowanceAmount;

      let tuitionTotal = 0;
      const attendanceIds: string[] = [];

      for (const attendance of session.attendance) {
        const membership = studentClassByStudentId.get(attendance.studentId);
        const packageFields = resolveEffectivePackageFields({
          customTuitionPackageTotal: membership?.customTuitionPackageTotal,
          customTuitionPackageSession: membership?.customTuitionPackageSession,
          classTuitionPackageTotal: classRow.tuitionPackageTotal,
          classTuitionPackageSession: classRow.tuitionPackageSession,
        });
        const isChargeable =
          attendance.status === AttendanceStatus.present ||
          attendance.status === AttendanceStatus.excused;
        const nextFee = isChargeable
          ? resolveSessionChargeTuitionFee({
              pricingMode,
              customTuitionPerSession:
                membership?.customStudentTuitionPerSession,
              customTuitionPerBlock: membership?.customTuitionPerBlock,
              classTuitionPerSession: classRow.studentTuitionPerSession,
              classTuitionPerBlock: classRow.studentTuitionPerBlock,
              effectivePackageTotal: packageFields.effectivePackageTotal,
              effectivePackageSession: packageFields.effectivePackageSession,
              hasCustomPackageOverride: packageFields.hasCustomPackageOverride,
              blockCount: snapshotBlockCount,
            })
          : null;
        const oldFee = attendance.tuitionFee ?? 0;
        const newFee = nextFee ?? 0;
        const delta = oldFee - newFee;
        if (delta !== 0) {
          await tx.studentInfo.update({
            where: { id: attendance.studentId },
            data: { accountBalance: { increment: delta } },
          });
        }
        if (attendance.transactionId != null && newFee !== oldFee) {
          await tx.walletTransactionsHistory.update({
            where: { id: attendance.transactionId },
            data: { amount: newFee },
          });
        }
        await tx.attendance.update({
          where: { id: attendance.id },
          data: { tuitionFee: nextFee },
        });
        tuitionTotal += newFee;
        attendanceIds.push(attendance.id);
      }

      const trainingManagerSnapshot = computeTrainingManagerSessionSnapshot({
        sessionTuitionTotal: tuitionTotal,
        trainingManagerStaffId: classRow.trainingManagerStaffId,
        trainingManagerRatePercent: classRow.trainingManagerRatePercent,
      });

      await tx.session.update({
        where: { id: session.id },
        data: {
          snapshotBlockCount,
          snapshotPerStudentAllowance,
          snapshotScaleAmount,
          allowanceAmount,
          tuitionFee: tuitionTotal,
          trainingManagerStaffId:
            trainingManagerSnapshot.trainingManagerStaffId,
          trainingManagerRatePercent:
            trainingManagerSnapshot.trainingManagerRatePercent,
          trainingManagerAllowanceAmount:
            trainingManagerSnapshot.trainingManagerAllowanceAmount,
          trainingManagerPaymentStatus:
            trainingManagerSnapshot.trainingManagerPaymentStatus,
        },
      });

      await syncLessonPlanHeadCommissions(tx, attendanceIds);
    }
  }

  async updateClassTeachers(
    id: string,
    dto: UpdateClassTeachersDto,
    auditActor?: ActionHistoryActor,
  ) {
    const existing = await this.prisma.class.findUnique({
      where: { id },
      select: { id: true, allowancePerSessionPerStudent: true },
    });
    if (!existing) {
      throw new NotFoundException('Class not found');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const beforeValue = auditActor
        ? await this.getClassAuditSnapshot(tx, id)
        : null;
      const standardBlockCount = await this.loadStandardBlockCount(tx, id);
      await this.assertActiveStaffIds(
        tx,
        dto.teachers.map((teacher) => teacher.teacher_id),
      );

      const existingTeachers = await tx.classTeacher.findMany({
        where: { classId: id },
        select: {
          teacherId: true,
          customAllowance: true,
          operatingDeductionRatePercent: true,
        },
      });
      const existingCustomAllowanceByTeacherId = new Map(
        existingTeachers.map((teacher) => [
          teacher.teacherId,
          teacher.customAllowance,
        ]),
      );
      const teacherPayload = dto.teachers.map((teacher) => ({
        teacherId: teacher.teacher_id,
        customAllowance: resolveClassTeacherCustomAllowanceOnWrite({
          incoming: teacher.custom_allowance,
          existingCustomAllowance: existingCustomAllowanceByTeacherId.get(
            teacher.teacher_id,
          ),
          isExistingAssignment: existingCustomAllowanceByTeacherId.has(
            teacher.teacher_id,
          ),
          standardBlockCount,
        }),
        operatingDeductionRatePercent: normalizeRatePercent(
          teacher.operating_deduction_rate_percent ?? teacher.tax_rate_percent,
        ),
      }));

      const nextTeacherIds = new Set(
        teacherPayload.map((teacher) => teacher.teacherId),
      );
      const removedTeacherIds = new Set(
        existingTeachers
          .map((teacher) => teacher.teacherId)
          .filter((teacherId) => !nextTeacherIds.has(teacherId)),
      );
      await tx.classTeacher.deleteMany({
        where: { classId: id },
      });
      if (teacherPayload.length > 0) {
        await tx.classTeacher.createMany({
          data: teacherPayload.map((t) => ({
            classId: id,
            teacherId: t.teacherId,
            customAllowance: t.customAllowance,
            operatingDeductionRatePercent: t.operatingDeductionRatePercent,
            status: 'active',
          })),
        });
      }

      const { closedEntries: oldSchedule, removedScheduleEntries } =
        await this.closeScheduleEntriesForTeachers(tx, id, removedTeacherIds);

      const afterValue = await this.getClassAuditSnapshot(tx, id);
      if (!afterValue) {
        throw new NotFoundException('Class not found');
      }

      if (auditActor) {
        await this.actionHistoryService.recordUpdate(tx, {
          actor: auditActor,
          entityType: 'class',
          entityId: id,
          description: 'Cập nhật giáo viên của lớp học',
          beforeValue,
          afterValue,
        });
      }

      return {
        afterValue,
        removedScheduleEntries,
        oldSchedule,
        removedTeacherIds: Array.from(removedTeacherIds),
      };
    });

    if (result.removedScheduleEntries > 0) {
      this.logger.log(
        `[ClassService] Removed fixed schedule slots for removed teachers in class ${id}: removedScheduleEntries=${result.removedScheduleEntries}, removedTeacherIds=${result.removedTeacherIds.join(',')}`,
      );
      await this.calendarService.syncScheduleWithCalendar(
        id,
        result.oldSchedule,
      );
    }

    return result.afterValue;
  }

  async updateClassTeacherCompensation(
    id: string,
    dto: UpdateClassTeacherCompensationDto,
    auditActor?: ActionHistoryActor,
  ) {
    const teacherIds = dto.teachers.map((teacher) => teacher.teacher_id);
    const existing = await this.prisma.class.findUnique({
      where: { id },
      select: {
        id: true,
        teachers: {
          select: {
            teacherId: true,
            operatingDeductionRatePercent: true,
          },
        },
      },
    });
    if (!existing) {
      throw new NotFoundException('Class not found');
    }

    const existingTeacherIds = new Set(
      existing.teachers.map((teacher) => teacher.teacherId),
    );
    const existingRateByTeacherId = new Map(
      existing.teachers.map((teacher) => [
        teacher.teacherId,
        normalizeRatePercent(teacher.operatingDeductionRatePercent),
      ]),
    );
    const invalidTeacherIds = teacherIds.filter(
      (teacherId) => !existingTeacherIds.has(teacherId),
    );
    if (invalidTeacherIds.length > 0) {
      throw new BadRequestException(
        'Only existing class teachers can have compensation updated',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const beforeValue = auditActor
        ? await this.getClassAuditSnapshot(tx, id)
        : null;
      const standardBlockCount = await this.loadStandardBlockCount(tx, id);

      for (const teacher of dto.teachers) {
        const currentOperatingDeductionRatePercent =
          existingRateByTeacherId.get(teacher.teacher_id) ?? 0;
        const nextOperatingDeductionRatePercent =
          teacher.operating_deduction_rate_percent == null &&
          teacher.tax_rate_percent == null
            ? currentOperatingDeductionRatePercent
            : normalizeRatePercent(
                teacher.operating_deduction_rate_percent ??
                  teacher.tax_rate_percent,
              );

        const data: {
          customAllowance?: number | null;
          operatingDeductionRatePercent: number;
        } = {
          operatingDeductionRatePercent: nextOperatingDeductionRatePercent,
        };
        if (teacher.custom_allowance !== undefined) {
          data.customAllowance = storeCustomAllowanceFromPerSessionInput(
            normalizeNullableMoney(teacher.custom_allowance),
            standardBlockCount,
          );
        }

        await tx.classTeacher.update({
          where: {
            classId_teacherId: {
              classId: id,
              teacherId: teacher.teacher_id,
            },
          },
          data,
        });
      }

      const afterValue = await this.getClassAuditSnapshot(tx, id);
      if (!afterValue) {
        throw new NotFoundException('Class not found');
      }

      if (auditActor) {
        await this.actionHistoryService.recordUpdate(tx, {
          actor: auditActor,
          entityType: 'class',
          entityId: id,
          description: 'Cập nhật trợ cấp và % vận hành gia sư của lớp học',
          beforeValue,
          afterValue,
        });
      }

      return afterValue;
    });
  }

  async updateClassStudentTuition(
    id: string,
    dto: UpdateClassStudentTuitionDto,
    auditActor?: ActionHistoryActor,
  ) {
    const existing = await this.prisma.class.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Class not found');
    }

    const studentClass = await this.prisma.studentClass.findFirst({
      where: { classId: id, studentId: dto.student_id },
      select: { id: true },
    });
    if (!studentClass) {
      throw new NotFoundException('Student is not enrolled in this class');
    }

    return this.prisma.$transaction(async (tx) => {
      const beforeValue = auditActor
        ? await this.getClassAuditSnapshot(tx, id)
        : null;

      const pkgTotal = normalizeStudentClassCustomTuitionMoney(
        dto.custom_tuition_package_total,
      );
      const pkgSession = normalizeStudentClassCustomTuitionMoney(
        dto.custom_tuition_package_session,
      );
      const perSession = normalizeStudentClassCustomTuitionMoney(
        dto.custom_tuition_per_session,
      );
      const derivedPerSession =
        resolveDerivedTuitionPerSession(pkgTotal, pkgSession) ?? perSession;
      const standardBlockCount = await this.loadStandardBlockCount(tx, id);

      await tx.studentClass.update({
        where: { id: studentClass.id },
        data: {
          customTuitionPackageTotal: pkgTotal,
          customTuitionPackageSession: pkgSession,
          customStudentTuitionPerSession: derivedPerSession,
          customTuitionPerBlock: perSessionToPerBlock(
            derivedPerSession,
            standardBlockCount,
          ),
        },
      });

      const afterValue = await this.getClassAuditSnapshot(tx, id);
      if (!afterValue) {
        throw new NotFoundException('Class not found');
      }

      if (auditActor) {
        await this.actionHistoryService.recordUpdate(tx, {
          actor: auditActor,
          entityType: 'class',
          entityId: id,
          description: 'Cập nhật học phí riêng học sinh trong lớp',
          beforeValue,
          afterValue,
        });
      }

      return afterValue;
    });
  }

  async updateClassSchedule(
    id: string,
    dto: UpdateClassScheduleDto,
    auditActor?: ActionHistoryActor,
  ) {
    if (this.activeScheduleUpdates.has(id)) {
      throw new ConflictException(
        'Lịch học của lớp này đang được cập nhật bởi một request khác. Vui lòng thử lại sau giây lát.',
      );
    }
    this.activeScheduleUpdates.add(id);
    try {
      return await this.updateClassScheduleLocked(id, dto, auditActor);
    } finally {
      this.activeScheduleUpdates.delete(id);
    }
  }

  private async updateClassScheduleLocked(
    id: string,
    dto: UpdateClassScheduleDto,
    auditActor?: ActionHistoryActor,
  ) {
    const existing = await this.prisma.class.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!existing) {
      throw new NotFoundException('Class not found');
    }

    if (dto.expectedUpdatedAt) {
      const expected = new Date(dto.expectedUpdatedAt).getTime();
      if (
        !Number.isNaN(expected) &&
        expected !== existing.updatedAt.getTime()
      ) {
        throw new ConflictException(
          'Lịch học của lớp vừa được người khác cập nhật. Vui lòng tải lại và thử lại.',
        );
      }
    }

    const existingActiveEntries = await this.prisma.classScheduleEntry.findMany(
      {
        where: { classId: id, effectiveTo: null },
      },
    );
    const oldScheduleEntries = existingActiveEntries.map((row) =>
      this.toStoredScheduleEntry(row),
    );
    const existingActiveById = new Map(
      existingActiveEntries.map((entry) => [entry.id, entry]),
    );

    const teacherIds = Array.from(
      new Set(
        dto.schedule
          .map((entry) => entry.teacherId)
          .filter((teacherId): teacherId is string => !!teacherId),
      ),
    );

    if (dto.schedule.some((entry) => !entry.teacherId)) {
      throw new BadRequestException(
        'Mỗi khung giờ học phải chọn đúng 1 gia sư chịu trách nhiệm.',
      );
    }

    const classTeachers = await this.prisma.classTeacher.findMany({
      where: { classId: id },
      select: {
        teacherId: true,
        teacher: {
          select: {
            user: {
              select: {
                email: true,
              },
            },
          },
        },
      },
    });

    const classTeacherIds = new Set(
      classTeachers.map((teacherRecord) => teacherRecord.teacherId),
    );
    const invalidTeacherId = teacherIds.find(
      (teacherId) => !classTeacherIds.has(teacherId),
    );
    if (invalidTeacherId) {
      throw new BadRequestException(
        'Gia sư chịu trách nhiệm phải thuộc danh sách gia sư hiện có của lớp.',
      );
    }

    // Find modified/deleted entry IDs to check for affected future makeup events
    const changedOrDeletedEntryIds = new Set<string>(dto.removedEntryIds ?? []);
    for (const entry of dto.schedule) {
      if (!entry.id) continue;
      const oldEntry = existingActiveById.get(entry.id);
      if (!oldEntry) continue;
      const fromNormalized = this.normalizeTimeValue(entry.from) ?? entry.from;
      const toNormalized = this.normalizeTimeValue(entry.to) ?? entry.to;
      const changed =
        oldEntry.dayOfWeek !== entry.dayOfWeek ||
        oldEntry.from !== fromNormalized ||
        oldEntry.to !== toNormalized ||
        oldEntry.teacherId !== (entry.teacherId ?? null);
      if (changed) {
        changedOrDeletedEntryIds.add(entry.id);
      }
    }

    const warnings: string[] = [];
    if (changedOrDeletedEntryIds.size > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const affectedMakeupEvents =
        await this.prisma.makeupScheduleEvent.findMany({
          where: {
            classId: id,
            baselineScheduleEntryId: {
              in: Array.from(changedOrDeletedEntryIds),
            },
            date: { gte: today },
          },
          include: {
            teacher: {
              include: {
                user: {
                  select: { first_name: true, last_name: true },
                },
              },
            },
          },
        });

      for (const event of affectedMakeupEvents) {
        const eventDateStr = event.date.toLocaleDateString('vi-VN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
        const teacherName = event.teacher
          ? `${event.teacher.user?.first_name ?? ''} ${event.teacher.user?.last_name ?? ''}`.trim()
          : 'chưa xác định';
        warnings.push(
          `Buổi học bù ngày ${eventDateStr} do gia sư ${teacherName} phụ trách bị ảnh hưởng do lịch học cố định gốc bị thay đổi/xoá.`,
        );
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const beforeValue = auditActor
        ? await this.getClassAuditSnapshot(tx, id)
        : null;

      // Optimistic lock: chỉ ghi nếu chưa ai khác cập nhật lớp kể từ lúc ta
      // đọc `existing` ở đầu hàm. Nếu count=0 nghĩa là đã có request khác
      // xen giữa (đã đổi updatedAt) → coi như xung đột, KHÔNG được ghi đè.
      // Class.schedule JSON không còn được ghi — chỉ bump updatedAt để giữ
      // nguyên semantics optimistic lock, dữ liệu lịch thật nằm ở
      // class_schedule_entries (ghi bởi applyScheduleUpdateTx bên dưới).
      const writeResult = await tx.class.updateMany({
        where: { id, updatedAt: existing.updatedAt },
        data: { updatedAt: new Date() },
      });
      if (writeResult.count === 0) {
        throw new ConflictException(
          'Lịch học của lớp vừa được người khác cập nhật. Vui lòng tải lại và thử lại.',
        );
      }

      await this.applyScheduleUpdateTx(
        tx,
        id,
        dto.schedule,
        dto.removedEntryIds,
      );

      const classRates = await tx.class.findUnique({
        where: { id },
        select: {
          allowancePerSessionPerStudent: true,
          maxAllowancePerSession: true,
        },
      });
      const standardBlockCount = await this.loadStandardBlockCount(tx, id);
      if (classRates) {
        await tx.class.update({
          where: { id },
          data: dualWritePerBlockClassFields({
            allowancePerSessionPerStudent:
              classRates.allowancePerSessionPerStudent,
            maxAllowancePerSession: classRates.maxAllowancePerSession,
            standardBlockCount,
            clearWhenUnknown: true,
          }),
        });
      }

      const afterValue = await this.getClassAuditSnapshot(tx, id);
      if (!afterValue) {
        throw new NotFoundException('Class not found');
      }

      if (auditActor) {
        await this.actionHistoryService.recordUpdate(tx, {
          actor: auditActor,
          entityType: 'class',
          entityId: id,
          description: 'Cập nhật lịch học của lớp học',
          beforeValue,
          afterValue,
        });
      }

      return afterValue;
    });

    // Sync with Google Calendar after schedule change
    // Pass old schedule so sync can delete old events before creating new ones
    try {
      this.logger.log(
        `[ClassService] Calling syncScheduleWithCalendar for class ${id} after schedule update, oldSchedule entries: ${oldScheduleEntries.length}`,
      );
      await this.calendarService.syncScheduleWithCalendar(
        id,
        oldScheduleEntries,
      );
      this.logger.log(
        `[ClassService] syncScheduleWithCalendar completed for class ${id}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[ClassService] Failed to sync schedule with Google Calendar for class ${id}: ${message}`,
      );
      throw err;
    }

    return {
      class: result,
      warnings,
    };
  }

  async updateClassStudents(
    id: string,
    dto: UpdateClassStudentsDto,
    auditActor?: ActionHistoryActor,
  ) {
    const existing = await this.prisma.class.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Class not found');
    }

    const deduplicatedStudents = Array.from(
      new Map(dto.students.map((student) => [student.id, student])).values(),
    );
    const normalizedStudentIds = deduplicatedStudents.map(
      (student) => student.id,
    );

    return this.prisma.$transaction(async (tx) => {
      const beforeValue = auditActor
        ? await this.getClassAuditSnapshot(tx, id)
        : null;
      const standardBlockCount = await this.loadStandardBlockCount(tx, id);
      await this.assertActiveStudentIds(tx, normalizedStudentIds);

      const existingStudentClasses = await tx.studentClass.findMany({
        where: { classId: id },
        select: { studentId: true },
      });
      const existingStudentIdSet = new Set(
        existingStudentClasses.map((item) => item.studentId),
      );
      const incomingStudentIdSet = new Set(normalizedStudentIds);
      const studentIdsToInactive = existingStudentClasses
        .map((item) => item.studentId)
        .filter((studentId) => !incomingStudentIdSet.has(studentId));

      if (studentIdsToInactive.length > 0) {
        await tx.studentClass.updateMany({
          where: {
            classId: id,
            studentId: { in: studentIdsToInactive },
          },
          data: {
            status: StudentClassStatus.inactive,
          },
        });
      }

      if (deduplicatedStudents.length > 0) {
        await Promise.all(
          deduplicatedStudents.map((student) => {
            const pkgTotal = normalizeStudentClassCustomTuitionMoney(
              student.custom_tuition_package_total,
            );
            const pkgSession = normalizeStudentClassCustomTuitionMoney(
              student.custom_tuition_package_session,
            );
            const perSession = normalizeStudentClassCustomTuitionMoney(
              student.custom_tuition_per_session,
            );

            const derivedPerSession =
              resolveDerivedTuitionPerSession(pkgTotal, pkgSession) ??
              perSession;

            const data = {
              status: StudentClassStatus.active,
              customStudentTuitionPerSession: derivedPerSession,
              customTuitionPerBlock: perSessionToPerBlock(
                derivedPerSession,
                standardBlockCount,
              ),
              customTuitionPackageTotal: pkgTotal,
              customTuitionPackageSession: pkgSession,
            };

            if (existingStudentIdSet.has(student.id)) {
              return tx.studentClass.updateMany({
                where: {
                  classId: id,
                  studentId: student.id,
                },
                data,
              });
            }

            return tx.studentClass.create({
              data: {
                classId: id,
                studentId: student.id,
                ...data,
              },
            });
          }),
        );
      }

      const afterValue = await this.getClassAuditSnapshot(tx, id);
      if (!afterValue) {
        throw new NotFoundException('Class not found');
      }

      if (auditActor) {
        await this.actionHistoryService.recordUpdate(tx, {
          actor: auditActor,
          entityType: 'class',
          entityId: id,
          description: 'Cập nhật học sinh của lớp học',
          beforeValue,
          afterValue,
        });
      }

      return afterValue;
    });
  }

  async endClass(
    id: string,
    dto: ClassStatusActionDto = {},
    auditActor?: ActionHistoryActor,
  ) {
    const settlement = await getClassTeacherSessionSettlement(this.prisma, id);
    if (!settlement.canEndClass) {
      throw new BadRequestException(
        settlement.blockReason ??
          'Chưa thể kết thúc lớp khi còn buổi học chưa thanh toán trợ cấp gia sư.',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const beforeValue = await this.getClassAuditSnapshot(tx, id);
      if (!beforeValue) {
        throw new NotFoundException('Class not found');
      }
      if (beforeValue.status === ClassStatus.ended) {
        throw new BadRequestException('Lớp đã kết thúc.');
      }

      const oldSchedule = await this.closeAllScheduleEntriesForClass(tx, id);

      await tx.class.update({
        where: { id },
        data: {
          status: ClassStatus.ended,
        },
      });
      await tx.studentClass.updateMany({
        where: { classId: id, status: StudentClassStatus.active },
        data: { status: StudentClassStatus.inactive },
      });
      await tx.classTeacher.updateMany({
        where: this.getActiveClassTeacherWhere(id),
        data: { status: 'inactive' },
      });

      const afterValue = await this.getClassAuditSnapshot(tx, id);
      if (!afterValue) {
        throw new NotFoundException('Class not found');
      }

      if (auditActor) {
        await this.actionHistoryService.recordUpdate(tx, {
          actor: auditActor,
          entityType: 'class',
          entityId: id,
          description: withOptionalReason('Kết thúc lớp học', dto.reason),
          beforeValue,
          afterValue,
        });
      }

      return { oldSchedule };
    });

    await this.calendarService.syncScheduleWithCalendar(id, result.oldSchedule);
    await this.deleteFutureMakeupEvents(id, auditActor);

    return this.getClassById(id);
  }

  async stopClassTeacher(
    classId: string,
    teacherId: string,
    dto: ClassStatusActionDto = {},
    auditActor?: ActionHistoryActor,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const beforeValue = await this.getClassAuditSnapshot(tx, classId);
      if (!beforeValue) {
        throw new NotFoundException('Class not found');
      }
      if (beforeValue.status === ClassStatus.ended) {
        throw new BadRequestException('Lớp đã kết thúc.');
      }

      const assignment = await tx.classTeacher.findUnique({
        where: { classId_teacherId: { classId, teacherId } },
        select: { status: true },
      });
      if (!assignment) {
        throw new NotFoundException('Không tìm thấy phân công gia sư cho lớp.');
      }
      if (assignment.status === 'inactive') {
        throw new BadRequestException('Gia sư đã nghỉ dạy lớp này.');
      }

      await tx.classTeacher.update({
        where: { classId_teacherId: { classId, teacherId } },
        data: { status: 'inactive' },
      });

      const scheduleRemoval = await this.closeScheduleEntriesForTeachers(
        tx,
        classId,
        new Set([teacherId]),
      );

      const afterValue = await this.getClassAuditSnapshot(tx, classId);
      if (!afterValue) {
        throw new NotFoundException('Class not found');
      }

      if (auditActor) {
        await this.actionHistoryService.recordUpdate(tx, {
          actor: auditActor,
          entityType: 'class',
          entityId: classId,
          description: withOptionalReason(
            'Chuyển gia sư sang nghỉ dạy theo lớp',
            dto.reason,
          ),
          beforeValue,
          afterValue,
        });
      }

      return { scheduleRemoval };
    });

    if (result.scheduleRemoval.removedScheduleEntries > 0) {
      await this.calendarService.syncScheduleWithCalendar(
        classId,
        result.scheduleRemoval.closedEntries,
      );
    }
    await this.deleteFutureMakeupEvents(classId, auditActor, teacherId);

    return this.getClassById(classId);
  }

  async deleteClass(id: string, auditActor?: ActionHistoryActor) {
    return this.prisma.$transaction(async (tx) => {
      const beforeValue = await this.getClassAuditSnapshot(tx, id);
      if (!beforeValue) {
        throw new NotFoundException('Class not found');
      }

      const deletedClass = await tx.class.delete({
        where: { id },
      });

      if (auditActor) {
        await this.actionHistoryService.recordDelete(tx, {
          actor: auditActor,
          entityType: 'class',
          entityId: id,
          description: 'Xóa lớp học',
          beforeValue,
        });
      }

      return deletedClass;
    });
  }
}
