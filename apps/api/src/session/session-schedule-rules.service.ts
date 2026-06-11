import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClassStatus, Prisma } from '../../generated/client';
import { PrismaService } from '../prisma/prisma.service';

const SCHEDULE_TIME_TOLERANCE_MINUTES = 180;
const DEFAULT_MISSED_ALERT_DAYS = 31;
const MISSED_TEACHING_ALERT_MIN_DATE_KEY = '2026-06-01';
const SESSION_DATE_ERROR =
  'Ngày học không trùng với lịch cố định hoặc lịch bù. Vui lòng quay ra báo cáo thêm lịch bù trước!';
const SESSION_TIME_ERROR =
  'Thời gian vào học không được lệch quá 3 tiếng so với lịch khai báo.';

type ScheduleRulesClient = Prisma.TransactionClient | PrismaService;

type StoredClassScheduleEntry = {
  id?: string;
  dayOfWeek: number;
  from: string;
  to?: string | null;
  teacherId?: string;
  createdAt?: string;
  deletedAt?: string;
};

type ScheduleCandidate = {
  source: 'fixed' | 'makeup';
  startMinutes: number | null;
  makeupEventId?: string;
  linkedSessionId?: string | null;
};

type AlertClassRecord = {
  id: string;
  name: string;
  status: ClassStatus;
  createdAt: Date;
  schedule: Prisma.JsonValue | null;
  teachers: Array<{
    teacherId: string;
    status: string | null;
    teacher: {
      id: string;
      user?: {
        first_name?: string | null;
        last_name?: string | null;
        email?: string | null;
      } | null;
    };
  }>;
};

function isActiveClassTeacherStatus(status: string | null | undefined): boolean {
  return status == null || status === 'active';
}

export type MissedTeachingAlertStatus =
  | 'pending_explanation'
  | 'explained_pending_makeup';

export interface MissedTeachingAlertExplanationItem {
  id: string;
  reason: string;
  explainedAt: string;
  explainedByName: string | null;
  canEdit: boolean;
}

export interface MissedTeachingAlertItem {
  id: string;
  classId: string;
  className: string;
  teacherId: string;
  teacherName: string | null;
  scheduleEntryId: string;
  originalDate: string;
  scheduledStartTime: string;
  scheduledEndTime: string | null;
  status: MissedTeachingAlertStatus;
  explanation?: MissedTeachingAlertExplanationItem;
}

