import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  ClassStatus,
  ClassType,
  StaffRole,
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
  UpdateClassBasicInfoDto,
  UpdateClassDto,
  UpdateClassScheduleDto,
  UpdateClassStudentsDto,
  UpdateClassTeachersDto,
} from 'src/dtos/class.dto';
import { Prisma } from '../../generated/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { StaffOperationsAccessService } from 'src/staff-ops/staff-operations-access.service';
import { CalendarService } from 'src/calendar/calendar.service';
import { Logger } from '@nestjs/common';
import { getUserFullNameFromParts } from 'src/common/user-name.util';
import {
  hasCustomTuitionOverride,
  normalizeNullableMoney,
  normalizeStudentClassCustomTuitionMoney,
  resolveDerivedTuitionPerSession,
  resolveEffectiveTuitionPerSession,
} from 'src/common/student-class-tuition.util';

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

function toDateOnly(value = new Date()) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
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
};

type TeacherAssignmentPayload = {
  teacherId: string;
  customAllowance: number | null;
  operatingDeductionRatePercent: number;
};

type TeacherAssignmentRecord = {
  customAllowance: number | null;
  operatingDeductionRatePercent: Prisma.Decimal | number | string | null;
  teacher: {
    id: string;
    user: {
      first_name: string | null;
      last_name: string | null;
    } | null;
    status: string | null;
  };
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

  private buildStaffDisplayName(staff: {
    user: {
      first_name: string | null;
      last_name: string | null;
    } | null;
  }) {
    return getUserFullNameFromParts(staff.user) ?? '';
  }

  private mapTeacherAssignment(record: TeacherAssignmentRecord) {
    const operatingDeductionRatePercent = normalizeRatePercent(
      record.operatingDeductionRatePercent,
    );

    return {
      id: record.teacher.id,
      fullName: this.buildStaffDisplayName(record.teacher),
      status: record.teacher.status,
      customAllowance: record.customAllowance,
      operatingDeductionRatePercent,
      taxRatePercent: operatingDeductionRatePercent,
    };
  }

  private async appendOperatingDeductionRateHistory(
    db: Pick<PrismaService, 'classTeacherOperatingDeductionRate'>,
    rows: Array<{
      classId: string;
      teacherId: string;
      operatingDeductionRatePercent: number;
      effectiveFrom?: Date;
    }>,
  ) {
    if (rows.length === 0) {
      return;
    }

    const deduplicatedRows = Array.from(
      new Map(
        rows.map((row) => {
          const effectiveFrom = toDateOnly(row.effectiveFrom);
          return [
            `${row.classId}:${row.teacherId}:${effectiveFrom.toISOString()}`,
            {
              classId: row.classId,
              teacherId: row.teacherId,
              ratePercent: row.operatingDeductionRatePercent,
              effectiveFrom,
            },
          ] as const;
        }),
      ).values(),
    );

    await Promise.all(
      deduplicatedRows.map((row) =>
        db.classTeacherOperatingDeductionRate.upsert({
          where: {
            classId_teacherId_effectiveFrom: {
              classId: row.classId,
              teacherId: row.teacherId,
              effectiveFrom: row.effectiveFrom,
            },
          },
          create: row,
          update: {
            ratePercent: row.ratePercent,
          },
        }),
      ),
    );
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
      roles.includes(StaffRole.accountant)
    );
  }

  private shouldScopeStaffClassesToTeacher(roles: string[]) {
    return (
      roles.includes(StaffRole.teacher) && !this.hasElevatedClassAccess(roles)
    );
  }

  private getStoredClassScheduleEntries(
    schedule: Prisma.JsonValue | null | undefined,
  ): StoredClassScheduleEntry[] {
    if (!Array.isArray(schedule)) {
      return [];
    }

    return schedule
      .filter(
        (entry) =>
          typeof entry === 'object' && entry !== null && !Array.isArray(entry),
      )
      .map((rawEntry) => {
        const entry = rawEntry as Prisma.JsonObject;

        return {
          id: typeof entry.id === 'string' ? entry.id : undefined,
          dayOfWeek:
            typeof entry.dayOfWeek === 'number' ? entry.dayOfWeek : undefined,
          from: typeof entry.from === 'string' ? entry.from : undefined,
          to: typeof entry.to === 'string' ? entry.to : undefined,
          end: typeof entry.end === 'string' ? entry.end : undefined,
          teacherId:
            typeof entry.teacherId === 'string' ? entry.teacherId : undefined,
          googleCalendarEventId:
            typeof entry.googleCalendarEventId === 'string'
              ? entry.googleCalendarEventId
              : undefined,
          meetLink:
            typeof entry.meetLink === 'string' ? entry.meetLink : undefined,
        };
      });
  }

  private serializeStoredClassScheduleEntries(
    entries: Array<{
      id?: string;
      dayOfWeek?: number;
      from?: string;
      to?: string;
      end?: string;
      teacherId?: string;
      googleCalendarEventId?: string;
      meetLink?: string;
    }>,
  ): Prisma.InputJsonValue {
    return entries.map((entry) => ({
      ...(entry.id ? { id: entry.id } : {}),
      ...(typeof entry.dayOfWeek === 'number'
        ? { dayOfWeek: entry.dayOfWeek }
        : {}),
      ...(entry.from ? { from: entry.from } : {}),
      ...(entry.to || entry.end ? { to: entry.to ?? entry.end } : {}),
      ...(entry.teacherId ? { teacherId: entry.teacherId } : {}),
      ...(entry.googleCalendarEventId
        ? { googleCalendarEventId: entry.googleCalendarEventId }
        : {}),
      ...(entry.meetLink ? { meetLink: entry.meetLink } : {}),
    })) as Prisma.InputJsonValue;
  }

  private mergeScheduleEntriesWithExisting(
    nextEntries: UpdateClassScheduleDto['schedule'],
    existingSchedule: Prisma.JsonValue | null | undefined,
  ) {
    const existingById = new Map(
      this.getStoredClassScheduleEntries(existingSchedule)
        .filter(
          (entry): entry is StoredClassScheduleEntry & { id: string } =>
            typeof entry.id === 'string' && entry.id.length > 0,
        )
        .map((entry) => [entry.id, entry]),
    );

    return nextEntries.map((entry) => {
      const existingEntry =
        entry.id != null ? existingById.get(entry.id) : undefined;

      return {
        id: entry.id,
        dayOfWeek: entry.dayOfWeek,
        from: entry.from,
        to: entry.to,
        teacherId: entry.teacherId,
        googleCalendarEventId: existingEntry?.googleCalendarEventId,
        meetLink: existingEntry?.meetLink,
      };
    });
  }

  private removeScheduleEntriesForTeachers(
    schedule: Prisma.JsonValue | null | undefined,
    removedTeacherIds: Set<string>,
  ): {
    oldSchedule: StoredClassScheduleEntry[];
    nextSchedule: StoredClassScheduleEntry[];
    removedScheduleEntries: number;
  } {
    const oldSchedule = this.getStoredClassScheduleEntries(schedule);
    if (removedTeacherIds.size === 0) {
      return {
        oldSchedule,
        nextSchedule: oldSchedule,
        removedScheduleEntries: 0,
      };
    }

    const nextSchedule = oldSchedule.filter(
      (entry) => !entry.teacherId || !removedTeacherIds.has(entry.teacherId),
    );

    return {
      oldSchedule,
      nextSchedule,
      removedScheduleEntries: oldSchedule.length - nextSchedule.length,
    };
  }

  private ensureScheduleEntryIds(
    schedule: UpdateClassScheduleDto['schedule'],
  ): UpdateClassScheduleDto['schedule'] {
    return schedule.map((entry) => ({
      ...entry,
      id: entry.id ?? randomUUID(),
    }));
  }

  private async getClassAuditSnapshot(
    db: Pick<PrismaService, 'class' | 'classTeacher' | 'studentClass'>,
    id: string,
  ) {
    const classInfo = await db.class.findUnique({
      where: { id },
    });

    if (!classInfo) {
      return null;
    }

    const classRecord = await db.classTeacher.findMany({
      where: { classId: id },
      select: {
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

    const teachers = classRecord.map((record) =>
      this.mapTeacherAssignment(record),
    );

    const classStudents = await db.studentClass.findMany({
      where: { classId: id },
      include: {
        student: true,
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
      });

      return {
        ...student.student,
        status: student.status,
        customTuitionPerSession,
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

    return {
      ...classInfo,
      teachers,
      students,
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

  async getClasses(
    query: PaginationQueryDto & {
      search?: string;
      status?: string;
      type?: string;
      teacherId?: string;
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
    const normalizedType = query.type?.trim();
    const teacherId = query.teacherId?.trim();

    const statusFilter: ClassStatus | undefined =
      normalizedStatus === ClassStatus.running
        ? ClassStatus.running
        : normalizedStatus === ClassStatus.ended
          ? ClassStatus.ended
          : undefined;

    const typeFilter: ClassType | undefined =
      normalizedType === ClassType.vip
        ? ClassType.vip
        : normalizedType === ClassType.basic
          ? ClassType.basic
          : normalizedType === ClassType.advance
            ? ClassType.advance
            : normalizedType === ClassType.hardcore
              ? ClassType.hardcore
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
      ...(typeFilter ? { type: typeFilter } : {}),
      ...(teacherId
        ? {
            teachers: {
              some: {
                teacherId,
              },
            },
          }
        : {}),
    };

    const total = await this.prisma.class.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const skip = (safePage - 1) * limit;

    const data = await this.prisma.class.findMany({
      where,
      skip,
      take: limit,
      orderBy: [
        {
          type: 'desc',
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
            },
            select: {
              classId: true,
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

    return {
      data: data.map((item) => ({
        ...item,
        studentCount: studentCountByClassId[item.id] ?? 0,
        teachers: (teachersByClassId[item.id] ?? []).map((record) =>
          this.mapTeacherAssignment(record),
        ),
      })),
      meta: {
        total,
        page: safePage,
        limit,
      },
    };
  }

  async getClassById(id: string) {
    const classInfo = await this.prisma.class.findUnique({
      where: { id },
    });

    if (!classInfo) {
      throw new NotFoundException('Class not found');
    }

    const classRecord = await this.prisma.classTeacher.findMany({
      where: { classId: id },
      select: {
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

    const teachers = classRecord.map((record) =>
      this.mapTeacherAssignment(record),
    );

    const classStudents = await this.prisma.studentClass.findMany({
      where: { classId: id },
      include: {
        student: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
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
      });

      return {
        ...student.student,
        status: student.status,
        customTuitionPerSession,
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

    return {
      ...classInfo,
      teachers,
      students,
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

  private getTeacherPayload(data: {
    teachers?: {
      teacher_id: string;
      custom_allowance?: number;
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
      type?: string;
    },
  ) {
    const actor = await this.staffOperationsAccess.resolveActor(
      userId,
      roleType,
    );
    return this.getClasses({
      ...query,
      ...(this.shouldScopeStaffClassesToTeacher(actor.roles)
        ? { teacherId: actor.id }
        : {}),
    });
  }

  async getClassByIdForStaff(userId: string, roleType: UserRole, id: string) {
    const actor = await this.staffOperationsAccess.resolveClassViewerActor(
      userId,
      roleType,
    );
    await this.staffOperationsAccess.resolveClassViewAccessMode(actor, id);

    return this.getClassById(id);
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
        type: dto.type,
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
    }
    return this.updateClassSchedule(id, dto, auditActor);
  }

  async createClass(data: CreateClassDto, auditActor?: ActionHistoryActor) {
    return await this.prisma.$transaction(async (tx) => {
      const createdClass = await tx.class.create({
        data: {
          name: data.name,
          type: data.type,
          status: data.status,
          maxStudents: data.max_students,
          allowancePerSessionPerStudent: data.allowance_per_session_per_student,
          maxAllowancePerSession: normalizeMaxAllowancePerSessionWrite(
            data.max_allowance_per_session,
          ),
          scaleAmount: data.scale_amount,
          schedule: data.schedule as Prisma.InputJsonValue | undefined,
          studentTuitionPerSession: data.student_tuition_per_session,
          tuitionPackageTotal: data.tuition_package_total,
          tuitionPackageSession: data.tuition_package_session,
        },
      });

      const teacherPayload = this.getTeacherPayload(data);
      if (teacherPayload.length > 0) {
        await tx.classTeacher.createMany({
          data: teacherPayload.map((t) => ({
            classId: createdClass.id,
            teacherId: t.teacherId,
            customAllowance: t.customAllowance,
            operatingDeductionRatePercent: t.operatingDeductionRatePercent,
          })),
        });

        await this.appendOperatingDeductionRateHistory(
          tx,
          teacherPayload.map((teacher) => ({
            classId: createdClass.id,
            teacherId: teacher.teacherId,
            operatingDeductionRatePercent:
              teacher.operatingDeductionRatePercent,
          })),
        );
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

      const classRecord = await tx.classTeacher.findMany({
        where: { classId: createdClass.id },
        select: {
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
        const afterValue = await this.getClassAuditSnapshot(
          tx,
          createdClass.id,
        );
        if (afterValue) {
          await this.actionHistoryService.recordCreate(tx, {
            actor: auditActor,
            entityType: 'class',
            entityId: createdClass.id,
            description: 'Tạo lớp học',
            afterValue,
          });
        }
      }

      return {
        ...createdClass,
        teachers: classRecord.map((record) =>
          this.mapTeacherAssignment(record),
        ),
      };
    });
  }

  async updateClass(data: UpdateClassDto, auditActor?: ActionHistoryActor) {
    const existingClass = await this.prisma.class.findUnique({
      where: { id: data.id },
      select: { id: true, schedule: true },
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
      let prunedSchedule: Prisma.InputJsonValue | undefined;
      let removedScheduleEntries = 0;
      let oldSchedule: StoredClassScheduleEntry[] = [];
      let removedTeacherIds: string[] = [];

      if (teacherPayload !== null) {
        const existingTeachers = await tx.classTeacher.findMany({
          where: { classId: data.id },
          select: {
            teacherId: true,
            operatingDeductionRatePercent: true,
          },
        });
        const existingRateByTeacherId = new Map(
          existingTeachers.map((teacher) => [
            teacher.teacherId,
            normalizeRatePercent(teacher.operatingDeductionRatePercent),
          ]),
        );
        const nextTeacherIds = new Set(
          teacherPayload.map((teacher) => teacher.teacherId),
        );
        const removedTeacherIdSet = new Set(
          existingTeachers
            .map((teacher) => teacher.teacherId)
            .filter((teacherId) => !nextTeacherIds.has(teacherId)),
        );
        const scheduleRemoval = this.removeScheduleEntriesForTeachers(
          existingClass.schedule,
          removedTeacherIdSet,
        );
        oldSchedule = scheduleRemoval.oldSchedule;
        removedScheduleEntries = scheduleRemoval.removedScheduleEntries;
        removedTeacherIds = Array.from(removedTeacherIdSet);
        if (removedScheduleEntries > 0) {
          prunedSchedule = this.serializeStoredClassScheduleEntries(
            scheduleRemoval.nextSchedule,
          );
        }

        await tx.classTeacher.deleteMany({
          where: { classId: data.id },
        });

        if (teacherPayload.length > 0) {
          await tx.classTeacher.createMany({
            data: teacherPayload.map((t) => ({
              classId: data.id,
              teacherId: t.teacherId,
              customAllowance: t.customAllowance,
              operatingDeductionRatePercent: t.operatingDeductionRatePercent,
            })),
          });

          await this.appendOperatingDeductionRateHistory(
            tx,
            teacherPayload
              .filter(
                (teacher) =>
                  existingRateByTeacherId.get(teacher.teacherId) !==
                  teacher.operatingDeductionRatePercent,
              )
              .map((teacher) => ({
                classId: data.id,
                teacherId: teacher.teacherId,
                operatingDeductionRatePercent:
                  teacher.operatingDeductionRatePercent,
              })),
          );
        }
      }

      if (data.student_ids !== undefined) {
        const normalizedStudentIds = Array.from(new Set(data.student_ids));
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

      const updatedClass = await tx.class.update({
        where: { id: data.id },
        data: {
          name: data.name,
          type: data.type,
          status: data.status,
          maxStudents: data.max_students,
          allowancePerSessionPerStudent: data.allowance_per_session_per_student,
          maxAllowancePerSession: normalizeMaxAllowancePerSessionWrite(
            data.max_allowance_per_session,
          ),
          scaleAmount: data.scale_amount,
          schedule: prunedSchedule,
          studentTuitionPerSession: data.student_tuition_per_session,
          tuitionPackageTotal: data.tuition_package_total,
          tuitionPackageSession: data.tuition_package_session,
        },
      });

      const classRecord = await tx.classTeacher.findMany({
        where: { classId: data.id },
        select: {
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
          teachers: classRecord.map((record) =>
            this.mapTeacherAssignment(record),
          ),
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
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Class not found');
    }

    const data: Prisma.ClassUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.type !== undefined) data.type = dto.type;
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

    return this.prisma.$transaction(async (tx) => {
      const beforeValue = auditActor
        ? await this.getClassAuditSnapshot(tx, id)
        : null;
      await tx.class.update({
        where: { id },
        data,
      });
      if (dto.allowance_per_session_per_student !== undefined) {
        await tx.classTeacher.updateMany({
          where: { classId: id },
          data: {
            customAllowance: dto.allowance_per_session_per_student,
          },
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
          description: 'Cập nhật thông tin cơ bản lớp học',
          beforeValue,
          afterValue,
        });
      }

      return afterValue;
    });
  }

  async updateClassTeachers(
    id: string,
    dto: UpdateClassTeachersDto,
    auditActor?: ActionHistoryActor,
  ) {
    const existing = await this.prisma.class.findUnique({
      where: { id },
      select: { id: true, allowancePerSessionPerStudent: true, schedule: true },
    });
    if (!existing) {
      throw new NotFoundException('Class not found');
    }

    const defaultAllowance = normalizeNullableMoney(
      existing.allowancePerSessionPerStudent,
    );
    const teacherPayload = dto.teachers.map((teacher) => ({
      teacherId: teacher.teacher_id,
      customAllowance: teacher.custom_allowance ?? defaultAllowance,
      operatingDeductionRatePercent: normalizeRatePercent(
        teacher.operating_deduction_rate_percent ?? teacher.tax_rate_percent,
      ),
    }));

    const result = await this.prisma.$transaction(async (tx) => {
      const beforeValue = auditActor
        ? await this.getClassAuditSnapshot(tx, id)
        : null;
      const existingTeachers = await tx.classTeacher.findMany({
        where: { classId: id },
        select: {
          teacherId: true,
          operatingDeductionRatePercent: true,
        },
      });
      const existingRateByTeacherId = new Map(
        existingTeachers.map((teacher) => [
          teacher.teacherId,
          normalizeRatePercent(teacher.operatingDeductionRatePercent),
        ]),
      );
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
          })),
        });

        await this.appendOperatingDeductionRateHistory(
          tx,
          teacherPayload
            .filter(
              (teacher) =>
                existingRateByTeacherId.get(teacher.teacherId) !==
                teacher.operatingDeductionRatePercent,
            )
            .map((teacher) => ({
              classId: id,
              teacherId: teacher.teacherId,
              operatingDeductionRatePercent:
                teacher.operatingDeductionRatePercent,
            })),
        );
      }

      const { oldSchedule, nextSchedule, removedScheduleEntries } =
        this.removeScheduleEntriesForTeachers(
          existing.schedule,
          removedTeacherIds,
        );

      if (removedScheduleEntries > 0) {
        await tx.class.update({
          where: { id },
          data: {
            schedule: this.serializeStoredClassScheduleEntries(nextSchedule),
          },
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

  async updateClassSchedule(
    id: string,
    dto: UpdateClassScheduleDto,
    auditActor?: ActionHistoryActor,
  ) {
    const existing = await this.prisma.class.findUnique({
      where: { id },
      select: { id: true, name: true, schedule: true },
    });
    if (!existing) {
      throw new NotFoundException('Class not found');
    }

    const normalizedScheduleEntries = this.mergeScheduleEntriesWithExisting(
      this.ensureScheduleEntryIds(dto.schedule),
      existing.schedule,
    );

    const teacherIds = Array.from(
      new Set(
        normalizedScheduleEntries
          .map((entry) => entry.teacherId)
          .filter((teacherId): teacherId is string => !!teacherId),
      ),
    );

    if (normalizedScheduleEntries.some((entry) => !entry.teacherId)) {
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

    const schedule = this.serializeStoredClassScheduleEntries(
      normalizedScheduleEntries,
    );

    const result = await this.prisma.$transaction(async (tx) => {
      const beforeValue = auditActor
        ? await this.getClassAuditSnapshot(tx, id)
        : null;
      await tx.class.update({
        where: { id },
        data: { schedule },
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
      const oldSchedule = this.getStoredClassScheduleEntries(existing.schedule);
      this.logger.log(
        `[ClassService] Calling syncScheduleWithCalendar for class ${id} after schedule update, oldSchedule entries: ${oldSchedule.length}`,
      );
      await this.calendarService.syncScheduleWithCalendar(id, oldSchedule);
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

    return result;
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

            const data = {
              status: StudentClassStatus.active,
              customStudentTuitionPerSession:
                resolveDerivedTuitionPerSession(pkgTotal, pkgSession) ??
                perSession,
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
