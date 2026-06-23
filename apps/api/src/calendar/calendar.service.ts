import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleCalendarService } from '../google-calendar/google-calendar.service';
import { StaffService } from '../staff/staff.service';
import {
  ActionHistoryActor,
  ActionHistoryService,
} from '../action-history/action-history.service';
import {
  ClassScheduleEntryDto,
  ClassScheduleGoogleCalendarResyncResponseDto,
  ClassScheduleGoogleCalendarResyncSummaryDto,
  ClassScheduleEventDto,
  ClassScheduleFilterDto,
  CreateMakeupScheduleEventDto,
  MakeupGoogleCalendarResyncResponseDto,
  MakeupGoogleCalendarResyncSummaryDto,
  MakeupScheduleEventDto,
  UpdateMakeupScheduleEventDto,
} from '../dtos/class-schedule.dto';
import { GoogleCalendarApiError } from '../google-calendar/errors/google-calendar.errors';
import { v4 as uuidv4 } from 'uuid';
import { getUserFullNameFromParts } from '../common/user-name.util';
import { MissedTeachingExplanationService } from '../session/missed-teaching-explanation.service';

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

interface StoredClassScheduleEntry {
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
}

type DiscoveredRecurringGoogleEvent = {
  eventId: string;
  calendarId?: string;
  scheduleEntryId?: string;
};

type CalendarScope = {
  teacherId?: string;
  redactStudentFields?: boolean;
};

type CalendarSyncStatus = 'pending' | 'synced' | 'error';

type StudentOption = {
  id: string;
  fullName: string;
};