@Injectable()
export class SessionScheduleRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async assertSessionMatchesDeclaredSchedule(
    db: ScheduleRulesClient,
    data: {
      classId: string;
      teacherId: string;
      date: Date;
      startTime?: string | null;
    },
  ): Promise<{ makeupEventId?: string }> {
    const candidates = await this.getScheduleCandidates(db, {
      classId: data.classId,
      teacherId: data.teacherId,
      date: data.date,
    });

    if (candidates.length === 0) {
      throw new BadRequestException(SESSION_DATE_ERROR);
    }

    const sessionStartMinutes = this.timeStringToMinutes(data.startTime);
    if (sessionStartMinutes == null) {
      throw new BadRequestException(SESSION_TIME_ERROR);
    }

    const matchingCandidates = candidates
      .filter((candidate) => candidate.startMinutes != null)
      .map((candidate) => ({
        candidate,
        diff: Math.abs(candidate.startMinutes! - sessionStartMinutes),
      }))
      .filter((item) => item.diff <= SCHEDULE_TIME_TOLERANCE_MINUTES)
      .sort((a, b) => a.diff - b.diff);

    if (matchingCandidates.length === 0) {
      throw new BadRequestException(SESSION_TIME_ERROR);
    }

    const unlinkedMakeup = matchingCandidates.find(
      ({ candidate }) =>
        candidate.source === 'makeup' &&
        candidate.makeupEventId &&
        !candidate.linkedSessionId,
    );

    return unlinkedMakeup?.candidate.makeupEventId
      ? { makeupEventId: unlinkedMakeup.candidate.makeupEventId }
      : {};
  }

  async linkMakeupEventToSession(
    db: ScheduleRulesClient,
    makeupEventId: string,
    sessionId: string,
  ) {
    await db.makeupScheduleEvent.updateMany({
      where: {
        id: makeupEventId,
        linkedSessionId: null,
      },
      data: {
        linkedSessionId: sessionId,
      },
    });
  }

  async getMissedTeachingAlertsByClass(
    classId: string,
    days = DEFAULT_MISSED_ALERT_DAYS,
    teacherId?: string,
  ): Promise<MissedTeachingAlertItem[]> {
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        schedule: true,
        teachers: {
          where: teacherId ? { teacherId } : undefined,
          select: {
            teacherId: true,
            status: true,
            teacher: {
              select: {
                id: true,
                user: {
                  select: {
                    first_name: true,
                    last_name: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!cls) {
      throw new NotFoundException('Class not found');
    }

    if (cls.status !== ClassStatus.running) {
      return [];
    }

    return this.buildMissedTeachingAlerts([cls], { days, teacherId });
  }

  async getMissedTeachingAlertsByTeacher(
    teacherId: string,
    days = DEFAULT_MISSED_ALERT_DAYS,
  ): Promise<MissedTeachingAlertItem[]> {
    const classes = await this.prisma.class.findMany({
      where: {
        status: ClassStatus.running,
        teachers: {
          some: {
            teacherId,
            OR: [{ status: null }, { status: 'active' }],
          },
        },
      },
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        schedule: true,
        teachers: {
          where: {
            teacherId,
            OR: [{ status: null }, { status: 'active' }],
          },
          select: {
            teacherId: true,
            status: true,
            teacher: {
              select: {
                id: true,
                user: {
                  select: {
                    first_name: true,
                    last_name: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return this.buildMissedTeachingAlerts(classes, { days, teacherId });
  }

  private async getScheduleCandidates(
    db: ScheduleRulesClient,
    params: {
      classId: string;
      teacherId: string;
      date: Date;
    },
  ): Promise<ScheduleCandidate[]> {
    const cls = await db.class.findUnique({
      where: { id: params.classId },
      select: { schedule: true },
    });
    const dateKey = this.formatDate(params.date);
    const fixedCandidates = this.getStoredClassScheduleEntries(cls?.schedule)
      .filter((entry) => {
        if (
          entry.teacherId !== params.teacherId ||
          entry.dayOfWeek !== params.date.getUTCDay()
        ) {
          return false;
        }

        if (entry.createdAt) {
          const entryCreatedDateKey = this.formatDate(
            this.startOfSessionDay(new Date(entry.createdAt)),
          );
          if (dateKey < entryCreatedDateKey) {
            return false;
          }
        }

        if (entry.deletedAt) {
          const entryDeletedDateKey = this.formatDate(
            this.startOfSessionDay(new Date(entry.deletedAt)),
          );
          if (dateKey >= entryDeletedDateKey) {
            return false;
          }
        }

        return true;
      })
      .map((entry) => ({
        source: 'fixed' as const,
        startMinutes: this.timeStringToMinutes(entry.from),
      }));

    const makeupEvents = await db.makeupScheduleEvent.findMany({
      where: {
        classId: params.classId,
        teacherId: params.teacherId,
        date: params.date,
      },
      select: {
        id: true,
        linkedSessionId: true,
        startTime: true,
      },
    });
    const makeupCandidates = makeupEvents.map((event) => ({
      source: 'makeup' as const,
      startMinutes: this.timeValueToMinutes(event.startTime),
      makeupEventId: event.id,
      linkedSessionId: event.linkedSessionId,
    }));

    return [...fixedCandidates, ...makeupCandidates];
  }

  private async buildMissedTeachingAlerts(
    classes: AlertClassRecord[],
    options: { days: number; teacherId?: string },
  ): Promise<MissedTeachingAlertItem[]> {
    const safeDays =
      Number.isInteger(options.days) && options.days > 0
        ? options.days
        : DEFAULT_MISSED_ALERT_DAYS;
    const today = this.startOfSessionDay(new Date());
    const startDate = this.addDays(today, -(safeDays - 1));
    const endDate = today;
    const classIds = classes.map((cls) => cls.id);

    if (classIds.length === 0) {
      return [];
    }

    const [sessions, makeupEvents] = await Promise.all([
      this.prisma.session.findMany({
        where: {
          classId: { in: classIds },
          ...(options.teacherId ? { teacherId: options.teacherId } : {}),
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          classId: true,
          teacherId: true,
          date: true,
          startTime: true,
        },
      }),
      this.prisma.makeupScheduleEvent.findMany({
        where: {
          classId: { in: classIds },
          ...(options.teacherId ? { teacherId: options.teacherId } : {}),
          baselineScheduleEntryId: { not: null },
          originalDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          classId: true,
          teacherId: true,
          baselineScheduleEntryId: true,
          originalDate: true,
        },
      }),
    ]);

    const sessionItems = sessions.map((session) => ({
      classId: session.classId,
      teacherId: session.teacherId,
      dateKey: this.formatDate(session.date),
      startMinutes: this.timeValueToMinutes(session.startTime),
    }));
    const makeupKeys = new Set(
      makeupEvents
        .filter(
          (event) =>
            event.baselineScheduleEntryId && event.originalDate != null,
        )
        .map((event) =>
          this.buildOccurrenceKey({
            classId: event.classId,
            teacherId: event.teacherId,
            scheduleEntryId: event.baselineScheduleEntryId!,
            dateKey: this.formatDate(event.originalDate!),
          }),
        ),
    );

    const alerts: MissedTeachingAlertItem[] = [];

    for (const cls of classes) {
      if (cls.status !== ClassStatus.running) {
        continue;
      }

      const activeTeacherIds = new Set(
        cls.teachers
          .filter((assignment) => isActiveClassTeacherStatus(assignment.status))
          .map((assignment) => assignment.teacherId),
      );
      const teacherNameById = new Map(
        cls.teachers.map((teacherAssignment) => [
          teacherAssignment.teacherId,
          this.getTeacherName(teacherAssignment.teacher.user),
        ]),
      );
      const scheduleEntries = this.getStoredClassScheduleEntries(
        cls.schedule,
      ).filter(
        (entry) =>
          entry.id &&
          entry.teacherId &&
          (!options.teacherId || entry.teacherId === options.teacherId),
      );

      for (
        let date = new Date(startDate);
        date <= endDate;
        date = this.addDays(date, 1)
      ) {
        const dateKey = this.formatDate(date);

        const classCreatedDateKey = cls.createdAt
          ? this.formatDate(this.startOfSessionDay(cls.createdAt))
          : '1970-01-01';
        if (dateKey < classCreatedDateKey) {
          continue;
        }

        if (dateKey < MISSED_TEACHING_ALERT_MIN_DATE_KEY) {
          continue;
        }

        for (const entry of scheduleEntries) {
          if (!entry.teacherId || !activeTeacherIds.has(entry.teacherId)) {
            continue;
          }

          if (entry.dayOfWeek !== date.getUTCDay()) {
            continue;
          }

          if (entry.createdAt) {
            const entryCreatedDateKey = this.formatDate(
              this.startOfSessionDay(new Date(entry.createdAt)),
            );
            if (dateKey < entryCreatedDateKey) {
              continue;
            }
          }

          if (entry.deletedAt) {
            const entryDeletedDateKey = this.formatDate(
              this.startOfSessionDay(new Date(entry.deletedAt)),
            );
            if (dateKey >= entryDeletedDateKey) {
              continue;
            }
          }

          const scheduledStartMinutes = this.timeStringToMinutes(entry.from);
          if (scheduledStartMinutes == null) {
            continue;
          }

          if (!this.isPastTeachingGraceWindow(dateKey, scheduledStartMinutes)) {
            continue;
          }

          const occurrenceKey = this.buildOccurrenceKey({
            classId: cls.id,
            teacherId: entry.teacherId!,
            scheduleEntryId: entry.id!,
            dateKey,
          });

          if (makeupKeys.has(occurrenceKey)) {
            continue;
          }

          const hasMatchingSession = sessionItems.some(
            (session) =>
              session.classId === cls.id &&
              session.teacherId === entry.teacherId &&
              session.dateKey === dateKey &&
              session.startMinutes != null &&
              Math.abs(session.startMinutes - scheduledStartMinutes) <=
                SCHEDULE_TIME_TOLERANCE_MINUTES,
          );

          if (hasMatchingSession) {
            continue;
          }

          alerts.push({
            id: occurrenceKey,
            classId: cls.id,
            className: cls.name,
            teacherId: entry.teacherId!,
            teacherName: teacherNameById.get(entry.teacherId!) ?? null,
            scheduleEntryId: entry.id!,
            originalDate: dateKey,
            scheduledStartTime: this.normalizeTimeString(entry.from)!,
            scheduledEndTime: this.normalizeTimeString(entry.to),
            status: 'pending_explanation',
          });
        }
      }
    }

    const enrichedAlerts = await this.enrichAlertsWithExplanations(alerts);

    return enrichedAlerts.sort((a, b) =>
      a.originalDate === b.originalDate
        ? a.scheduledStartTime.localeCompare(b.scheduledStartTime)
        : b.originalDate.localeCompare(a.originalDate),
    );
  }

  private getStoredClassScheduleEntries(
    schedule: Prisma.JsonValue | null | undefined,
  ): StoredClassScheduleEntry[] {
    if (!Array.isArray(schedule)) {
      return [];
    }

    const entries: Array<StoredClassScheduleEntry | null> = schedule.map(
      (entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          return null;
        }

        const record = entry as Record<string, unknown>;
        const dayOfWeek =
          typeof record.dayOfWeek === 'number' ? record.dayOfWeek : null;
        const from = this.normalizeTimeString(record.from);
        const to = this.normalizeTimeString(record.to ?? record.end);
        const teacherId =
          typeof record.teacherId === 'string' && record.teacherId.trim()
            ? record.teacherId.trim()
            : undefined;
        const id =
          typeof record.id === 'string' && record.id.trim()
            ? record.id.trim()
            : undefined;
        const createdAt =
          typeof record.createdAt === 'string' && record.createdAt.trim()
            ? record.createdAt.trim()
            : undefined;
        const deletedAt =
          typeof record.deletedAt === 'string' && record.deletedAt.trim()
            ? record.deletedAt.trim()
            : undefined;

        if (dayOfWeek == null || !from) {
          return null;
        }

        return {
          id,
          dayOfWeek,
          from,
          to,
          teacherId,
          createdAt,
          deletedAt,
        };
      },
    );

    return entries.filter(
      (entry): entry is StoredClassScheduleEntry => entry !== null,
    );
  }

  private normalizeTimeString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(
      value.trim(),
    );
    if (!match) {
      return null;
    }

    return `${match[1]}:${match[2]}:${match[3] ?? '00'}`;
  }

  private timeStringToMinutes(value: string | null | undefined): number | null {
    const normalized = this.normalizeTimeString(value);
    if (!normalized) {
      return null;
    }

    const [hours, minutes] = normalized.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private timeValueToMinutes(
    value: Date | string | null | undefined,
  ): number | null {
    if (!value) {
      return null;
    }

    if (typeof value === 'string') {
      return this.timeStringToMinutes(value);
    }

    const isoMatch = /T(\d{2}):(\d{2})/.exec(value.toISOString());
    if (isoMatch) {
      return Number(isoMatch[1]) * 60 + Number(isoMatch[2]);
    }

    return value.getUTCHours() * 60 + value.getUTCMinutes();
  }

  private formatDate(value: Date): string {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private startOfSessionDay(value: Date): Date {
    return new Date(
      Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()),
    );
  }

  private addDays(value: Date, days: number): Date {
    const next = new Date(value);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  private isPastTeachingGraceWindow(
    dateKey: string,
    scheduledStartMinutes: number,
  ): boolean {
    const now = new Date();
    const todayKey = this.formatDate(now);

    if (dateKey < todayKey) {
      return true;
    }

    if (dateKey > todayKey) {
      return false;
    }

    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    return (
      nowMinutes >= scheduledStartMinutes + SCHEDULE_TIME_TOLERANCE_MINUTES
    );
  }

  private async enrichAlertsWithExplanations(
    alerts: MissedTeachingAlertItem[],
  ): Promise<MissedTeachingAlertItem[]> {
    if (alerts.length === 0) {
      return alerts;
    }

    const classIds = [...new Set(alerts.map((alert) => alert.classId))];
    const explanations = await this.prisma.missedTeachingExplanation.findMany({
      where: { classId: { in: classIds } },
      select: {
        id: true,
        classId: true,
        teacherId: true,
        baselineScheduleEntryId: true,
        originalDate: true,
        reason: true,
        createdAt: true,
        explainedByUserId: true,
      },
    });

    const userIds = [
      ...new Set(
        explanations
          .map((item) => item.explainedByUserId)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const users =
      userIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: {
              id: true,
              first_name: true,
              last_name: true,
              email: true,
            },
          })
        : [];
    const userNameById = new Map(
      users.map((user) => [
        user.id,
        this.getTeacherName(user),
      ]),
    );

    const explanationByOccurrenceKey = new Map(
      explanations.map((explanation) => [
        this.buildOccurrenceKey({
          classId: explanation.classId,
          teacherId: explanation.teacherId,
          scheduleEntryId: explanation.baselineScheduleEntryId,
          dateKey: this.formatDate(explanation.originalDate),
        }),
        explanation,
      ]),
    );

    return alerts.map((alert) => {
      const explanation = explanationByOccurrenceKey.get(alert.id);
      if (!explanation) {
        return alert;
      }

      return {
        ...alert,
        status: 'explained_pending_makeup',
        explanation: {
          id: explanation.id,
          reason: explanation.reason,
          explainedAt: explanation.createdAt.toISOString(),
          explainedByName: explanation.explainedByUserId
            ? (userNameById.get(explanation.explainedByUserId) ?? null)
            : null,
          canEdit: true,
        },
      };
    });
  }

  private buildOccurrenceKey(params: {
    classId: string;
    teacherId: string;
    scheduleEntryId: string;
    dateKey: string;
  }) {
    return [
      params.classId,
      params.teacherId,
      params.scheduleEntryId,
      params.dateKey,
    ].join(':');
  }

  private getTeacherName(
    user:
      | {
          first_name?: string | null;
          last_name?: string | null;
          email?: string | null;
        }
      | null
      | undefined,
  ): string | null {
    const fullName = [user?.first_name, user?.last_name]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(' ')
      .trim();

    return fullName || user?.email || null;
  }
}
