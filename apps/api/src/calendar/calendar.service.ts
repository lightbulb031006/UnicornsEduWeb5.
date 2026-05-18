import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleCalendarService } from '../google-calendar/google-calendar.service';
import { StaffService } from '../staff/staff.service';
import {
  ClassScheduleEntryDto,
  ClassScheduleEventDto,
  ClassScheduleFilterDto,
  CreateMakeupScheduleEventDto,
  MakeupScheduleEventDto,
  UpdateMakeupScheduleEventDto,
} from '../dtos/class-schedule.dto';
import { v4 as uuidv4 } from 'uuid';
import { getUserFullNameFromParts } from '../common/user-name.util';

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
}

type CalendarScope = {
  teacherId?: string;
};

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleCalendarService: GoogleCalendarService,
    private readonly staffService: StaffService,
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

    return this.sortCalendarEvents([
      ...fixedEvents,
      ...calendarMakeupEvents,
      ...calendarExamEvents,
    ]);
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
    staffId: string,
    filters: ClassScheduleFilterDto,
  ): Promise<{
    success: boolean;
    data: ClassScheduleEventDto[];
    total: number;
  }> {
    const events = await this.buildCalendarEvents(filters, {
      teacherId: staffId,
    });
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

    const entries = this.getStoredClassScheduleEntries(cls.schedule).map(
      (entry) => ({
        id: entry.id,
        dayOfWeek: entry.dayOfWeek ?? 0,
        from: entry.from ?? '',
        end: this.normalizeTimeValue(entry.to || entry.end) ?? '',
        teacherId: entry.teacherId,
      }),
    );

    return { success: true, data: entries };
  }

  async updateClassSchedulePattern(
    classId: string,
    entries: ClassScheduleEntryDto[],
  ): Promise<{ success: boolean; data: ClassScheduleEntryDto[] }> {
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
    });
    if (!cls) {
      throw new NotFoundException(`Class not found: ${classId}`);
    }

    const oldSchedule = this.getStoredClassScheduleEntries(cls.schedule);
    const entriesWithIds = entries.map((entry) => ({
      ...entry,
      id: entry.id || uuidv4(),
    }));

    const storageEntries = this.serializeStoredClassScheduleEntries(
      entriesWithIds.map((entry) => ({
        id: entry.id,
        dayOfWeek: entry.dayOfWeek,
        from: this.normalizeTimeValue(entry.from),
        to: this.normalizeTimeValue(entry.end),
        teacherId: entry.teacherId,
      })),
    );

    await this.prisma.class.update({
      where: { id: classId },
      data: { schedule: storageEntries },
    });

    await this.syncScheduleWithCalendar(classId, oldSchedule);

    return { success: true, data: entriesWithIds };
  }

  async syncScheduleWithCalendar(
    classId: string,
    oldSchedule?: StoredClassScheduleEntry[],
  ): Promise<void> {
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

    const currentSchedule = this.getStoredClassScheduleEntries(cls.schedule);
    const entriesToDelete = oldSchedule || currentSchedule;

    for (const entry of entriesToDelete) {
      if (entry.googleCalendarEventId) {
        try {
          await this.googleCalendarService.deleteCalendarEvent(
            entry.googleCalendarEventId,
          );
        } catch (error) {
          this.logger.error(
            `[Calendar CRUD:sync] Failed to delete recurring event ${entry.googleCalendarEventId}: ${String(error)}`,
          );
        }
      }
    }

    const teacherEmailMap = new Map<string, string>();
    for (const teacherRecord of cls.teachers) {
      const email = teacherRecord.teacher.user?.email?.trim();
      if (email) {
        teacherEmailMap.set(teacherRecord.teacher.id, email);
      }
    }

    for (const entry of currentSchedule) {
      entry.googleCalendarEventId = undefined;
      entry.meetLink = undefined;

      const dayOfWeek = entry.dayOfWeek;
      const from = this.normalizeTimeValue(entry.from);
      const end = this.normalizeTimeValue(entry.to || entry.end);
      const entryId = entry.id;

      if (dayOfWeek === undefined || !from || !end || !entryId) {
        continue;
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
            `[Calendar CRUD:sync] Failed to resolve Meet link for tutor ${responsibleTeacherId}: ${String(err)}`,
          );
        }
      }

      try {
        const result =
          await this.googleCalendarService.createOrUpdateClassScheduleRecurringEvent(
            {
              classId: cls.id,
              className: cls.name,
              entryId,
              teacherEmails,
              dayOfWeek,
              from,
              end,
              meetLink: meetLinkFromStaff,
            },
          );

        entry.googleCalendarEventId = result.eventId;
        entry.meetLink = meetLinkFromStaff ?? result.meetLink;
      } catch (error) {
        this.logger.error(
          `[Calendar CRUD:sync] Failed to sync recurring event for class ${cls.id}, entry ${entryId}: ${String(error)}`,
        );
        // Even if Google Calendar sync fails, preserve the staff Meet link in the schedule JSON.
        if (meetLinkFromStaff) {
          entry.meetLink = meetLinkFromStaff;
        }
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
  ): Promise<void> {
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
        `[Calendar Makeup] Failed to resolve staff Meet link for tutor ${event.teacherId}: ${String(err)}`,
      );
    }

    try {
      const result =
        await this.googleCalendarService.createOrUpdateMakeupScheduleEvent({
          classId: event.classId,
          className: event.class.name,
          makeupEventId: event.id,
          calendarEventId: event.googleCalendarEventId ?? undefined,
          teacherEmails,
          date: this.formatDate(event.date) ?? '',
          startTime: this.normalizeTimeValue(event.startTime) ?? '00:00:00',
          endTime: this.normalizeTimeValue(event.endTime) ?? '00:00:00',
          title: event.title ?? undefined,
          note: event.note ?? undefined,
          meetLink: staffMeetLink ?? undefined,
        });

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
        `[Calendar Makeup] Failed to sync makeup event ${event.id}: ${String(error)}`,
      );
    }
  }

  async createMakeupScheduleEvent(
    dto: CreateMakeupScheduleEventDto,
  ): Promise<{ success: boolean; data: MakeupScheduleEventDto }> {
    const classTeacher = await this.prisma.classTeacher.findUnique({
      where: {
        classId_teacherId: {
          classId: dto.classId,
          teacherId: dto.teacherId,
        },
      },
      select: { classId: true },
    });

    if (!classTeacher) {
      throw new BadRequestException(
        'Gia sư chịu trách nhiệm phải thuộc danh sách gia sư của lớp.',
      );
    }

    const created = await this.prisma.makeupScheduleEvent.create({
      data: {
        classId: dto.classId,
        teacherId: dto.teacherId,
        date: this.parseDateOnly(dto.date),
        startTime: this.parseTimeOnly(dto.startTime, 'startTime'),
        endTime: this.parseTimeOnly(dto.endTime, 'endTime'),
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

    return {
      success: true,
      data: this.serializeMakeupScheduleEvent(refreshed),
    };
  }

  async createMakeupScheduleEventForClass(
    classId: string,
    dto: Omit<CreateMakeupScheduleEventDto, 'classId'>,
  ): Promise<{ success: boolean; data: MakeupScheduleEventDto }> {
    return this.createMakeupScheduleEvent({
      ...dto,
      classId,
    });
  }

  async updateMakeupScheduleEvent(
    id: string,
    dto: UpdateMakeupScheduleEventDto,
  ): Promise<{ success: boolean; data: MakeupScheduleEventDto }> {
    const existing = await this.prisma.makeupScheduleEvent.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Makeup schedule event not found');
    }

    const nextClassId = dto.classId ?? existing.classId;
    const nextTeacherId = dto.teacherId ?? existing.teacherId;
    const classTeacher = await this.prisma.classTeacher.findUnique({
      where: {
        classId_teacherId: {
          classId: nextClassId,
          teacherId: nextTeacherId,
        },
      },
      select: { classId: true },
    });
    if (!classTeacher) {
      throw new BadRequestException(
        'Gia sư chịu trách nhiệm phải thuộc danh sách gia sư của lớp.',
      );
    }

    const updated = await this.prisma.makeupScheduleEvent.update({
      where: { id },
      data: {
        ...(dto.classId ? { classId: dto.classId } : {}),
        ...(dto.teacherId ? { teacherId: dto.teacherId } : {}),
        ...(dto.date ? { date: this.parseDateOnly(dto.date) } : {}),
        ...(dto.startTime
          ? { startTime: this.parseTimeOnly(dto.startTime, 'startTime') }
          : {}),
        ...(dto.endTime
          ? { endTime: this.parseTimeOnly(dto.endTime, 'endTime') }
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

    return {
      success: true,
      data: this.serializeMakeupScheduleEvent(refreshed),
    };
  }

  async updateMakeupScheduleEventForClass(
    classId: string,
    id: string,
    dto: Omit<UpdateMakeupScheduleEventDto, 'classId'>,
  ): Promise<{ success: boolean; data: MakeupScheduleEventDto }> {
    const existing = await this.prisma.makeupScheduleEvent.findUnique({
      where: { id },
      select: { classId: true },
    });

    if (!existing || existing.classId !== classId) {
      throw new NotFoundException('Makeup schedule event not found');
    }

    return this.updateMakeupScheduleEvent(id, {
      ...dto,
      classId,
    });
  }

  async deleteMakeupScheduleEvent(id: string): Promise<{ success: boolean }> {
    const existing = await this.prisma.makeupScheduleEvent.findUnique({
      where: { id },
      select: {
        id: true,
        googleCalendarEventId: true,
      },
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
      }
    }

    await this.prisma.makeupScheduleEvent.delete({
      where: { id },
    });

    return { success: true };
  }

  async deleteMakeupScheduleEventForClass(
    classId: string,
    id: string,
  ): Promise<{ success: boolean }> {
    const existing = await this.prisma.makeupScheduleEvent.findUnique({
      where: { id },
      select: { classId: true },
    });

    if (!existing || existing.classId !== classId) {
      throw new NotFoundException('Makeup schedule event not found');
    }

    return this.deleteMakeupScheduleEvent(id);
  }
}