type MakeupScheduleEventWithRelations = Prisma.MakeupScheduleEventGetPayload<{
  include: {
    class: true;
    teacher: {
      include: {
        user: {
          select: { first_name: true; last_name: true; email: true };
        };
      };
    };
  };
}>;

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);
  private readonly GOOGLE_CALENDAR_RESYNC_WRITE_DELAY_MS =
    process.env.NODE_ENV === 'test' ? 0 : 250;

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleCalendarService: GoogleCalendarService,
    private readonly staffService: StaffService,
    private readonly actionHistoryService: ActionHistoryService,
    private readonly missedTeachingExplanationService: MissedTeachingExplanationService,
  ) {}

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
          createdAt:
            typeof entry.createdAt === 'string' ? entry.createdAt : undefined,
          deletedAt:
            typeof entry.deletedAt === 'string' ? entry.deletedAt : undefined,
        };
      });
  }

  private serializeStoredClassScheduleEntries(
    entries: Array<{
      id?: string;
      dayOfWeek?: number;
      from?: string;
      to?: string;
      teacherId?: string;
      googleCalendarEventId?: string;
      meetLink?: string;
      createdAt?: string;
      deletedAt?: string;
    }>,
  ): Prisma.InputJsonValue {
    return entries.map((entry) => ({
      ...(entry.id ? { id: entry.id } : {}),
      ...(typeof entry.dayOfWeek === 'number'
        ? { dayOfWeek: entry.dayOfWeek }
        : {}),
      ...(entry.from ? { from: entry.from } : {}),
      ...(entry.to ? { to: entry.to } : {}),
      ...(entry.teacherId ? { teacherId: entry.teacherId } : {}),
      ...(entry.googleCalendarEventId
        ? { googleCalendarEventId: entry.googleCalendarEventId }
        : {}),
      ...(entry.meetLink ? { meetLink: entry.meetLink } : {}),
      ...(entry.createdAt ? { createdAt: entry.createdAt } : {}),
      ...(entry.deletedAt ? { deletedAt: entry.deletedAt } : {}),
    })) as Prisma.InputJsonValue;
  }

  private parseDateOnly(dateValue: string): Date {
    const parsedDate = new Date(dateValue);
    if (Number.isNaN(parsedDate.getTime())) {
      throw new BadRequestException('date không hợp lệ.');
    }

    return parsedDate;
  }

  private parseTimeOnly(
    timeValue: string,
    field: 'startTime' | 'endTime',
  ): Date {
    const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(
      timeValue,
    );
    if (!timeMatch) {
      throw new BadRequestException(`${field} không hợp lệ.`);
    }

    const hours = Number.parseInt(timeMatch[1], 10);
    const minutes = Number.parseInt(timeMatch[2], 10);
    const seconds =
      timeMatch[3] !== undefined ? Number.parseInt(timeMatch[3], 10) : 0;

    return new Date(
      `1970-01-01T${String(hours).padStart(2, '0')}:${String(minutes).padStart(
        2,
        '0',
      )}:${String(seconds).padStart(2, '0')}`,
    );
  }

  private getTimeOnlySeconds(value: Date | null | undefined): number | null {
    if (!value) {
      return null;
    }

    return (
      value.getHours() * 3600 + value.getMinutes() * 60 + value.getSeconds()
    );
  }

  private assertValidMakeupTimeRange(
    startTime: Date | null | undefined,
    endTime: Date | null | undefined,
  ): void {
    const startSeconds = this.getTimeOnlySeconds(startTime);
    const endSeconds = this.getTimeOnlySeconds(endTime);

    if (startSeconds == null || endSeconds == null) {
      return;
    }

    if (startSeconds >= endSeconds) {
      throw new BadRequestException('Giờ kết thúc phải sau giờ bắt đầu.');
    }
  }

  private getCalendarSyncStatus(event: {
    googleCalendarEventId?: string | null;
    calendarSyncedAt?: Date | null;
    calendarSyncError?: string | null;
  }): CalendarSyncStatus {
    if (event.calendarSyncError) {
      return 'error';
    }

    if (event.googleCalendarEventId && event.calendarSyncedAt) {
      return 'synced';
    }

    return 'pending';
  }

  private serializeMakeupScheduleAuditValue(event: {
    id: string;
    classId: string;
    teacherId: string;
    linkedSessionId?: string | null;
    date: Date;
    startTime?: Date | null;
    endTime?: Date | null;
    baselineScheduleEntryId?: string | null;
    originalDate?: Date | null;
    title?: string | null;
    note?: string | null;
    googleMeetLink?: string | null;
    googleCalendarEventId?: string | null;
    calendarSyncedAt?: Date | null;
    calendarSyncError?: string | null;
  }) {
    return {
      id: event.id,
      classId: event.classId,
      teacherId: event.teacherId,
      linkedSessionId: event.linkedSessionId ?? null,
      date: this.formatDate(event.date),
      startTime: this.normalizeTimeValue(event.startTime) ?? null,
      endTime: this.normalizeTimeValue(event.endTime) ?? null,
      baselineScheduleEntryId: event.baselineScheduleEntryId ?? null,
      originalDate: event.originalDate
        ? this.formatDate(event.originalDate)
        : null,
      title: event.title ?? null,
      note: event.note ?? null,
      googleMeetLink: event.googleMeetLink ?? null,
      googleCalendarEventId: event.googleCalendarEventId ?? null,
      calendarSyncedAt: event.calendarSyncedAt?.toISOString() ?? null,
      calendarSyncError: event.calendarSyncError ?? null,
      calendarSyncStatus: this.getCalendarSyncStatus(event),
    };
  }

  private async resolveMakeupBaseline(
    classId: string,
    baselineScheduleEntryId: string | null | undefined,
    originalDateValue: string | null | undefined,
  ): Promise<{
    baselineScheduleEntryId?: string | null;
    originalDate?: Date | null;
  }> {
    const normalizedEntryId = baselineScheduleEntryId?.trim() || null;
    const normalizedOriginalDate = originalDateValue?.trim() || null;

    if (!normalizedEntryId && !normalizedOriginalDate) {
      return {};
    }

    if (normalizedOriginalDate && !normalizedEntryId) {
      return {
        baselineScheduleEntryId: null,
        originalDate: this.parseDateOnly(normalizedOriginalDate),
      };
    }

    if (!normalizedEntryId || !normalizedOriginalDate) {
      throw new BadRequestException('Vui lòng nhập ngày gốc cần học bù.');
    }

    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { schedule: true },
    });

    if (!cls) {
      throw new NotFoundException('Class not found');
    }

    const baselineEntry = this.getStoredClassScheduleEntries(cls.schedule).find(
      (entry) => entry.id === normalizedEntryId,
    );

    if (!baselineEntry) {
      throw new BadRequestException(
        'Buổi học gốc không còn tồn tại trong lịch cố định của lớp.',
      );
    }

    const originalDate = this.parseDateOnly(normalizedOriginalDate);
    if (
      typeof baselineEntry.dayOfWeek === 'number' &&
      originalDate.getDay() !== baselineEntry.dayOfWeek
    ) {
      throw new BadRequestException(
        'Ngày gốc không khớp với thứ trong lịch cố định của lớp.',
      );
    }

    return {
      baselineScheduleEntryId: normalizedEntryId,
      originalDate,
    };
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

  private startOfSessionDay(value: Date): Date {
    return new Date(
      Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()),
    );
  }

  private formatDate(
    value: Date | string | null | undefined,
  ): string | undefined {
    if (!value) {
      return undefined;
    }

    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) {
      return undefined;
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getGoogleCalendarErrorCandidates(error: unknown): unknown[] {
    const candidates = [
      error,
      error instanceof GoogleCalendarApiError ? error.googleError : undefined,
    ].filter(Boolean);

    return candidates;
  }

  private getGoogleCalendarErrorStatus(error: unknown): number | undefined {
    const googleError = error as {
      code?: number | string;
      response?: { status?: number };
    };
    const numericCode =
      typeof googleError.code === 'number'
        ? googleError.code
        : typeof googleError.code === 'string'
          ? Number.parseInt(googleError.code, 10)
          : undefined;

    return googleError.response?.status ?? numericCode;
  }

  private getGoogleCalendarErrorMessage(error: unknown): string {
    const googleError = error as {
      message?: string;
      response?: { data?: { error?: { message?: string } } };
    };

    return (
      googleError.response?.data?.error?.message ?? googleError.message ?? ''
    );
  }

  private getGoogleCalendarErrorReasons(error: unknown): string[] {
    const googleError = error as {
      errors?: Array<{ reason?: string }>;
      response?: {
        data?: { error?: { errors?: Array<{ reason?: string }> } };
      };
    };
    const directReasons = googleError.errors ?? [];
    const nestedReasons = googleError.response?.data?.error?.errors ?? [];

    return [...directReasons, ...nestedReasons]
      .map((item) => item.reason?.toLowerCase() ?? '')
      .filter(Boolean);
  }

  private isGoogleCalendarNotFoundError(error: unknown): boolean {
    return this.getGoogleCalendarErrorCandidates(error).some((candidate) => {
      const message = this.getGoogleCalendarErrorMessage(candidate);
      return (
        this.getGoogleCalendarErrorStatus(candidate) === 404 ||
        message.toLowerCase().includes('not found')
      );
    });
  }

  private isGoogleCalendarQuotaOrRateLimitError(error: unknown): boolean {
    return this.getGoogleCalendarErrorCandidates(error).some((candidate) => {
      const status = this.getGoogleCalendarErrorStatus(candidate);
      const message =
        this.getGoogleCalendarErrorMessage(candidate).toLowerCase();
      const reasons = this.getGoogleCalendarErrorReasons(candidate);

      return (
        status === 429 ||
        reasons.some((reason) =>
          [
            'quotaexceeded',
            'ratelimitexceeded',
            'userratelimitexceeded',
          ].includes(reason),
        ) ||
        (status === 403 &&
          (message.includes('calendar usage limits exceeded') ||
            message.includes('rate limit exceeded') ||
            message.includes('user rate limit exceeded')))
      );
    });
  }

  private getCalendarSyncErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private formatCalendarSyncLog(fields: Record<string, unknown>): string {
    return JSON.stringify(fields);
  }

  private async waitBeforeGoogleCalendarResyncWrite(): Promise<void> {
    if (this.GOOGLE_CALENDAR_RESYNC_WRITE_DELAY_MS <= 0) {
      return;
    }

    await new Promise((resolve) =>
      setTimeout(resolve, this.GOOGLE_CALENDAR_RESYNC_WRITE_DELAY_MS),
    );
  }

  private buildStaffDisplayName(staff: {
    user?: { first_name: string | null; last_name: string | null } | null;
  }) {
    return getUserFullNameFromParts(staff.user) ?? '';
  }

  private getNextDateForDay(date: Date, dayOfWeek: number): Date {
    const result = new Date(date);
    const currentDay = result.getDay();
    const diff = (dayOfWeek - currentDay + 7) % 7;
    result.setDate(result.getDate() + diff);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  private getOccurrencesInRange(
    start: Date,
    end: Date,
    dayOfWeek: number,
  ): Date[] {
    const first = this.getNextDateForDay(start, dayOfWeek);
    if (first > end) {
      return [];
    }

    const occurrences: Date[] = [];
    const current = new Date(first);
    while (current <= end) {
      occurrences.push(new Date(current));
      current.setDate(current.getDate() + 7);
    }
    return occurrences;
  }

  private buildCalendarClassWhere(
    filters: ClassScheduleFilterDto,
    scope: CalendarScope = {},
  ): Prisma.ClassWhereInput {
    const teacherId = scope.teacherId ?? filters.teacherId;

    return {
      status: 'running',
      ...(filters.classId ? { id: filters.classId } : {}),
      ...(teacherId
        ? {
            teachers: {
              some: {
                teacherId,
              },
            },
          }
        : {}),
      ...(filters.studentId
        ? {
            students: {
              some: {
                studentId: filters.studentId,
              },
            },
          }
        : {}),
    };
  }

  private buildStudentExamWhere(
    filters: ClassScheduleFilterDto,
    scope: CalendarScope = {},
  ): Prisma.StudentExamScheduleWhereInput {
    const teacherId = scope.teacherId ?? filters.teacherId;
    const parsedStartDate = this.parseDateOnly(filters.startDate);
    const parsedEndDate = this.parseDateOnly(filters.endDate);

    return {
      examDate: {
        gte: parsedStartDate,
        lte: parsedEndDate,
      },
      ...(filters.studentId ? { studentId: filters.studentId } : {}),
      student: {
        ...(!filters.studentId
          ? {
              studentClasses: {
                some: {
                  class: {
                    status: 'running',
                    ...(filters.classId ? { id: filters.classId } : {}),
                    ...(teacherId
                      ? {
                          teachers: {
                            some: {
                              teacherId,
                            },
                          },
                        }
                      : {}),
                  },
                },
              },
            }
          : {}),
        ...(filters.studentId && (filters.classId || teacherId)
          ? {
              studentClasses: {
                some: {
                  ...(filters.classId ? { classId: filters.classId } : {}),
                  class: {
                    ...(teacherId
                      ? {
                          teachers: {
                            some: {
                              teacherId,
                            },
                          },
                        }
                      : {}),
                  },
                },
              },
            }
          : {}),
      },
    };
  }

  private buildFixedScheduleEvents(
    classes: Array<
      Prisma.ClassGetPayload<{
        include: {
          teachers: {
            include: {
              teacher: {
                include: {
                  user: {
                    select: { first_name: true; last_name: true; email: true };
                  };
                };
              };
            };
          };
        };
      }>
    >,
    filters: ClassScheduleFilterDto,
    scope: CalendarScope = {},
  ): ClassScheduleEventDto[] {
    const startDt = this.parseDateOnly(filters.startDate);
    startDt.setHours(0, 0, 0, 0);
    const endDt = this.parseDateOnly(filters.endDate);
    endDt.setHours(23, 59, 59, 999);
    const effectiveTeacherId = scope.teacherId ?? filters.teacherId;
    const events: ClassScheduleEventDto[] = [];

    for (const cls of classes) {
      const rawSchedule = this.getStoredClassScheduleEntries(cls.schedule);

      for (const entry of rawSchedule) {
        const dayOfWeek = entry.dayOfWeek;
        const startTime = this.normalizeTimeValue(entry.from);
        const endTime = this.normalizeTimeValue(entry.to || entry.end);

        if (
          dayOfWeek === undefined ||
          !startTime ||
          !endTime ||
          (effectiveTeacherId &&
            entry.teacherId &&
            entry.teacherId !== effectiveTeacherId)
        ) {
          continue;
        }

        const targetTeachers = entry.teacherId
          ? cls.teachers.filter(
              (teacherRecord) => teacherRecord.teacherId === entry.teacherId,
            )
          : effectiveTeacherId
            ? cls.teachers.filter(
                (teacherRecord) =>
                  teacherRecord.teacherId === effectiveTeacherId,
              )
            : cls.teachers;

        if (effectiveTeacherId && targetTeachers.length === 0) {
          continue;
        }

        const teacherIds = Array.from(
          new Set(targetTeachers.map((item) => item.teacherId)),
        );
        const teacherNames = Array.from(
          new Set(
            targetTeachers
              .map((item) => this.buildStaffDisplayName(item.teacher) || 'N/A')
              .filter(Boolean),
          ),
        );
        const fixedMeetLink =
          targetTeachers.length === 1
            ? (targetTeachers[0].teacher.googleMeetLink ?? entry.meetLink)
            : entry.meetLink;

        const occurrenceDates = this.getOccurrencesInRange(
          startDt,
          endDt,
          dayOfWeek,
        );
        for (const occurrenceDate of occurrenceDates) {
          const date = this.formatDate(occurrenceDate) ?? '';

          if (entry.createdAt) {
            const entryCreatedKey = this.formatDate(new Date(entry.createdAt));
            if (entryCreatedKey && date < entryCreatedKey) {
              continue;
            }
          }
          if (entry.deletedAt) {
            const entryDeletedKey = this.formatDate(new Date(entry.deletedAt));
            if (entryDeletedKey && date >= entryDeletedKey) {
              continue;
            }
          }

          const entryId = entry.id ?? `${cls.id}-${dayOfWeek}-${startTime}`;
          events.push({
            occurrenceId: `fixed:${cls.id}:${entryId}:${date}`,
            sourceId: entryId,
            type: 'fixed',
            title: cls.name,
            classId: cls.id,
            classIds: [cls.id],
            className: cls.name,
            classNames: [cls.name],
            teacherIds,
            teacherNames,
            date,
            startTime,
            endTime,
            allDay: false,
            patternEntryId: entry.id,
            meetLink: fixedMeetLink,
          });
        }
      }
    }

    return events;
  }

  private serializeMakeupScheduleEvent(
    event: MakeupScheduleEventWithRelations,
  ): MakeupScheduleEventDto {
    return {
      id: event.id,
      classId: event.classId,
      teacherId: event.teacherId,
      linkedSessionId: event.linkedSessionId,
      baselineScheduleEntryId: event.baselineScheduleEntryId,
      originalDate: event.originalDate
        ? this.formatDate(event.originalDate)
        : null,
      date: this.formatDate(event.date) ?? '',
      startTime: this.normalizeTimeValue(event.startTime),
      endTime: this.normalizeTimeValue(event.endTime),
      title: event.title ?? undefined,
      note: event.note ?? undefined,
      className: event.class.name,
      teacherName: this.buildStaffDisplayName(event.teacher) || undefined,
      googleMeetLink: event.googleMeetLink,
      googleCalendarEventId: event.googleCalendarEventId,
      calendarSyncedAt: event.calendarSyncedAt?.toISOString() ?? null,
      calendarSyncError: event.calendarSyncError,
      calendarSyncStatus: this.getCalendarSyncStatus(event),
    };
  }

  private toCalendarMakeupEvent(
    event: Prisma.MakeupScheduleEventGetPayload<{
      include: {
        class: true;
        teacher: {
          include: {
            user: {
              select: { first_name: true; last_name: true; email: true };
            };
          };
        };
      };
    }>,
  ): ClassScheduleEventDto {
    const teacherName = this.buildStaffDisplayName(event.teacher) || 'N/A';
    const className = event.class.name;
    const title = event.title?.trim() || `Lịch dạy bù - ${className}`;

    return {
      occurrenceId: `makeup:${event.id}`,
      sourceId: event.id,
      type: 'makeup',
      title,
      classId: event.classId,
      classIds: [event.classId],
      className,
      classNames: [className],
      teacherIds: [event.teacherId],
      teacherNames: [teacherName],
      date: this.formatDate(event.date) ?? '',
      startTime: this.normalizeTimeValue(event.startTime),
      endTime: this.normalizeTimeValue(event.endTime),
      allDay: false,
      meetLink: event.googleMeetLink ?? undefined,
      note: event.note ?? undefined,
      patternEntryId: event.baselineScheduleEntryId ?? undefined,
    };
  }

  private toCalendarExamEvent(
    event: Prisma.StudentExamScheduleGetPayload<{
      include: {
        student: {
          include: {
            studentClasses: {
              include: {
                class: true;
              };
            };
          };
        };
      };
    }>,
  ): ClassScheduleEventDto {
    const relatedClasses = event.student.studentClasses
      .map((studentClass) => studentClass.class)
      .filter(Boolean);

    return {
      occurrenceId: `exam:${event.id}`,
      sourceId: event.id,
      type: 'exam',
      title: `Lịch thi - ${event.student.fullName}`,
      classId: relatedClasses[0]?.id,
      classIds: relatedClasses.map((item) => item.id),
      className: relatedClasses[0]?.name,
      classNames: relatedClasses.map((item) => item.name),
      teacherIds: [],
      teacherNames: [],
      studentId: event.studentId,
      studentName: event.student.fullName,
      date: this.formatDate(event.examDate) ?? '',
      allDay: true,
      note: event.note ?? undefined,
    };
  }

  private sortCalendarEvents(
    events: ClassScheduleEventDto[],
  ): ClassScheduleEventDto[] {
    return [...events].sort((a, b) => {
      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }

      if (a.allDay !== b.allDay) {
        return a.allDay ? -1 : 1;
      }

      const startCompare = (a.startTime ?? '').localeCompare(b.startTime ?? '');
      if (startCompare !== 0) {
        return startCompare;
      }

      return a.title.localeCompare(b.title, 'vi');
    });
  }

  private redactCalendarStudentFields(
    events: ClassScheduleEventDto[],
  ): ClassScheduleEventDto[] {
    return events.map((event) => {
      const redacted = { ...event };
      delete redacted.studentId;
      delete redacted.studentName;

      return {
        ...redacted,
        title: event.type === 'exam' ? 'Lịch thi' : event.title,
      };
    });
  }

  private async buildCalendarEvents(
    filters: ClassScheduleFilterDto,
    scope: CalendarScope = {},
  ): Promise<ClassScheduleEventDto[]> {
    const classWhere = this.buildCalendarClassWhere(filters, scope);
    const effectiveTeacherId = scope.teacherId ?? filters.teacherId;

    const [classes, makeupEvents, examEvents] = await Promise.all([
      this.prisma.class.findMany({
        where: classWhere,
        include: {
          teachers: {
            include: {
              teacher: {
                include: {
                  user: {
                    select: { first_name: true, last_name: true, email: true },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.makeupScheduleEvent.findMany({
        where: {
          date: {
            gte: this.parseDateOnly(filters.startDate),
            lte: this.parseDateOnly(filters.endDate),
          },
          ...(filters.classId ? { classId: filters.classId } : {}),
          ...(effectiveTeacherId ? { teacherId: effectiveTeacherId } : {}),
          ...(filters.studentId
            ? {
                class: {
                  students: {
                    some: {
                      studentId: filters.studentId,
                    },
                  },
                },
              }
            : {}),
        },
        include: {
          class: true,
          teacher: {
            include: {
              user: {
                select: { first_name: true, last_name: true, email: true },
              },
            },
          },
        },
      }),
      this.prisma.studentExamSchedule.findMany({
        where: this.buildStudentExamWhere(filters, scope),
        include: {
          student: {
            include: {
              studentClasses: {
                where: {
                  ...(filters.classId ? { classId: filters.classId } : {}),
                  class: {
                    status: 'running',
                    ...(effectiveTeacherId
                      ? {
                          teachers: {
                            some: {
                              teacherId: effectiveTeacherId,
                            },
                          },
                        }
                      : {}),
                  },
                },
                include: {
                  class: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const fixedEvents = this.buildFixedScheduleEvents(classes, filters, scope);
    const calendarMakeupEvents = makeupEvents.map((item) =>
      this.toCalendarMakeupEvent(item),
    );
    const calendarExamEvents = examEvents.map((item) =>
      this.toCalendarExamEvent(item),
    );

    const events = this.sortCalendarEvents([
      ...fixedEvents,
      ...calendarMakeupEvents,
      ...calendarExamEvents,
    ]);

    return scope.redactStudentFields
      ? this.redactCalendarStudentFields(events)
      : events;
  }

  async getClasses(
    page = 1,
    limit = 50,
    search?: string,
    teacherId?: string,
  ): Promise<PaginatedResponse<{ id: string; name: string }>> {
    const trimmedSearch = search?.trim();
    const skip = (page - 1) * limit;
    const where: Prisma.ClassWhereInput = {
      status: 'running',
      ...(teacherId
        ? {
            teachers: {
              some: {
                teacherId,
              },
            },
          }
        : {}),
      ...(trimmedSearch
        ? {
            name: {
              contains: trimmedSearch,
              mode: 'insensitive',
            },
          }
        : {}),
    };

    const [classes, total] = await Promise.all([
      this.prisma.class.findMany({
        where,
        select: { id: true, name: true },
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.class.count({ where }),
    ]);

    return { data: classes, total, page, limit };
  }

  async getTeachers(
    page = 1,
    limit = 50,
    search?: string,
  ): Promise<PaginatedResponse<{ id: string; name: string }>> {
    const trimmedSearch = search?.trim();
    const skip = (page - 1) * limit;
    const where: Prisma.StaffInfoWhereInput = {
      status: 'active',
      classTeachers: {
        some: {
          class: {
            status: 'running',
          },
        },
      },
      ...(trimmedSearch
        ? {
            user: {
              is: {
                OR: [
                  {
                    first_name: {
                      contains: trimmedSearch,
                      mode: 'insensitive',
                    },
                  },
                  {
                    last_name: {
                      contains: trimmedSearch,
                      mode: 'insensitive',
                    },
                  },
                  {
                    email: {
                      contains: trimmedSearch,
                      mode: 'insensitive',
                    },
                  },
                  {
                    accountHandle: {
                      contains: trimmedSearch,
                      mode: 'insensitive',
                    },
                  },
                ],
              },
            },
          }
        : {}),
    };

    const [staffInfos, total] = await Promise.all([
      this.prisma.staffInfo.findMany({
        where,
        include: {
          user: {
            select: { first_name: true, last_name: true },
          },
        },
        skip,
        take: limit,
        orderBy: {
          user: {
            last_name: 'asc',
          },
        },
      }),
      this.prisma.staffInfo.count({
        where,
      }),
    ]);

    return {
      data: staffInfos.map((staff) => ({
        id: staff.id,
        name: this.buildStaffDisplayName(staff) || 'N/A',
      })),
      total,
      page,
      limit,
    };
  }

  async getStudentsForCalendar(
    page = 1,
    limit = 50,
    search?: string,
    teacherId?: string,
  ): Promise<PaginatedResponse<StudentOption>> {
    const trimmedSearch = search?.trim();
    const skip = (page - 1) * limit;
    const where: Prisma.StudentInfoWhereInput = {
      ...(trimmedSearch
        ? {
            fullName: {
              contains: trimmedSearch,
              mode: 'insensitive',
            },
          }
        : {}),
      studentClasses: {
        some: {
          class: {
            status: 'running',
            ...(teacherId
              ? {
                  teachers: {
                    some: {
                      teacherId,
                    },
                  },
                }
              : {}),
          },
        },
      },
    };

    const [students, total] = await Promise.all([
      this.prisma.studentInfo.findMany({
        where,
        select: {
          id: true,
          fullName: true,
        },
        skip,
        take: limit,
        orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.studentInfo.count({ where }),
    ]);

    return {
      data: students.map((student) => ({
        id: student.id,
        fullName: student.fullName,
      })),
      total,
      page,
      limit,
    };
  }

  async getAdminCalendarEvents(filters: ClassScheduleFilterDto): Promise<{
    success: boolean;
    data: ClassScheduleEventDto[];
    total: number;
  }> {
    const events = await this.buildCalendarEvents(filters);
    return { success: true, data: events, total: events.length };
  }

  async getStaffScheduleEvents(
    filters: ClassScheduleFilterDto,
    scope: CalendarScope,
  ): Promise<{
    success: boolean;
    data: ClassScheduleEventDto[];
    total: number;
  }> {
    const events = await this.buildCalendarEvents(filters, scope);
    return { success: true, data: events, total: events.length };
  }

  async getClassScheduleEvents(filters: ClassScheduleFilterDto): Promise<{
    success: boolean;
    data: ClassScheduleEventDto[];
    total: number;
  }> {
    const classes = await this.prisma.class.findMany({
      where: this.buildCalendarClassWhere(filters),
      include: {
        teachers: {
          include: {
            teacher: {
              include: {
                user: {
                  select: { first_name: true, last_name: true, email: true },
                },
              },
            },
          },
        },
      },
    });

    const events = this.sortCalendarEvents(
      this.buildFixedScheduleEvents(classes, filters),
    );
    return { success: true, data: events, total: events.length };
  }

  async getClassSchedulePattern(
    classId: string,
  ): Promise<{ success: boolean; data: ClassScheduleEntryDto[] }> {
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { schedule: true },
    });
    if (!cls) {
      throw new NotFoundException(`Class not found: ${classId}`);
    }

    const entries = this.getStoredClassScheduleEntries(cls.schedule)
      .filter((entry) => !entry.deletedAt)
      .map((entry) => ({
        id: entry.id,
        dayOfWeek: entry.dayOfWeek ?? 0,
        from: entry.from ?? '',
        end: this.normalizeTimeValue(entry.to || entry.end) ?? '',
        teacherId: entry.teacherId,
      }));

    return { success: true, data: entries };
  }

  async updateClassSchedulePattern(
    classId: string,
    entries: ClassScheduleEntryDto[],
  ): Promise<{
    success: boolean;
    data: ClassScheduleEntryDto[];
    warnings?: string[];
  }> {
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
    });
    if (!cls) {
      throw new NotFoundException(`Class not found: ${classId}`);
    }

    const oldSchedule = this.getStoredClassScheduleEntries(cls.schedule);
    const oldScheduleById = new Map(
      oldSchedule
        .filter(
          (entry): entry is StoredClassScheduleEntry & { id: string } =>
            typeof entry.id === 'string' && entry.id.length > 0,
        )
        .map((entry) => [entry.id, entry]),
    );

    const deletedEntries: StoredClassScheduleEntry[] = [];
    const activeEntries: StoredClassScheduleEntry[] = [];
    const handledExistingIds = new Set<string>();

    for (const entry of entries) {
      const existingEntry = entry.id
        ? oldScheduleById.get(entry.id)
        : undefined;

      if (existingEntry) {
        const fromNormalized = this.normalizeTimeValue(entry.from);
        const toNormalized = this.normalizeTimeValue(entry.end);
        const existingFrom = this.normalizeTimeValue(existingEntry.from);
        const existingTo = this.normalizeTimeValue(
          existingEntry.to || existingEntry.end,
        );

        const hasChanged =
          existingEntry.dayOfWeek !== entry.dayOfWeek ||
          existingFrom !== fromNormalized ||
          existingTo !== toNormalized ||
          existingEntry.teacherId !== entry.teacherId;

        if (hasChanged) {
          deletedEntries.push({
            ...existingEntry,
            deletedAt: existingEntry.deletedAt ?? new Date().toISOString(),
          });
          handledExistingIds.add(existingEntry.id);

          activeEntries.push({
            id: uuidv4(),
            dayOfWeek: entry.dayOfWeek,
            from: fromNormalized,
            to: toNormalized,
            teacherId: entry.teacherId,
            googleCalendarEventId: undefined,
            meetLink: undefined,
            createdAt: new Date().toISOString(),
          });
          continue;
        }
      }

      activeEntries.push({
        id: entry.id ?? uuidv4(),
        dayOfWeek: entry.dayOfWeek,
        from: this.normalizeTimeValue(entry.from),
        to: this.normalizeTimeValue(entry.end),
        teacherId: entry.teacherId,
        googleCalendarEventId: existingEntry?.googleCalendarEventId,
        meetLink: existingEntry?.meetLink,
        createdAt: existingEntry?.createdAt ?? new Date().toISOString(),
      });
    }

    const nextEntryIds = new Set(
      activeEntries.map((entry) => entry.id).filter(Boolean),
    );
    for (const existingEntry of oldScheduleById.values()) {
      if (
        !nextEntryIds.has(existingEntry.id) &&
        !handledExistingIds.has(existingEntry.id)
      ) {
        deletedEntries.push({
          ...existingEntry,
          deletedAt: existingEntry.deletedAt ?? new Date().toISOString(),
        });
      }
    }

    // Find modified/deleted entry IDs to check for affected future makeup events
    const changedOrDeletedEntryIds = new Set<string>();
    for (const entry of [...activeEntries, ...deletedEntries]) {
      if (entry.id && entry.deletedAt) {
        const oldEntry = oldScheduleById.get(entry.id);
        if (oldEntry && !oldEntry.deletedAt) {
          changedOrDeletedEntryIds.add(entry.id);
        }
      }
    }

    const warnings: string[] = [];
    if (changedOrDeletedEntryIds.size > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const affectedMakeupEvents =
        await this.prisma.makeupScheduleEvent.findMany({
          where: {
            classId: classId,
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

    const storageEntries = this.serializeStoredClassScheduleEntries([
      ...activeEntries,
      ...deletedEntries,
    ]);

    await this.prisma.class.update({
      where: { id: classId },
      data: { schedule: storageEntries },
    });

    await this.syncScheduleWithCalendar(classId, oldSchedule);

    const resultEntries = activeEntries.map((entry) => ({
      id: entry.id,
      dayOfWeek: entry.dayOfWeek ?? 0,
      from: entry.from ?? '',
      end: entry.to ?? '',
      teacherId: entry.teacherId,
    }));

    return { success: true, data: resultEntries, warnings };
  }

  async syncScheduleWithCalendar(
    classId: string,
    oldSchedule?: StoredClassScheduleEntry[],
  ): Promise<void> {
    await this.resyncClassScheduleWithGoogleCalendarInternal(classId, {
      oldSchedule,
    });
  }

  async resyncClassScheduleWithGoogleCalendar(
    classId: string,
  ): Promise<ClassScheduleGoogleCalendarResyncResponseDto> {
    return {
      success: true,
      data: await this.resyncClassScheduleWithGoogleCalendarInternal(classId),
    };
  }

  async resyncClassScheduleWithGoogleCalendarForTeacher(
    classId: string,
    teacherId: string,
  ): Promise<ClassScheduleGoogleCalendarResyncResponseDto> {
    return {
      success: true,
      data: await this.resyncClassScheduleWithGoogleCalendarInternal(classId, {
        teacherId,
      }),
    };
  }

  private async resyncClassScheduleWithGoogleCalendarInternal(
    classId: string,
    options: {
      oldSchedule?: StoredClassScheduleEntry[];
      teacherId?: string;
    } = {},
  ): Promise<ClassScheduleGoogleCalendarResyncSummaryDto> {
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      include: {
        teachers: {
          include: {
            teacher: {
              include: {
                user: {
                  select: { email: true, first_name: true, last_name: true },
                },
              },
            },
          },
        },
      },
    });

    if (!cls) {
      throw new NotFoundException(`Class not found: ${classId}`);
    }

    const scopedTeacherId = options.teacherId;
    const summary: ClassScheduleGoogleCalendarResyncSummaryDto = {
      classId,
      scope: scopedTeacherId ? 'teacher' : 'class',
      ...(scopedTeacherId ? { teacherId: scopedTeacherId } : {}),
      deletedRecurringEvents: 0,
      createdRecurringEvents: 0,
      updatedRecurringEvents: 0,
      recoveredStaleRecurringEvents: 0,
      failedRecurringEvents: 0,
      skippedScheduleEntries: 0,
      skippedMissingTeacherId: 0,
      skippedUnownedScheduleEntries: 0,
      skippedAmbiguousGoogleEvents: 0,
      quotaLimited: false,
      warnings: [],
    };
    const currentSchedule = this.getStoredClassScheduleEntries(
      cls.schedule,
    ).filter((entry) => !entry.deletedAt);
    const targetEntryIds = new Set<string>();
    if (scopedTeacherId) {
      for (const entry of currentSchedule) {
        if (!entry.teacherId) {
          summary.skippedMissingTeacherId += 1;
          summary.skippedScheduleEntries += 1;
          continue;
        }
        if (entry.teacherId !== scopedTeacherId) {
          summary.skippedUnownedScheduleEntries += 1;
          summary.skippedScheduleEntries += 1;
          continue;
        }
        if (entry.id) {
          targetEntryIds.add(entry.id);
        } else {
          summary.skippedScheduleEntries += 1;
          summary.warnings.push({
            code: 'schedule_entry_missing_id',
            message:
              'Schedule entry belongs to the teacher but has no id, so it cannot be resynced safely.',
          });
        }
      }
    }
    if (!scopedTeacherId) {
      for (const entry of currentSchedule) {
        if (entry.id) {
          targetEntryIds.add(entry.id);
        }
      }
    }
    this.logger.log(
      `[Calendar Resync:Recurring] state=started ${this.formatCalendarSyncLog({
        classId,
        className: cls.name,
        scope: summary.scope,
        teacherId: scopedTeacherId ?? null,
        currentScheduleEntries: currentSchedule.length,
        oldScheduleEntries: options.oldSchedule?.length ?? null,
        targetScheduleEntries: scopedTeacherId
          ? targetEntryIds.size
          : currentSchedule.length,
      })}`,
    );

    const currentEntryById = new Map(
      currentSchedule
        .filter(
          (entry): entry is StoredClassScheduleEntry & { id: string } =>
            typeof entry.id === 'string' && entry.id.length > 0,
        )
        .map((entry) => [entry.id, entry]),
    );
    const protectedEventIds = new Set<string>();
    const deleteCandidates = new Map<
      string,
      { eventId: string; calendarId?: string; reason: string }
    >();
    const discoveredEventsByEntryId = new Map<
      string,
      DiscoveredRecurringGoogleEvent[]
    >();

    const addDeleteCandidate = (
      eventId: string,
      calendarId: string | undefined,
      reason: string,
    ) => {
      const existing = deleteCandidates.get(eventId);
      if (!existing || (!existing.calendarId && calendarId)) {
        deleteCandidates.set(eventId, { eventId, calendarId, reason });
      }
    };

    for (const entry of currentSchedule) {
      if (entry.googleCalendarEventId) {
        protectedEventIds.add(entry.googleCalendarEventId);
      }
    }

    const discoveredEvents =
      await this.googleCalendarService.listClassScheduleRecurringEvents(
        classId,
      );
    this.logger.log(
      `[Calendar Resync:Recurring] state=discovered ${this.formatCalendarSyncLog(
        {
          classId,
          scope: summary.scope,
          discoveredGoogleEvents: discoveredEvents.length,
        },
      )}`,
    );
    for (const event of discoveredEvents) {
      const isStoredCurrentEvent = currentSchedule.some(
        (entry) => entry.googleCalendarEventId === event.eventId,
      );
      if (scopedTeacherId) {
        if (!event.scheduleEntryId) {
          if (!isStoredCurrentEvent) {
            summary.skippedAmbiguousGoogleEvents += 1;
            summary.warnings.push({
              code: 'ambiguous_legacy_event',
              message:
                'Legacy Google Calendar event has no schedule entry id and was skipped during teacher-scoped resync.',
              eventId: event.eventId,
            });
            this.logger.warn(
              `[Calendar Resync:Recurring] state=skipped ${this.formatCalendarSyncLog(
                {
                  classId,
                  scope: summary.scope,
                  reason: 'ambiguous_legacy_event',
                  eventId: event.eventId,
                  calendarId: event.calendarId,
                },
              )}`,
            );
          }
          continue;
        }
        if (!targetEntryIds.has(event.scheduleEntryId)) {
          this.logger.log(
            `[Calendar Resync:Recurring] state=skipped ${this.formatCalendarSyncLog(
              {
                classId,
                scope: summary.scope,
                reason: 'unowned_discovered_event',
                eventId: event.eventId,
                calendarId: event.calendarId,
                scheduleEntryId: event.scheduleEntryId,
              },
            )}`,
          );
          continue;
        }
      }

      if (event.scheduleEntryId && targetEntryIds.has(event.scheduleEntryId)) {
        const eventsForEntry =
          discoveredEventsByEntryId.get(event.scheduleEntryId) ?? [];
        eventsForEntry.push(event);
        discoveredEventsByEntryId.set(event.scheduleEntryId, eventsForEntry);
        continue;
      }

      if (!isStoredCurrentEvent) {
        addDeleteCandidate(
          event.eventId,
          event.calendarId,
          event.scheduleEntryId ? 'removed_schedule_entry' : 'legacy_orphan',
        );
      }
    }

    for (const entry of options.oldSchedule ?? []) {
      if (!entry.googleCalendarEventId) {
        continue;
      }

      const currentEntry = entry.id
        ? currentEntryById.get(entry.id)
        : undefined;
      const isScopedOldEntry =
        !scopedTeacherId || entry.teacherId === scopedTeacherId;
      const isRemovedCurrentEntry =
        isScopedOldEntry && (!entry.id || !targetEntryIds.has(entry.id));
      const isDifferentStoredEvent =
        currentEntry?.googleCalendarEventId &&
        currentEntry.googleCalendarEventId !== entry.googleCalendarEventId;

      if ((!currentEntry && isRemovedCurrentEntry) || isDifferentStoredEvent) {
        addDeleteCandidate(
          entry.googleCalendarEventId,
          undefined,
          'removed_stored_event',
        );
      }
    }

    this.logger.log(
      `[Calendar Resync:Recurring] state=delete_candidates ${this.formatCalendarSyncLog(
        {
          classId,
          scope: summary.scope,
          deleteCandidates: deleteCandidates.size,
          timing: 'before_target_sync',
        },
      )}`,
    );

    const teacherEmailMap = new Map<string, string>();
    for (const teacherRecord of cls.teachers) {
      const email = teacherRecord.teacher.user?.email?.trim();
      if (email) {
        teacherEmailMap.set(teacherRecord.teacher.id, email);
      }
    }

    let stopRecurringWrites = false;
    const markQuotaLimited = (
      error: unknown,
      context: Record<string, unknown>,
    ) => {
      summary.quotaLimited = true;
      summary.failedRecurringEvents += 1;
      summary.warnings.push({
        code: 'google_calendar_quota_limited',
        message:
          'Google Calendar usage/rate limit was reached. Remaining recurring sync writes were stopped; retry resync later.',
        ...(typeof context.scheduleEntryId === 'string'
          ? { scheduleEntryId: context.scheduleEntryId }
          : {}),
        ...(typeof context.eventId === 'string'
          ? { eventId: context.eventId }
          : {}),
      });
      stopRecurringWrites = true;
      this.logger.error(
        `[Calendar Resync:Recurring] state=quota_limited ${this.formatCalendarSyncLog(
          {
            classId,
            scope: summary.scope,
            ...context,
            error: this.getCalendarSyncErrorMessage(error),
          },
        )}`,
      );
    };

    for (const entry of currentSchedule) {
      if (stopRecurringWrites) {
        break;
      }

      if (scopedTeacherId && (!entry.id || !targetEntryIds.has(entry.id))) {
        continue;
      }

      const dayOfWeek = entry.dayOfWeek;
      const from = this.normalizeTimeValue(entry.from);
      const end = this.normalizeTimeValue(entry.to || entry.end);
      const entryId = entry.id;

      if (dayOfWeek === undefined || !from || !end || !entryId) {
        summary.skippedScheduleEntries += 1;
        summary.warnings.push({
          code: 'invalid_schedule_entry',
          message:
            'Schedule entry is missing dayOfWeek, time range, or id and was skipped.',
          ...(entryId ? { scheduleEntryId: entryId } : {}),
        });
        this.logger.warn(
          `[Calendar Resync:Recurring] state=skipped ${this.formatCalendarSyncLog(
            {
              classId,
              scope: summary.scope,
              reason: 'invalid_schedule_entry',
              scheduleEntryId: entryId ?? null,
              dayOfWeek: dayOfWeek ?? null,
              from: from ?? null,
              end: end ?? null,
            },
          )}`,
        );
        continue;
      }

      const discoveredForEntry = discoveredEventsByEntryId.get(entryId) ?? [];
      const existingEventId =
        entry.googleCalendarEventId ?? discoveredForEntry[0]?.eventId;
      if (existingEventId) {
        protectedEventIds.add(existingEventId);
      }
      if (!entry.googleCalendarEventId && existingEventId) {
        this.logger.log(
          `[Calendar Resync:Recurring] state=existing_event_adopted ${this.formatCalendarSyncLog(
            {
              classId,
              scope: summary.scope,
              scheduleEntryId: entryId,
              eventId: existingEventId,
            },
          )}`,
        );
      }

      for (const discoveredEvent of discoveredForEntry) {
        if (discoveredEvent.eventId !== existingEventId) {
          addDeleteCandidate(
            discoveredEvent.eventId,
            discoveredEvent.calendarId,
            'duplicate_schedule_entry_event',
          );
        }
      }

      const teacherEmails = entry.teacherId
        ? [teacherEmailMap.get(entry.teacherId)].filter(
            (email): email is string => Boolean(email),
          )
        : cls.teachers
            .map((teacherRecord) =>
              teacherEmailMap.get(teacherRecord.teacher.id),
            )
            .filter((email): email is string => Boolean(email));

      // Resolve Meet link from staff_info (authoritative source). Auto-create
      // if the responsible tutor does not yet have a link.
      const responsibleTeacherId =
        entry.teacherId ??
        (cls.teachers.length === 1 ? cls.teachers[0].teacherId : undefined);

      let meetLinkFromStaff: string | undefined;
      if (responsibleTeacherId) {
        try {
          const link =
            await this.staffService.ensureTutorMeetLink(responsibleTeacherId);
          meetLinkFromStaff = link ?? undefined;
        } catch (err) {
          this.logger.error(
            `[Calendar Resync:Recurring] state=meet_link_failed ${this.formatCalendarSyncLog(
              {
                classId,
                scope: summary.scope,
                scheduleEntryId: entryId,
                teacherId: responsibleTeacherId,
                error: this.getCalendarSyncErrorMessage(err),
              },
            )}`,
          );
        }
      }

      const syncRecurringEvent = async (
        calendarEventId: string | undefined,
      ) => {
        const action = calendarEventId ? 'update' : 'create';
        this.logger.log(
          `[Calendar Resync:Recurring] state=${action}_started ${this.formatCalendarSyncLog(
            {
              classId,
              scope: summary.scope,
              scheduleEntryId: entryId,
              existingEventId: calendarEventId ?? null,
              teacherId: entry.teacherId ?? null,
              teacherEmailCount: teacherEmails.length,
              dayOfWeek,
              from,
              end,
              hasMeetLink: Boolean(meetLinkFromStaff),
            },
          )}`,
        );

        await this.waitBeforeGoogleCalendarResyncWrite();
        const result =
          await this.googleCalendarService.createOrUpdateClassScheduleRecurringEvent(
            {
              classId: cls.id,
              className: cls.name,
              entryId,
              calendarEventId,
              teacherEmails,
              dayOfWeek,
              from,
              end,
              meetLink: meetLinkFromStaff,
            },
          );

        entry.googleCalendarEventId = result.eventId;
        entry.meetLink = meetLinkFromStaff ?? result.meetLink;
        if (calendarEventId) {
          summary.updatedRecurringEvents += 1;
        } else {
          summary.createdRecurringEvents += 1;
        }
        protectedEventIds.add(result.eventId);
        this.logger.log(
          `[Calendar Resync:Recurring] state=${action}_succeeded ${this.formatCalendarSyncLog(
            {
              classId,
              scope: summary.scope,
              scheduleEntryId: entryId,
              eventId: result.eventId,
              hasMeetLink: Boolean(entry.meetLink),
            },
          )}`,
        );

        return result;
      };

      try {
        await syncRecurringEvent(existingEventId);
      } catch (error) {
        let syncError: unknown = error;
        if (existingEventId && this.isGoogleCalendarNotFoundError(syncError)) {
          summary.recoveredStaleRecurringEvents += 1;
          const alternateEvent = discoveredForEntry.find(
            (event) => event.eventId !== existingEventId,
          );
          const recoveryEventId = alternateEvent?.eventId;
          if (recoveryEventId) {
            protectedEventIds.add(recoveryEventId);
          }
          this.logger.warn(
            `[Calendar Resync:Recurring] state=stale_event_detected ${this.formatCalendarSyncLog(
              {
                classId,
                scope: summary.scope,
                scheduleEntryId: entryId,
                staleEventId: entry.googleCalendarEventId ?? null,
                fallbackEventId: recoveryEventId ?? null,
                recoveryAction: recoveryEventId
                  ? 'update_discovered'
                  : 'create_replacement',
              },
            )}`,
          );
          try {
            await syncRecurringEvent(recoveryEventId);
            continue;
          } catch (recoveryError) {
            if (this.isGoogleCalendarQuotaOrRateLimitError(recoveryError)) {
              markQuotaLimited(recoveryError, {
                scheduleEntryId: entryId,
                eventId: recoveryEventId ?? null,
                phase: 'stale_recovery',
              });
              if (meetLinkFromStaff) {
                entry.meetLink = meetLinkFromStaff;
              }
              continue;
            }
            syncError = recoveryError;
          }
        }

        if (this.isGoogleCalendarQuotaOrRateLimitError(syncError)) {
          markQuotaLimited(syncError, {
            scheduleEntryId: entryId,
            eventId: existingEventId ?? null,
            phase: 'sync',
          });
          if (meetLinkFromStaff) {
            entry.meetLink = meetLinkFromStaff;
          }
          continue;
        }

        summary.failedRecurringEvents += 1;
        summary.warnings.push({
          code: 'recurring_event_sync_failed',
          message: this.getCalendarSyncErrorMessage(syncError),
          scheduleEntryId: entryId,
        });
        this.logger.error(
          `[Calendar Resync:Recurring] state=sync_failed ${this.formatCalendarSyncLog(
            {
              classId: cls.id,
              scope: summary.scope,
              scheduleEntryId: entryId,
              existingEventId: existingEventId ?? null,
              teacherId: entry.teacherId ?? null,
              error: this.getCalendarSyncErrorMessage(syncError),
            },
          )}`,
        );
        // Even if Google Calendar sync fails, preserve the staff Meet link in the schedule JSON.
        if (meetLinkFromStaff) {
          entry.meetLink = meetLinkFromStaff;
        }
      }
    }

    this.logger.log(
      `[Calendar Resync:Recurring] state=delete_candidates ${this.formatCalendarSyncLog(
        {
          classId,
          scope: summary.scope,
          deleteCandidates: deleteCandidates.size,
          protectedEvents: protectedEventIds.size,
          timing: 'after_target_sync',
        },
      )}`,
    );

    if (!stopRecurringWrites) {
      for (const event of deleteCandidates.values()) {
        if (protectedEventIds.has(event.eventId)) {
          continue;
        }

        try {
          this.logger.log(
            `[Calendar Resync:Recurring] state=delete_started ${this.formatCalendarSyncLog(
              {
                classId,
                scope: summary.scope,
                eventId: event.eventId,
                calendarId: event.calendarId ?? null,
                reason: event.reason,
              },
            )}`,
          );
          await this.waitBeforeGoogleCalendarResyncWrite();
          if (event.calendarId) {
            await this.googleCalendarService.deleteCalendarEvent(
              event.eventId,
              {
                calendarId: event.calendarId,
              },
            );
          } else {
            await this.googleCalendarService.deleteCalendarEvent(event.eventId);
          }
        } catch (error) {
          if (this.isGoogleCalendarQuotaOrRateLimitError(error)) {
            markQuotaLimited(error, {
              eventId: event.eventId,
              calendarId: event.calendarId ?? null,
              phase: 'delete',
              reason: event.reason,
            });
            break;
          }

          this.logger.error(
            `[Calendar Resync:Recurring] state=delete_failed ${this.formatCalendarSyncLog(
              {
                classId,
                scope: summary.scope,
                eventId: event.eventId,
                calendarId: event.calendarId ?? null,
                reason: event.reason,
                error: this.getCalendarSyncErrorMessage(error),
              },
            )}`,
          );
          throw error;
        }
        summary.deletedRecurringEvents += 1;
        this.logger.log(
          `[Calendar Resync:Recurring] state=delete_succeeded ${this.formatCalendarSyncLog(
            {
              classId,
              scope: summary.scope,
              eventId: event.eventId,
              calendarId: event.calendarId ?? null,
              reason: event.reason,
            },
          )}`,
        );
      }
    }

    await this.prisma.class.update({
      where: { id: classId },
      data: {
        schedule: this.serializeStoredClassScheduleEntries(
          currentSchedule.map((entry) => ({
            id: entry.id,
            dayOfWeek: entry.dayOfWeek,
            from: this.normalizeTimeValue(entry.from),
            to: this.normalizeTimeValue(entry.to || entry.end),
            teacherId: entry.teacherId,
            googleCalendarEventId: entry.googleCalendarEventId,
            meetLink: entry.meetLink,
          })),
        ),
      },
    });

    this.logger.log(
      `[Calendar Resync:Recurring] state=summary ${this.formatCalendarSyncLog(summary as unknown as Record<string, unknown>)}`,
    );

    return summary;
  }

  async listMakeupScheduleEvents(filters: ClassScheduleFilterDto): Promise<{
    success: boolean;
    data: MakeupScheduleEventDto[];
    total: number;
  }> {
    const where = {
      date: {
        gte: this.parseDateOnly(filters.startDate),
        lte: this.parseDateOnly(filters.endDate),
      },
      ...(filters.classId ? { classId: filters.classId } : {}),
      ...(filters.teacherId ? { teacherId: filters.teacherId } : {}),
      ...(filters.studentId
        ? {
            class: {
              students: {
                some: {
                  studentId: filters.studentId,
                },
              },
            },
          }
        : {}),
    } satisfies Prisma.MakeupScheduleEventWhereInput;
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit =
      filters.limit && filters.limit > 0 ? filters.limit : undefined;
    const skip = limit ? (page - 1) * limit : undefined;
    const [items, total] = await Promise.all([
      this.prisma.makeupScheduleEvent.findMany({
        where,
        include: {
          class: true,
          teacher: {
            include: {
              user: {
                select: { email: true, first_name: true, last_name: true },
              },
            },
          },
        },
        orderBy: [
          { date: 'desc' },
          { startTime: 'desc' },
          { createdAt: 'desc' },
        ],
        ...(typeof skip === 'number' ? { skip } : {}),
        ...(typeof limit === 'number' ? { take: limit } : {}),
      }),
      this.prisma.makeupScheduleEvent.count({ where }),
    ]);

    return {
      success: true,
      data: items.map((item) => this.serializeMakeupScheduleEvent(item)),
      total,
    };
  }

  async listMakeupScheduleEventsForClass(
    classId: string,
    filters: ClassScheduleFilterDto,
  ): Promise<{
    success: boolean;
    data: MakeupScheduleEventDto[];
    total: number;
  }> {
    return this.listMakeupScheduleEvents({
      ...filters,
      classId,
    });
  }

  private async syncMakeupScheduleEventWithCalendar(
    makeupEventId: string,
    options: {
      throwOnFailure?: boolean;
    } = {},
  ): Promise<MakeupGoogleCalendarResyncSummaryDto> {
    const event = await this.prisma.makeupScheduleEvent.findUnique({
      where: { id: makeupEventId },
      include: {
        class: true,
        teacher: {
          include: {
            user: {
              select: { email: true, first_name: true, last_name: true },
            },
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Makeup schedule event not found');
    }

    const summary: MakeupGoogleCalendarResyncSummaryDto = {
      classId: event.classId,
      makeupEventId: event.id,
      teacherId: event.teacherId,
      googleCalendarEventId: event.googleCalendarEventId,
      googleMeetLink: event.googleMeetLink,
      recoveredStaleEvent: false,
      warnings: [],
    };
    this.logger.log(
      `[Calendar Resync:Makeup] state=started ${this.formatCalendarSyncLog({
        classId: event.classId,
        className: event.class.name,
        makeupEventId: event.id,
        teacherId: event.teacherId,
        storedGoogleEventId: event.googleCalendarEventId ?? null,
        date: this.formatDate(event.date) ?? null,
        startTime: this.normalizeTimeValue(event.startTime) ?? null,
        endTime: this.normalizeTimeValue(event.endTime) ?? null,
      })}`,
    );
    const teacherEmails = event.teacher.user?.email
      ? [event.teacher.user.email]
      : [];

    // Resolve Meet link from staff_info (authoritative). Auto-create if absent.
    let staffMeetLink: string | null = null;
    try {
      staffMeetLink = await this.staffService.ensureTutorMeetLink(
        event.teacherId,
      );
    } catch (err) {
      this.logger.error(
        `[Calendar Resync:Makeup] state=meet_link_failed ${this.formatCalendarSyncLog(
          {
            classId: event.classId,
            makeupEventId: event.id,
            teacherId: event.teacherId,
            error: this.getCalendarSyncErrorMessage(err),
          },
        )}`,
      );
    }

    const syncToGoogle = (calendarEventId?: string) =>
      this.googleCalendarService.createOrUpdateMakeupScheduleEvent({
        classId: event.classId,
        className: event.class.name,
        makeupEventId: event.id,
        calendarEventId,
        teacherEmails,
        date: this.formatDate(event.date) ?? '',
        startTime: this.normalizeTimeValue(event.startTime) ?? '00:00:00',
        endTime: this.normalizeTimeValue(event.endTime) ?? '00:00:00',
        title: event.title ?? undefined,
        note: event.note ?? undefined,
        meetLink: staffMeetLink ?? undefined,
      });

    try {
      let result: { eventId: string; meetLink?: string };
      try {
        this.logger.log(
          `[Calendar Resync:Makeup] state=sync_started ${this.formatCalendarSyncLog(
            {
              classId: event.classId,
              makeupEventId: event.id,
              action: event.googleCalendarEventId ? 'update' : 'create',
              calendarEventId: event.googleCalendarEventId ?? null,
              teacherEmailCount: teacherEmails.length,
              hasMeetLink: Boolean(staffMeetLink),
            },
          )}`,
        );
        result = await syncToGoogle(event.googleCalendarEventId ?? undefined);
      } catch (error) {
        if (
          event.googleCalendarEventId &&
          this.isGoogleCalendarNotFoundError(error)
        ) {
          this.logger.warn(
            `[Calendar Resync:Makeup] state=stale_event_detected ${this.formatCalendarSyncLog(
              {
                classId: event.classId,
                makeupEventId: event.id,
                staleEventId: event.googleCalendarEventId,
                error: this.getCalendarSyncErrorMessage(error),
              },
            )}`,
          );
          summary.recoveredStaleEvent = true;
          summary.warnings.push({
            code: 'stale_google_event_recreated',
            message:
              'Stored Google Calendar event was missing and a replacement event was created.',
            eventId: event.googleCalendarEventId,
          });
          this.logger.log(
            `[Calendar Resync:Makeup] state=recreate_started ${this.formatCalendarSyncLog(
              {
                classId: event.classId,
                makeupEventId: event.id,
                staleEventId: event.googleCalendarEventId,
              },
            )}`,
          );
          result = await syncToGoogle(undefined);
        } else {
          throw error;
        }
      }

      await this.prisma.makeupScheduleEvent.update({
        where: { id: event.id },
        data: {
          googleCalendarEventId: result.eventId,
          // Prefer staff-level Meet link over the per-event link.
          googleMeetLink: staffMeetLink ?? result.meetLink ?? null,
          calendarSyncedAt: new Date(),
          calendarSyncError: null,
        },
      });
      summary.googleCalendarEventId = result.eventId;
      summary.googleMeetLink = staffMeetLink ?? result.meetLink ?? null;
      this.logger.log(
        `[Calendar Resync:Makeup] state=sync_succeeded ${this.formatCalendarSyncLog(
          {
            classId: event.classId,
            makeupEventId: event.id,
            eventId: result.eventId,
            recoveredStaleEvent: summary.recoveredStaleEvent,
            hasMeetLink: Boolean(summary.googleMeetLink),
          },
        )}`,
      );
    } catch (error) {
      await this.prisma.makeupScheduleEvent.update({
        where: { id: event.id },
        data: {
          // Keep staff Meet link even if Calendar sync failed; it stays valid.
          ...(staffMeetLink ? { googleMeetLink: staffMeetLink } : {}),
          calendarSyncError:
            error instanceof Error ? error.message : String(error),
        },
      });
      this.logger.error(
        `[Calendar Resync:Makeup] state=sync_failed ${this.formatCalendarSyncLog(
          {
            classId: event.classId,
            makeupEventId: event.id,
            storedGoogleEventId: event.googleCalendarEventId ?? null,
            error: this.getCalendarSyncErrorMessage(error),
          },
        )}`,
      );
      summary.warnings.push({
        code: 'makeup_event_sync_failed',
        message: this.getCalendarSyncErrorMessage(error),
      });
      if (options.throwOnFailure) {
        throw error;
      }
    }

    this.logger.log(
      `[Calendar Resync:Makeup] state=summary ${this.formatCalendarSyncLog(summary as unknown as Record<string, unknown>)}`,
    );

    return summary;
  }

  async resyncMakeupScheduleEventWithGoogleCalendarForClass(
    classId: string,
    eventId: string,
    options: { teacherId?: string; actor?: ActionHistoryActor } = {},
  ): Promise<MakeupGoogleCalendarResyncResponseDto> {
    const existing = await this.prisma.makeupScheduleEvent.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        classId: true,
        teacherId: true,
        linkedSessionId: true,
        date: true,
        startTime: true,
        endTime: true,
        baselineScheduleEntryId: true,
        originalDate: true,
        title: true,
        note: true,
        googleMeetLink: true,
        googleCalendarEventId: true,
        calendarSyncedAt: true,
        calendarSyncError: true,
      },
    });

    if (!existing || existing.classId !== classId) {
      throw new NotFoundException('Makeup schedule event not found');
    }

    if (options.teacherId && existing.teacherId !== options.teacherId) {
      throw new ForbiddenException(
        'Staff chỉ được resync buổi bù do chính mình phụ trách.',
      );
    }

    const summary = await this.syncMakeupScheduleEventWithCalendar(eventId, {
      throwOnFailure: true,
    });
    const refreshed = await this.prisma.makeupScheduleEvent.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        classId: true,
        teacherId: true,
        linkedSessionId: true,
        date: true,
        startTime: true,
        endTime: true,
        baselineScheduleEntryId: true,
        originalDate: true,
        title: true,
        note: true,
        googleMeetLink: true,
        googleCalendarEventId: true,
        calendarSyncedAt: true,
        calendarSyncError: true,
      },
    });

    if (options.actor && refreshed) {
      await this.actionHistoryService.recordUpdate(this.prisma, {
        actor: options.actor,
        entityType: 'makeup_schedule_event',
        entityId: eventId,
        description: 'Đồng bộ Google Calendar buổi bù',
        beforeValue: this.serializeMakeupScheduleAuditValue(existing),
        afterValue: this.serializeMakeupScheduleAuditValue(refreshed),
      });
    }

    return {
      success: true,
      data: summary,
    };
  }

  private async checkMakeupScheduleConflicts(
    excludeEventId: string | null,
    classId: string,
    teacherId: string,
    date: Date,
    startTime: Date,
    endTime: Date,
  ): Promise<string[]> {
    const warnings: string[] = [];
    const dateKey = this.formatDate(date);
    if (!dateKey) return [];
    const dayOfWeek = date.getDay();

    const sameDateMakeupEvents = await this.prisma.makeupScheduleEvent.findMany(
      {
        where: {
          date,
          id: excludeEventId ? { not: excludeEventId } : undefined,
        },
        include: {
          class: { select: { name: true } },
          teacher: {
            include: {
              user: { select: { first_name: true, last_name: true } },
            },
          },
        },
      },
    );

    const startVal = startTime.getTime();
    const endVal = endTime.getTime();

    for (const other of sameDateMakeupEvents) {
      if (!other.startTime || !other.endTime) continue;
      const otherStart = other.startTime.getTime();
      const otherEnd = other.endTime.getTime();

      const hasOverlap = startVal < otherEnd && endVal > otherStart;
      if (hasOverlap) {
        const otherTimeRange = `${this.normalizeTimeValue(other.startTime)} - ${this.normalizeTimeValue(other.endTime)}`;
        if (other.classId === classId) {
          warnings.push(
            `Trùng lịch: Lớp học đã có buổi dạy bù khác vào khung giờ ${otherTimeRange} ngày này.`,
          );
        }
        if (other.teacherId === teacherId) {
          const teacherName = other.teacher
            ? `${other.teacher.user?.first_name ?? ''} ${other.teacher.user?.last_name ?? ''}`.trim()
            : 'Giáo viên';
          warnings.push(
            `Trùng lịch: Giáo viên ${teacherName} đã có buổi dạy bù ở lớp "${other.class.name}" vào khung giờ ${otherTimeRange} ngày này.`,
          );
        }
      }
    }

    const activeClasses = await this.prisma.class.findMany({
      where: {
        status: 'running',
      },
      include: {
        teachers: {
          include: {
            teacher: {
              include: {
                user: { select: { first_name: true, last_name: true } },
              },
            },
          },
        },
      },
    });

    for (const cls of activeClasses) {
      const scheduleEntries = this.getStoredClassScheduleEntries(cls.schedule);
      for (const entry of scheduleEntries) {
        if (entry.dayOfWeek !== dayOfWeek) continue;

        if (entry.createdAt) {
          const entryCreated = this.formatDate(new Date(entry.createdAt));
          if (entryCreated && dateKey < entryCreated) continue;
        }
        if (entry.deletedAt) {
          const entryDeleted = this.formatDate(new Date(entry.deletedAt));
          if (entryDeleted && dateKey >= entryDeleted) continue;
        }

        if (!entry.from || !(entry.to || entry.end)) continue;

        const entryFrom = this.parseTimeOnly(entry.from, 'startTime');
        const entryTo = this.parseTimeOnly(
          entry.to || entry.end || '',
          'endTime',
        );
        const entryStartVal = entryFrom.getTime();
        const entryEndVal = entryTo.getTime();

        const hasOverlap = startVal < entryEndVal && endVal > entryStartVal;
        if (hasOverlap) {
          const entryTimeRange = `${this.normalizeTimeValue(entryFrom)} - ${this.normalizeTimeValue(entryTo)}`;
          if (cls.id === classId) {
            warnings.push(
              `Trùng lịch: Lớp học đã có lịch học cố định vào khung giờ ${entryTimeRange} ngày này.`,
            );
          }

          const matchesTeacher = entry.teacherId === teacherId;
          const isClassTeacher =
            !entry.teacherId &&
            cls.teachers.some((t) => t.teacherId === teacherId);

          if (matchesTeacher || isClassTeacher) {
            const matchedTeacherRecord = cls.teachers.find(
              (t) => t.teacherId === teacherId,
            );
            const teacherName = matchedTeacherRecord?.teacher
              ? `${matchedTeacherRecord.teacher.user?.first_name ?? ''} ${matchedTeacherRecord.teacher.user?.last_name ?? ''}`.trim()
              : 'Giáo viên';
            warnings.push(
              `Trùng lịch: Giáo viên ${teacherName} đã có lịch dạy cố định lớp "${cls.name}" vào khung giờ ${entryTimeRange} ngày này.`,
            );
          }
        }
      }
    }

    return Array.from(new Set(warnings));
  }

  async createMakeupScheduleEvent(
    dto: CreateMakeupScheduleEventDto,
    actor?: ActionHistoryActor,
  ): Promise<{ success: boolean; data: MakeupScheduleEventDto }> {
    const classTeacher = await this.prisma.classTeacher.findUnique({
      where: {
        classId_teacherId: {
          classId: dto.classId,
          teacherId: dto.teacherId,
        },
      },
      include: {
        class: {
          select: {
            createdAt: true,
          },
        },
      },
    });

    if (!classTeacher) {
      throw new BadRequestException(
        'Gia sư chịu trách nhiệm phải thuộc danh sách gia sư của lớp.',
      );
    }

    const eventDate = this.parseDateOnly(dto.date);
    const classCreatedDate = classTeacher.class?.createdAt
      ? this.startOfSessionDay(classTeacher.class.createdAt)
      : new Date(0);
    const eventDateStart = this.startOfSessionDay(eventDate);

    if (eventDateStart < classCreatedDate) {
      throw new BadRequestException(
        'Ngày xếp lịch bù không được trước ngày tạo lớp học.',
      );
    }

    const startTime = this.parseTimeOnly(dto.startTime, 'startTime');
    const endTime = this.parseTimeOnly(dto.endTime, 'endTime');
    this.assertValidMakeupTimeRange(startTime, endTime);
    const baseline = await this.resolveMakeupBaseline(
      dto.classId,
      dto.baselineScheduleEntryId,
      dto.originalDate,
    );

    if (baseline.baselineScheduleEntryId && baseline.originalDate) {
      await this.missedTeachingExplanationService.assertExplanationExists(
        dto.classId,
        baseline.baselineScheduleEntryId,
        baseline.originalDate,
      );
    }

    const overlaps = await this.checkMakeupScheduleConflicts(
      null,
      dto.classId,
      dto.teacherId,
      eventDate,
      startTime,
      endTime,
    );

    const created = await this.prisma.makeupScheduleEvent.create({
      data: {
        classId: dto.classId,
        teacherId: dto.teacherId,
        date: this.parseDateOnly(dto.date),
        startTime,
        endTime,
        ...baseline,
        title: dto.title?.trim() || null,
        note: dto.note?.trim() || null,
      },
    });

    await this.syncMakeupScheduleEventWithCalendar(created.id);
    const refreshed = await this.prisma.makeupScheduleEvent.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        class: true,
        teacher: {
          include: {
            user: {
              select: { email: true, first_name: true, last_name: true },
            },
          },
        },
      },
    });

    if (actor) {
      await this.actionHistoryService.recordCreate(this.prisma, {
        actor,
        entityType: 'makeup_schedule_event',
        entityId: refreshed.id,
        description: 'Tạo buổi bù',
        afterValue: this.serializeMakeupScheduleAuditValue(refreshed),
      });
    }

    return {
      success: true,
      data: {
        ...this.serializeMakeupScheduleEvent(refreshed),
        warnings: overlaps,
      },
    };
  }

  async createMakeupScheduleEventForClass(
    classId: string,
    dto: Omit<CreateMakeupScheduleEventDto, 'classId'>,
    actor?: ActionHistoryActor,
  ): Promise<{ success: boolean; data: MakeupScheduleEventDto }> {
    return this.createMakeupScheduleEvent(
      {
        ...dto,
        classId,
      },
      actor,
    );
  }

  async updateMakeupScheduleEvent(
    id: string,
    dto: UpdateMakeupScheduleEventDto,
    actor?: ActionHistoryActor,
  ): Promise<{ success: boolean; data: MakeupScheduleEventDto }> {
    const existing = await this.prisma.makeupScheduleEvent.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Makeup schedule event not found');
    }

    const nextClassId = dto.classId ?? existing.classId;
    const nextDateStr = dto.date ?? this.formatDate(existing.date) ?? '';
    const nextDate = this.parseDateOnly(nextDateStr);

    const nextTeacherId = dto.teacherId ?? existing.teacherId;
    const classTeacher = await this.prisma.classTeacher.findUnique({
      where: {
        classId_teacherId: {
          classId: nextClassId,
          teacherId: nextTeacherId,
        },
      },
      include: {
        class: {
          select: {
            createdAt: true,
          },
        },
      },
    });
    if (!classTeacher) {
      throw new BadRequestException(
        'Gia sư chịu trách nhiệm phải thuộc danh sách gia sư của lớp.',
      );
    }

    const classCreatedDate = classTeacher.class?.createdAt
      ? this.startOfSessionDay(classTeacher.class.createdAt)
      : new Date(0);
    const eventDateStart = this.startOfSessionDay(nextDate);

    if (eventDateStart < classCreatedDate) {
      throw new BadRequestException(
        'Ngày xếp lịch bù không được trước ngày tạo lớp học.',
      );
    }

    const nextStartTime =
      dto.startTime !== undefined
        ? this.parseTimeOnly(dto.startTime, 'startTime')
        : existing.startTime;
    const nextEndTime =
      dto.endTime !== undefined
        ? this.parseTimeOnly(dto.endTime, 'endTime')
        : existing.endTime;
    if (!nextStartTime || !nextEndTime) {
      throw new BadRequestException('Giờ bắt đầu và giờ kết thúc là bắt buộc.');
    }
    this.assertValidMakeupTimeRange(nextStartTime, nextEndTime);

    const overlaps = await this.checkMakeupScheduleConflicts(
      id,
      nextClassId,
      nextTeacherId,
      nextDate,
      nextStartTime,
      nextEndTime,
    );

    const nextBaselineScheduleEntryId =
      dto.baselineScheduleEntryId !== undefined
        ? dto.baselineScheduleEntryId?.trim() || null
        : existing.baselineScheduleEntryId;
    const nextOriginalDateValue =
      dto.originalDate !== undefined
        ? dto.originalDate?.trim() || null
        : existing.originalDate
          ? this.formatDate(existing.originalDate)
          : null;
    const baseline =
      dto.baselineScheduleEntryId !== undefined ||
      dto.originalDate !== undefined
        ? await this.resolveMakeupBaseline(
            nextClassId,
            nextBaselineScheduleEntryId,
            nextOriginalDateValue,
          )
        : {};

    const effectiveBaselineEntryId =
      baseline.baselineScheduleEntryId ?? nextBaselineScheduleEntryId;
    const effectiveOriginalDate =
      baseline.originalDate ??
      (existing.originalDate ? existing.originalDate : null);
    if (effectiveBaselineEntryId && effectiveOriginalDate) {
      await this.missedTeachingExplanationService.assertExplanationExists(
        nextClassId,
        effectiveBaselineEntryId,
        effectiveOriginalDate,
      );
    }

    const updated = await this.prisma.makeupScheduleEvent.update({
      where: { id },
      data: {
        ...(dto.classId ? { classId: dto.classId } : {}),
        ...(dto.teacherId ? { teacherId: dto.teacherId } : {}),
        ...(dto.date ? { date: this.parseDateOnly(dto.date) } : {}),
        ...(dto.startTime !== undefined ? { startTime: nextStartTime } : {}),
        ...(dto.endTime !== undefined ? { endTime: nextEndTime } : {}),
        ...(dto.baselineScheduleEntryId !== undefined ||
        dto.originalDate !== undefined
          ? {
              baselineScheduleEntryId: baseline.baselineScheduleEntryId ?? null,
              originalDate: baseline.originalDate ?? null,
            }
          : {}),
        ...(dto.title !== undefined
          ? { title: dto.title?.trim() || null }
          : {}),
        ...(dto.note !== undefined ? { note: dto.note?.trim() || null } : {}),
      },
    });

    await this.syncMakeupScheduleEventWithCalendar(updated.id);
    const refreshed = await this.prisma.makeupScheduleEvent.findUniqueOrThrow({
      where: { id: updated.id },
      include: {
        class: true,
        teacher: {
          include: {
            user: {
              select: { email: true, first_name: true, last_name: true },
            },
          },
        },
      },
    });

    if (actor) {
      await this.actionHistoryService.recordUpdate(this.prisma, {
        actor,
        entityType: 'makeup_schedule_event',
        entityId: refreshed.id,
        description: 'Cập nhật buổi bù',
        beforeValue: this.serializeMakeupScheduleAuditValue(existing),
        afterValue: this.serializeMakeupScheduleAuditValue(refreshed),
      });
    }

    return {
      success: true,
      data: {
        ...this.serializeMakeupScheduleEvent(refreshed),
        warnings: overlaps,
      },
    };
  }

  async updateMakeupScheduleEventForClass(
    classId: string,
    id: string,
    dto: Omit<UpdateMakeupScheduleEventDto, 'classId'>,
    actor?: ActionHistoryActor,
  ): Promise<{ success: boolean; data: MakeupScheduleEventDto }> {
    const existing = await this.prisma.makeupScheduleEvent.findUnique({
      where: { id },
      select: { classId: true },
    });

    if (!existing || existing.classId !== classId) {
      throw new NotFoundException('Makeup schedule event not found');
    }

    return this.updateMakeupScheduleEvent(
      id,
      {
        ...dto,
        classId,
      },
      actor,
    );
  }

  async assertTeacherCanManageMakeupScheduleEventForClass(
    classId: string,
    eventId: string,
    teacherId: string,
  ): Promise<void> {
    const existing = await this.prisma.makeupScheduleEvent.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        classId: true,
        teacherId: true,
        linkedSessionId: true,
      },
    });

    if (!existing || existing.classId !== classId) {
      throw new NotFoundException('Makeup schedule event not found');
    }

    if (existing.teacherId !== teacherId) {
      throw new ForbiddenException(
        'Teacher chỉ được quản lý buổi bù do chính mình phụ trách.',
      );
    }

    if (existing.linkedSessionId) {
      throw new ForbiddenException(
        'Buổi bù đã liên kết với buổi học nên không thể chỉnh sửa hoặc xóa.',
      );
    }
  }

  async deleteMakeupScheduleEvent(
    id: string,
    actor?: ActionHistoryActor,
  ): Promise<{ success: boolean }> {
    const existing = await this.prisma.makeupScheduleEvent.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Makeup schedule event not found');
    }

    if (existing.googleCalendarEventId) {
      try {
        await this.googleCalendarService.deleteCalendarEvent(
          existing.googleCalendarEventId,
        );
      } catch (error) {
        this.logger.error(
          `[Calendar Makeup] Failed to delete Google event ${existing.googleCalendarEventId}: ${String(error)}`,
        );
        const errorMessage = this.getCalendarSyncErrorMessage(error);
        await this.prisma.makeupScheduleEvent.update({
          where: { id },
          data: { calendarSyncError: errorMessage },
        });
        throw new BadRequestException(
          `Không xóa được sự kiện Google Calendar. Buổi bù vẫn được giữ lại để thử lại: ${errorMessage}`,
        );
      }
    }

    if (actor) {
      await this.prisma.$transaction(async (tx) => {
        await tx.makeupScheduleEvent.delete({
          where: { id },
        });
        await this.actionHistoryService.recordDelete(tx, {
          actor,
          entityType: 'makeup_schedule_event',
          entityId: id,
          description: 'Xóa buổi bù',
          beforeValue: this.serializeMakeupScheduleAuditValue(existing),
        });
      });
    } else {
      await this.prisma.makeupScheduleEvent.delete({
        where: { id },
      });
    }

    return { success: true };
  }

  async deleteMakeupScheduleEventForClass(
    classId: string,
    id: string,
    actor?: ActionHistoryActor,
  ): Promise<{ success: boolean }> {
    const existing = await this.prisma.makeupScheduleEvent.findUnique({
      where: { id },
      select: { classId: true },
    });

    if (!existing || existing.classId !== classId) {
      throw new NotFoundException('Makeup schedule event not found');
    }

    return this.deleteMakeupScheduleEvent(id, actor);
  }
}
