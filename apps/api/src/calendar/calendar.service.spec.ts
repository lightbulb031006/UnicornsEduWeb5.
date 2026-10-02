jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));

jest.mock('../../generated/client', () => ({
  Prisma: {
    sql: (strings: TemplateStringsArray, ...values: any[]) => ({
      strings,
      values,
    }),
  },
}));

import { CalendarService } from './calendar.service';
import { GoogleCalendarApiError } from '../google-calendar/errors/google-calendar.errors';

type StudentExamFindManyArgs = {
  where: unknown;
  include: {
    student: {
      include: {
        studentClasses: {
          where: unknown;
        };
      };
    };
  };
};

type StudentExamWhereWithDate = {
  examDate: {
    gte: unknown;
    lte: unknown;
  };
};

type MakeupScheduleEventUpdateArgs = {
  where: { id: string };
  data: {
    googleCalendarEventId?: string | null;
    googleMeetLink?: string | null;
    calendarSyncedAt?: unknown;
    calendarSyncError?: string | null;
    note?: string | null;
    baselineScheduleEntryId?: string | null;
    originalDate?: Date | null;
  };
};

type ActionHistoryDeleteArgs = {
  actor: {
    userId: string;
  };
  entityType: string;
  entityId: string;
  description: string;
};

describe('CalendarService', () => {
  const mockPrisma = {
    class: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    classTeacher: {
      findUnique: jest.fn(),
    },
    classScheduleEntry: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    makeupScheduleEvent: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
    },
    studentExamSchedule: {
      findMany: jest.fn(),
    },
    staffInfo: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const googleCalendarService = {
    deleteCalendarEvent: jest.fn(),
    createOrUpdateClassScheduleRecurringEvent: jest.fn(),
    createOrUpdateMakeupScheduleEvent: jest.fn(),
    listClassScheduleRecurringEvents: jest.fn(),
  };
  const actionHistoryService = {
    recordCreate: jest.fn(),
    recordUpdate: jest.fn(),
    recordDelete: jest.fn(),
  };

  let service: CalendarService;

  const getStudentExamFindManyArgs = (): StudentExamFindManyArgs => {
    const findMany = mockPrisma.studentExamSchedule
      .findMany as unknown as jest.MockedFunction<
      (args: StudentExamFindManyArgs) => Promise<unknown[]>
    >;
    const args = findMany.mock.calls[0]?.[0];
    expect(args).toBeDefined();
    return args;
  };

  const getMakeupScheduleEventUpdateArgs =
    (): MakeupScheduleEventUpdateArgs => {
      const update = mockPrisma.makeupScheduleEvent
        .update as unknown as jest.MockedFunction<
        (args: MakeupScheduleEventUpdateArgs) => Promise<unknown>
      >;
      const args = update.mock.calls[0]?.[0];
      expect(args).toBeDefined();
      return args;
    };

  const getActionHistoryDeleteArgs = (): ActionHistoryDeleteArgs => {
    const recordDelete =
      actionHistoryService.recordDelete as unknown as jest.MockedFunction<
        (tx: unknown, args: ActionHistoryDeleteArgs) => Promise<unknown>
      >;
    const args = recordDelete.mock.calls[0]?.[1];
    expect(args).toBeDefined();
    return args;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.class.findMany.mockResolvedValue([]);
    mockPrisma.class.findUnique.mockResolvedValue(null);
    mockPrisma.class.update.mockResolvedValue({});
    mockPrisma.classTeacher.findUnique.mockResolvedValue({
      classId: 'class-1',
    });
    mockPrisma.makeupScheduleEvent.findMany.mockResolvedValue([]);
    mockPrisma.makeupScheduleEvent.findUnique.mockResolvedValue(null);
    mockPrisma.makeupScheduleEvent.update.mockResolvedValue({});
    mockPrisma.makeupScheduleEvent.create.mockResolvedValue({
      id: 'makeup-1',
    });
    mockPrisma.makeupScheduleEvent.findUniqueOrThrow.mockResolvedValue({});
    mockPrisma.makeupScheduleEvent.count.mockResolvedValue(0);
    mockPrisma.makeupScheduleEvent.delete.mockResolvedValue({});
    mockPrisma.studentExamSchedule.findMany.mockResolvedValue([]);
    mockPrisma.staffInfo.findMany.mockResolvedValue([]);
    mockPrisma.staffInfo.count.mockResolvedValue(0);
    mockPrisma.classScheduleEntry.findMany.mockResolvedValue([]);
    mockPrisma.classScheduleEntry.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mockPrisma) => Promise<unknown>) =>
        callback(mockPrisma),
    );
    googleCalendarService.listClassScheduleRecurringEvents.mockResolvedValue(
      [],
    );
    googleCalendarService.createOrUpdateMakeupScheduleEvent.mockResolvedValue({
      eventId: 'google-event-1',
      meetLink: 'https://meet.google.com/makeup',
    });
    googleCalendarService.deleteCalendarEvent.mockResolvedValue(undefined);
    actionHistoryService.recordCreate.mockResolvedValue(undefined);
    actionHistoryService.recordUpdate.mockResolvedValue(undefined);
    actionHistoryService.recordDelete.mockResolvedValue(undefined);

    service = new CalendarService(
      mockPrisma as never,
      googleCalendarService as never,
      { ensureTutorMeetLink: jest.fn().mockResolvedValue(null) } as never,
      actionHistoryService as never,
      {} as never,
    );
  });

  it('scopes teacher calendar exam queries by current teacher ownership and running-class membership', async () => {
    mockPrisma.studentExamSchedule.findMany.mockResolvedValue([
      {
        id: 'exam-1',
        studentId: 'student-1',
        examDate: new Date('2026-05-11T00:00:00.000Z'),
        note: 'Thi cuối kỳ',
        student: {
          fullName: 'Nguyễn Minh Anh',
          studentClasses: [
            {
              class: {
                id: 'class-1',
                name: 'Toán 9A',
              },
            },
          ],
        },
      },
    ]);

    const result = await service.getStaffScheduleEvents(
      {
        startDate: '2026-05-01',
        endDate: '2026-05-31',
      } as never,
      { teacherId: 'teacher-1' },
    );

    const examQuery = getStudentExamFindManyArgs();
    const examWhere = examQuery.where as StudentExamWhereWithDate;

    expect(examWhere.examDate.gte).toBeInstanceOf(Date);
    expect(examWhere.examDate.lte).toBeInstanceOf(Date);
    expect(examQuery.where).toMatchObject({
      student: {
        studentClasses: {
          some: {
            class: {
              status: 'running',
              teachers: {
                some: {
                  teacherId: 'teacher-1',
                },
              },
            },
          },
        },
      },
    });
    expect(
      examQuery.include.student.include.studentClasses.where,
    ).toMatchObject({
      class: {
        status: 'running',
        teachers: {
          some: {
            teacherId: 'teacher-1',
          },
        },
      },
    });

    expect(result).toEqual({
      success: true,
      total: 1,
      data: [
        expect.objectContaining({
          occurrenceId: 'exam:exam-1',
          type: 'exam',
          title: 'Lịch thi - Nguyễn Minh Anh',
          classId: 'class-1',
          classIds: ['class-1'],
          className: 'Toán 9A',
          classNames: ['Toán 9A'],
          studentId: 'student-1',
          studentName: 'Nguyễn Minh Anh',
          note: 'Thi cuối kỳ',
          allDay: true,
        }),
      ],
    });
  });

  it('redacts student identity fields from training calendar exam events', async () => {
    mockPrisma.studentExamSchedule.findMany.mockResolvedValue([
      {
        id: 'exam-1',
        studentId: 'student-1',
        examDate: new Date('2026-05-29T00:00:00.000Z'),
        note: 'Thi cuối kỳ',
        student: {
          fullName: 'Nguyễn Minh Anh',
          studentClasses: [
            {
              class: {
                id: 'class-1',
                name: 'Toán 9A',
              },
            },
          ],
        },
      },
    ]);

    const result = await service.getStaffScheduleEvents(
      {
        startDate: '2026-05-29',
        endDate: '2026-05-29',
      } as never,
      { redactStudentFields: true },
    );

    expect(result.data).toEqual([
      expect.not.objectContaining({
        studentId: expect.any(String),
        studentName: expect.any(String),
      }),
    ]);
    expect(result.data[0]).toMatchObject({
      title: 'Lịch thi',
      className: 'Toán 9A',
      type: 'exam',
    });
  });

  it('includes classId filters when building teacher exam scope', async () => {
    await service.getStaffScheduleEvents(
      {
        startDate: '2026-06-01',
        endDate: '2026-06-30',
        classId: 'class-7',
      } as never,
      { teacherId: 'teacher-7' },
    );

    const examQuery = getStudentExamFindManyArgs();

    expect(examQuery.where).toMatchObject({
      student: {
        studentClasses: {
          some: {
            class: {
              id: 'class-7',
              teachers: {
                some: {
                  teacherId: 'teacher-7',
                },
              },
            },
          },
        },
      },
    });
    expect(
      examQuery.include.student.include.studentClasses.where,
    ).toMatchObject({
      classId: 'class-7',
      class: {
        teachers: {
          some: {
            teacherId: 'teacher-7',
          },
        },
      },
    });
  });

  it('filters calendar teacher options by user name and email search', async () => {
    mockPrisma.staffInfo.findMany.mockResolvedValue([
      {
        id: 'teacher-1',
        user: {
          first_name: 'An',
          last_name: 'Nguyễn',
        },
      },
    ]);
    mockPrisma.staffInfo.count.mockResolvedValue(1);

    const result = await (
      service as unknown as {
        getTeachers: (
          page?: number,
          limit?: number,
          search?: string,
        ) => Promise<{
          data: Array<{ id: string; name: string }>;
          total: number;
          page: number;
          limit: number;
        }>;
      }
    ).getTeachers(2, 12, ' an ');

    const expectedWhere = {
      status: 'active',
      classTeachers: {
        some: {
          class: {
            status: 'running',
          },
        },
      },
      user: {
        is: {
          OR: [
            { first_name: { contains: 'an', mode: 'insensitive' } },
            { last_name: { contains: 'an', mode: 'insensitive' } },
            { email: { contains: 'an', mode: 'insensitive' } },
            { accountHandle: { contains: 'an', mode: 'insensitive' } },
          ],
        },
      },
    };

    expect(mockPrisma.staffInfo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expectedWhere,
        skip: 12,
        take: 12,
      }),
    );
    expect(mockPrisma.staffInfo.count).toHaveBeenCalledWith({
      where: expectedWhere,
    });
    expect(result).toEqual({
      data: [{ id: 'teacher-1', name: 'Nguyễn An' }],
      total: 1,
      page: 2,
      limit: 12,
    });
  });

  it('uses the responsible teacher fixed Meet link in fixed calendar events', async () => {
    mockPrisma.class.findMany.mockResolvedValue([
      {
        id: 'class-1',
        name: 'Toán 9A',
        scheduleEntries: [
          {
            id: 'slot-1',
            dayOfWeek: 1,
            from: '19:00:00',
            to: '20:30:00',
            teacherId: 'teacher-1',
            meetLink: 'https://meet.google.com/old-slot-link',
            googleCalendarEventId: null,
            effectiveFrom: new Date('2026-01-01'),
            effectiveTo: null,
          },
        ],
        teachers: [
          {
            teacherId: 'teacher-1',
            teacher: {
              id: 'teacher-1',
              googleMeetLink: 'https://meet.google.com/fixed-teacher-link',
              user: {
                first_name: 'An',
                last_name: 'Nguyễn',
                email: 'an@example.com',
              },
            },
          },
        ],
      },
    ]);

    const result = await service.getStaffScheduleEvents(
      {
        startDate: '2026-05-18',
        endDate: '2026-05-18',
      } as never,
      { teacherId: 'teacher-1' },
    );

    expect(result.data).toEqual([
      expect.objectContaining({
        occurrenceId: 'fixed:class-1:slot-1:2026-05-18',
        meetLink: 'https://meet.google.com/fixed-teacher-link',
      }),
    ]);
  });

  it('stores the staff fixed Meet link on schedule entries during Google Calendar sync', async () => {
    const staffService = {
      ensureTutorMeetLink: jest
        .fn()
        .mockResolvedValue('https://meet.google.com/fixed-teacher-link'),
    };
    const syncService = new CalendarService(
      mockPrisma as never,
      googleCalendarService as never,
      staffService as never,
      actionHistoryService as never,
      {} as never,
    );

    mockPrisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      name: 'Toán 9A',
      teachers: [
        {
          teacherId: 'teacher-1',
          teacher: {
            id: 'teacher-1',
            user: {
              email: 'an@example.com',
              first_name: 'An',
              last_name: 'Nguyễn',
            },
          },
        },
      ],
    });
    mockPrisma.classScheduleEntry.findMany.mockResolvedValue([
      {
        id: 'slot-1',
        classId: 'class-1',
        dayOfWeek: 1,
        from: '19:00:00',
        to: '20:30:00',
        teacherId: 'teacher-1',
        meetLink: 'https://meet.google.com/old-slot-link',
        googleCalendarEventId: null,
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: null,
      },
    ]);
    googleCalendarService.createOrUpdateClassScheduleRecurringEvent.mockResolvedValue(
      {
        eventId: 'calendar-event-1',
        meetLink: 'https://meet.google.com/generated-per-event-link',
      },
    );

    await syncService.syncScheduleWithCalendar('class-1', []);

    expect(
      googleCalendarService.createOrUpdateClassScheduleRecurringEvent,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        meetLink: 'https://meet.google.com/fixed-teacher-link',
      }),
    );
    expect(mockPrisma.classScheduleEntry.updateMany).toHaveBeenCalledWith({
      where: { id: 'slot-1', classId: 'class-1' },
      data: {
        googleCalendarEventId: 'calendar-event-1',
        meetLink: 'https://meet.google.com/fixed-teacher-link',
      },
    });
  });

  it('creates replacement schedule events before deleting removed recurring Google events', async () => {
    mockPrisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      name: 'Toán 9A',
      teachers: [
        {
          teacherId: 'teacher-1',
          teacher: {
            id: 'teacher-1',
            user: {
              email: 'an@example.com',
              first_name: 'An',
              last_name: 'Nguyễn',
            },
          },
        },
      ],
    });
    mockPrisma.classScheduleEntry.findMany.mockResolvedValue([
      {
        id: 'slot-2',
        classId: 'class-1',
        dayOfWeek: 3,
        from: '18:00:00',
        to: '19:30:00',
        teacherId: 'teacher-1',
        meetLink: null,
        googleCalendarEventId: null,
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: null,
      },
    ]);
    googleCalendarService.listClassScheduleRecurringEvents.mockResolvedValue([
      {
        eventId: 'discovered-old-event',
        calendarId: 'test-calendar@group.calendar.google.com',
        scheduleEntryId: 'slot-1',
      },
    ]);
    googleCalendarService.createOrUpdateClassScheduleRecurringEvent.mockResolvedValue(
      {
        eventId: 'new-calendar-event',
        meetLink: 'https://meet.google.com/new-link',
      },
    );

    await service.syncScheduleWithCalendar('class-1', [
      {
        id: 'slot-1',
        dayOfWeek: 1,
        from: '19:00:00',
        to: '20:30:00',
        teacherId: 'teacher-1',
        googleCalendarEventId: 'stored-old-event',
      },
    ]);

    expect(
      googleCalendarService.listClassScheduleRecurringEvents,
    ).toHaveBeenCalledWith('class-1');
    expect(googleCalendarService.deleteCalendarEvent).toHaveBeenCalledWith(
      'stored-old-event',
    );
    expect(googleCalendarService.deleteCalendarEvent).toHaveBeenCalledWith(
      'discovered-old-event',
      { calendarId: 'test-calendar@group.calendar.google.com' },
    );
    expect(
      googleCalendarService.deleteCalendarEvent.mock.invocationCallOrder[1],
    ).toBeGreaterThan(
      googleCalendarService.createOrUpdateClassScheduleRecurringEvent.mock
        .invocationCallOrder[0],
    );
    expect(
      googleCalendarService.createOrUpdateClassScheduleRecurringEvent,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        entryId: 'slot-2',
        calendarEventId: undefined,
      }),
    );
  });

  it('deletes discovered recurring Google events even when DB schedule metadata is missing', async () => {
    mockPrisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      name: 'Toán 9A',
      teachers: [],
    });
    mockPrisma.classScheduleEntry.findMany.mockResolvedValue([]);
    googleCalendarService.listClassScheduleRecurringEvents.mockResolvedValue([
      {
        eventId: 'orphaned-google-event',
        calendarId: 'test-calendar@group.calendar.google.com',
        scheduleEntryId: 'slot-legacy',
      },
    ]);

    await service.syncScheduleWithCalendar('class-1', []);

    expect(googleCalendarService.deleteCalendarEvent).toHaveBeenCalledWith(
      'orphaned-google-event',
      { calendarId: 'test-calendar@group.calendar.google.com' },
    );
    expect(
      googleCalendarService.createOrUpdateClassScheduleRecurringEvent,
    ).not.toHaveBeenCalled();
  });

  it('returns a summary when admin resyncs the full class schedule to Google Calendar', async () => {
    mockPrisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      name: 'Toán 9A',
      teachers: [
        {
          teacherId: 'teacher-1',
          teacher: {
            id: 'teacher-1',
            user: {
              email: 'an@example.com',
              first_name: 'An',
              last_name: 'Nguyễn',
            },
          },
        },
      ],
    });
    mockPrisma.classScheduleEntry.findMany.mockResolvedValue([
      {
        id: 'slot-1',
        classId: 'class-1',
        dayOfWeek: 1,
        from: '19:00:00',
        to: '20:30:00',
        teacherId: 'teacher-1',
        meetLink: null,
        googleCalendarEventId: 'stored-event-1',
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: null,
      },
    ]);
    googleCalendarService.listClassScheduleRecurringEvents.mockResolvedValue([
      {
        eventId: 'legacy-event-without-entry-id',
        calendarId: 'test-calendar@group.calendar.google.com',
      },
    ]);
    googleCalendarService.createOrUpdateClassScheduleRecurringEvent.mockResolvedValue(
      {
        eventId: 'new-calendar-event',
        meetLink: 'https://meet.google.com/new-link',
      },
    );

    const result =
      await service.resyncClassScheduleWithGoogleCalendar('class-1');

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      classId: 'class-1',
      scope: 'class',
      deletedRecurringEvents: 1,
      createdRecurringEvents: 0,
      updatedRecurringEvents: 1,
      failedRecurringEvents: 0,
      skippedAmbiguousGoogleEvents: 0,
      quotaLimited: false,
    });
    expect(
      googleCalendarService.createOrUpdateClassScheduleRecurringEvent,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        entryId: 'slot-1',
        calendarEventId: 'stored-event-1',
      }),
    );
    expect(googleCalendarService.deleteCalendarEvent).not.toHaveBeenCalledWith(
      'stored-event-1',
    );
    expect(googleCalendarService.deleteCalendarEvent).toHaveBeenCalledWith(
      'legacy-event-without-entry-id',
      { calendarId: 'test-calendar@group.calendar.google.com' },
    );
  });

  it('resyncs only teacher-owned recurring slots and skips ambiguous legacy events for staff scope', async () => {
    mockPrisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      name: 'Toán 9A',
      teachers: [
        {
          teacherId: 'teacher-1',
          teacher: {
            id: 'teacher-1',
            user: {
              email: 'an@example.com',
              first_name: 'An',
              last_name: 'Nguyễn',
            },
          },
        },
        {
          teacherId: 'teacher-2',
          teacher: {
            id: 'teacher-2',
            user: {
              email: 'binh@example.com',
              first_name: 'Bình',
              last_name: 'Trần',
            },
          },
        },
      ],
    });
    mockPrisma.classScheduleEntry.findMany.mockResolvedValue([
      {
        id: 'slot-own',
        classId: 'class-1',
        dayOfWeek: 1,
        from: '19:00:00',
        to: '20:30:00',
        teacherId: 'teacher-1',
        meetLink: null,
        googleCalendarEventId: 'stored-own-event',
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: null,
      },
      {
        id: 'slot-other',
        classId: 'class-1',
        dayOfWeek: 2,
        from: '18:00:00',
        to: '19:30:00',
        teacherId: 'teacher-2',
        meetLink: 'https://meet.google.com/other-link',
        googleCalendarEventId: 'stored-other-event',
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: null,
      },
      {
        id: 'slot-missing-teacher',
        classId: 'class-1',
        dayOfWeek: 3,
        from: '17:00:00',
        to: '18:30:00',
        teacherId: null,
        meetLink: null,
        googleCalendarEventId: 'stored-missing-teacher-event',
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: null,
      },
    ]);
    googleCalendarService.listClassScheduleRecurringEvents.mockResolvedValue([
      {
        eventId: 'discovered-own-event',
        calendarId: 'test-calendar@group.calendar.google.com',
        scheduleEntryId: 'slot-own',
      },
      {
        eventId: 'discovered-other-event',
        calendarId: 'test-calendar@group.calendar.google.com',
        scheduleEntryId: 'slot-other',
      },
      {
        eventId: 'ambiguous-legacy-event',
        calendarId: 'test-calendar@group.calendar.google.com',
      },
    ]);
    googleCalendarService.createOrUpdateClassScheduleRecurringEvent.mockResolvedValue(
      {
        eventId: 'new-own-event',
        meetLink: 'https://meet.google.com/own-link',
      },
    );

    const result =
      await service.resyncClassScheduleWithGoogleCalendarForTeacher(
        'class-1',
        'teacher-1',
      );

    expect(result.data).toMatchObject({
      classId: 'class-1',
      scope: 'teacher',
      teacherId: 'teacher-1',
      deletedRecurringEvents: 1,
      createdRecurringEvents: 0,
      updatedRecurringEvents: 1,
      skippedMissingTeacherId: 1,
      skippedUnownedScheduleEntries: 1,
      skippedAmbiguousGoogleEvents: 1,
    });
    expect(googleCalendarService.deleteCalendarEvent).toHaveBeenCalledTimes(1);
    expect(googleCalendarService.deleteCalendarEvent).not.toHaveBeenCalledWith(
      'stored-own-event',
    );
    expect(googleCalendarService.deleteCalendarEvent).toHaveBeenCalledWith(
      'discovered-own-event',
      { calendarId: 'test-calendar@group.calendar.google.com' },
    );
    expect(googleCalendarService.deleteCalendarEvent).not.toHaveBeenCalledWith(
      'stored-other-event',
    );
    expect(googleCalendarService.deleteCalendarEvent).not.toHaveBeenCalledWith(
      'ambiguous-legacy-event',
      { calendarId: 'test-calendar@group.calendar.google.com' },
    );
    expect(
      googleCalendarService.createOrUpdateClassScheduleRecurringEvent,
    ).toHaveBeenCalledTimes(1);
    expect(
      googleCalendarService.createOrUpdateClassScheduleRecurringEvent,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        entryId: 'slot-own',
        calendarEventId: 'stored-own-event',
      }),
    );
    expect(mockPrisma.classScheduleEntry.updateMany).toHaveBeenCalledWith({
      where: { id: 'slot-own', classId: 'class-1' },
      data: {
        googleCalendarEventId: 'new-own-event',
        meetLink: 'https://meet.google.com/own-link',
      },
    });
    expect(mockPrisma.classScheduleEntry.updateMany).toHaveBeenCalledWith({
      where: { id: 'slot-other', classId: 'class-1' },
      data: {
        googleCalendarEventId: 'stored-other-event',
        meetLink: 'https://meet.google.com/other-link',
      },
    });
    expect(mockPrisma.classScheduleEntry.updateMany).toHaveBeenCalledWith({
      where: { id: 'slot-missing-teacher', classId: 'class-1' },
      data: {
        googleCalendarEventId: 'stored-missing-teacher-event',
        meetLink: null,
      },
    });
  });

  it('recreates a recurring Google event when the stored event id is stale', async () => {
    mockPrisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      name: 'Toán 9A',
      teachers: [
        {
          teacherId: 'teacher-1',
          teacher: {
            id: 'teacher-1',
            user: {
              email: 'an@example.com',
              first_name: 'An',
              last_name: 'Nguyễn',
            },
          },
        },
      ],
    });
    mockPrisma.classScheduleEntry.findMany.mockResolvedValue([
      {
        id: 'slot-1',
        classId: 'class-1',
        dayOfWeek: 1,
        from: '19:00:00',
        to: '20:30:00',
        teacherId: 'teacher-1',
        meetLink: null,
        googleCalendarEventId: 'stale-recurring-event',
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: null,
      },
    ]);
    googleCalendarService.createOrUpdateClassScheduleRecurringEvent
      .mockRejectedValueOnce(
        new GoogleCalendarApiError('Failed to update recurring event', {
          message: 'Not found',
          response: { status: 404 },
        } as never),
      )
      .mockResolvedValueOnce({
        eventId: 'replacement-recurring-event',
        meetLink: 'https://meet.google.com/replacement-recurring',
      });

    const result =
      await service.resyncClassScheduleWithGoogleCalendar('class-1');

    expect(result.data).toMatchObject({
      classId: 'class-1',
      createdRecurringEvents: 1,
      updatedRecurringEvents: 0,
      recoveredStaleRecurringEvents: 1,
      failedRecurringEvents: 0,
      quotaLimited: false,
    });
    expect(
      googleCalendarService.createOrUpdateClassScheduleRecurringEvent,
    ).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        entryId: 'slot-1',
        calendarEventId: 'stale-recurring-event',
      }),
    );
    expect(
      googleCalendarService.createOrUpdateClassScheduleRecurringEvent,
    ).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        entryId: 'slot-1',
        calendarEventId: undefined,
      }),
    );
    expect(mockPrisma.classScheduleEntry.updateMany).toHaveBeenCalledWith({
      where: { id: 'slot-1', classId: 'class-1' },
      data: {
        googleCalendarEventId: 'replacement-recurring-event',
        meetLink: 'https://meet.google.com/replacement-recurring',
      },
    });
  });

  it('preserves schedule createdAt/deletedAt history when rewriting after Google resync', async () => {
    mockPrisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      name: 'Toán 9A',
      updatedAt: new Date('2026-06-10T08:00:00.000Z'),
      teachers: [
        {
          teacherId: 'teacher-1',
          teacher: {
            id: 'teacher-1',
            user: {
              email: 'an@example.com',
              first_name: 'An',
              last_name: 'Nguyễn',
            },
          },
        },
      ],
    });
    mockPrisma.classScheduleEntry.findMany.mockResolvedValue([
      {
        id: 'slot-active',
        classId: 'class-1',
        dayOfWeek: 1,
        from: '20:00:00',
        to: '21:30:00',
        teacherId: 'teacher-1',
        meetLink: null,
        googleCalendarEventId: 'stored-active-event',
        effectiveFrom: new Date('2026-06-10T07:55:00.000Z'),
        effectiveTo: null,
      },
      {
        id: 'slot-deleted',
        classId: 'class-1',
        dayOfWeek: 1,
        from: '19:00:00',
        to: '20:30:00',
        teacherId: 'teacher-1',
        meetLink: null,
        googleCalendarEventId: 'stored-deleted-event',
        effectiveFrom: new Date('2026-05-01T00:00:00.000Z'),
        effectiveTo: new Date('2026-06-10T07:55:00.000Z'),
      },
    ]);
    googleCalendarService.listClassScheduleRecurringEvents.mockResolvedValue([
      {
        eventId: 'stored-active-event',
        calendarId: 'test-calendar@group.calendar.google.com',
        scheduleEntryId: 'slot-active',
      },
    ]);
    googleCalendarService.createOrUpdateClassScheduleRecurringEvent.mockResolvedValue(
      {
        eventId: 'stored-active-event',
        meetLink: 'https://meet.google.com/active-link',
      },
    );

    await service.resyncClassScheduleWithGoogleCalendar('class-1');

    expect(mockPrisma.classScheduleEntry.updateMany).toHaveBeenCalledWith({
      where: { id: 'slot-active', classId: 'class-1' },
      data: {
        googleCalendarEventId: 'stored-active-event',
        meetLink: 'https://meet.google.com/active-link',
      },
    });
    expect(mockPrisma.classScheduleEntry.updateMany).toHaveBeenCalledWith({
      where: { id: 'slot-deleted', classId: 'class-1' },
      data: {
        googleCalendarEventId: 'stored-deleted-event',
        meetLink: null,
      },
    });
  });

  it('stops recurring resync writes when Google Calendar reports usage limits', async () => {
    mockPrisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      name: 'Toán 9A',
      teachers: [
        {
          teacherId: 'teacher-1',
          teacher: {
            id: 'teacher-1',
            user: {
              email: 'an@example.com',
              first_name: 'An',
              last_name: 'Nguyễn',
            },
          },
        },
      ],
    });
    mockPrisma.classScheduleEntry.findMany.mockResolvedValue([
      {
        id: 'slot-1',
        classId: 'class-1',
        dayOfWeek: 1,
        from: '19:00:00',
        to: '20:30:00',
        teacherId: 'teacher-1',
        meetLink: null,
        googleCalendarEventId: null,
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: null,
      },
      {
        id: 'slot-2',
        classId: 'class-1',
        dayOfWeek: 3,
        from: '18:00:00',
        to: '19:30:00',
        teacherId: 'teacher-1',
        meetLink: null,
        googleCalendarEventId: null,
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: null,
      },
    ]);
    googleCalendarService.createOrUpdateClassScheduleRecurringEvent.mockRejectedValueOnce(
      new GoogleCalendarApiError('Calendar usage limits exceeded.', {
        message: 'Calendar usage limits exceeded.',
        code: 403,
        errors: [{ reason: 'quotaExceeded' }],
      } as never),
    );

    const result =
      await service.resyncClassScheduleWithGoogleCalendar('class-1');

    expect(result.data).toMatchObject({
      classId: 'class-1',
      createdRecurringEvents: 0,
      updatedRecurringEvents: 0,
      recoveredStaleRecurringEvents: 0,
      failedRecurringEvents: 1,
      quotaLimited: true,
    });
    expect(result.data.warnings).toEqual([
      expect.objectContaining({
        code: 'google_calendar_quota_limited',
        scheduleEntryId: 'slot-1',
      }),
    ]);
    expect(
      googleCalendarService.createOrUpdateClassScheduleRecurringEvent,
    ).toHaveBeenCalledTimes(1);
    expect(googleCalendarService.deleteCalendarEvent).not.toHaveBeenCalled();
  });

  it('keeps deleting remaining recurring events after one delete fails, and still writes back the schedule', async () => {
    mockPrisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      name: 'Toán 9A',
      teachers: [],
    });
    mockPrisma.classScheduleEntry.findMany.mockResolvedValue([]);
    googleCalendarService.listClassScheduleRecurringEvents.mockResolvedValue([
      { eventId: 'del-1', calendarId: 'cal-1' },
      { eventId: 'del-2', calendarId: 'cal-1' },
    ]);
    googleCalendarService.deleteCalendarEvent.mockRejectedValueOnce(
      new Error('Delete failed'),
    );

    const result =
      await service.resyncClassScheduleWithGoogleCalendar('class-1');

    expect(googleCalendarService.deleteCalendarEvent).toHaveBeenCalledTimes(2);
    expect(result.data.deletedRecurringEvents).toBe(1);
    expect(result.data.failedRecurringEvents).toBe(1);
    expect(result.data.warnings).toEqual([
      expect.objectContaining({
        code: 'recurring_event_delete_failed',
        eventId: 'del-1',
      }),
    ]);
  });

  it('preserves a newly-created recurring event id in the writeback even when an unrelated delete fails', async () => {
    mockPrisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      name: 'Toán 9A',
      teachers: [
        {
          teacherId: 'teacher-1',
          teacher: {
            id: 'teacher-1',
            user: {
              email: 'an@example.com',
              first_name: 'An',
              last_name: 'Nguyễn',
            },
          },
        },
      ],
    });
    mockPrisma.classScheduleEntry.findMany.mockResolvedValue([
      {
        id: 'slot-new',
        classId: 'class-1',
        dayOfWeek: 1,
        from: '19:00:00',
        to: '20:30:00',
        teacherId: 'teacher-1',
        meetLink: null,
        googleCalendarEventId: null,
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: null,
      },
    ]);
    googleCalendarService.createOrUpdateClassScheduleRecurringEvent.mockResolvedValue(
      {
        eventId: 'new-event-x',
        meetLink: 'https://meet.google.com/new-event-x',
      },
    );
    googleCalendarService.listClassScheduleRecurringEvents.mockResolvedValue([
      { eventId: 'stale-orphan', calendarId: 'cal-1' },
    ]);
    googleCalendarService.deleteCalendarEvent.mockRejectedValueOnce(
      new Error('Delete failed'),
    );

    const result =
      await service.resyncClassScheduleWithGoogleCalendar('class-1');

    expect(result.data.failedRecurringEvents).toBe(1);
    expect(mockPrisma.classScheduleEntry.updateMany).toHaveBeenCalledWith({
      where: { id: 'slot-new', classId: 'class-1' },
      data: {
        googleCalendarEventId: 'new-event-x',
        meetLink: 'https://meet.google.com/new-event-x',
      },
    });
  });

  it('stops deleting on a quota error during the delete loop but still writes back the schedule', async () => {
    mockPrisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      name: 'Toán 9A',
      teachers: [],
    });
    mockPrisma.classScheduleEntry.findMany.mockResolvedValue([]);
    googleCalendarService.listClassScheduleRecurringEvents.mockResolvedValue([
      { eventId: 'del-1', calendarId: 'cal-1' },
      { eventId: 'del-2', calendarId: 'cal-1' },
    ]);
    googleCalendarService.deleteCalendarEvent.mockRejectedValueOnce(
      new GoogleCalendarApiError('Calendar usage limits exceeded.', {
        message: 'Calendar usage limits exceeded.',
        code: 403,
        errors: [{ reason: 'quotaExceeded' }],
      } as never),
    );

    const result =
      await service.resyncClassScheduleWithGoogleCalendar('class-1');

    expect(googleCalendarService.deleteCalendarEvent).toHaveBeenCalledTimes(1);
    expect(result.data.quotaLimited).toBe(true);
    expect(result.data.deletedRecurringEvents).toBe(0);
    expect(result.data.failedRecurringEvents).toBe(1);
    expect(result.data.warnings).toEqual([
      expect.objectContaining({ code: 'google_calendar_quota_limited' }),
    ]);
  });

  it('rethrows a consolidated error from syncScheduleWithCalendar when a recurring delete fails, after writing back the schedule', async () => {
    mockPrisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      name: 'Toán 9A',
      teachers: [],
    });
    mockPrisma.classScheduleEntry.findMany.mockResolvedValue([]);
    googleCalendarService.deleteCalendarEvent.mockRejectedValueOnce(
      new Error('Delete failed'),
    );

    await expect(
      service.syncScheduleWithCalendar('class-1', [
        {
          id: 'slot-old',
          dayOfWeek: 1,
          from: '19:00:00',
          to: '20:30:00',
          teacherId: 'teacher-1',
          googleCalendarEventId: 'del-1',
        },
      ]),
    ).rejects.toThrow(GoogleCalendarApiError);
  });

  it('stops the resync pass once the wall-clock budget is exceeded, but preserves work already done', async () => {
    mockPrisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      name: 'Toán 9A',
      teachers: [
        {
          teacherId: 'teacher-1',
          teacher: {
            id: 'teacher-1',
            user: {
              email: 'an@example.com',
              first_name: 'An',
              last_name: 'Nguyễn',
            },
          },
        },
      ],
    });
    mockPrisma.classScheduleEntry.findMany.mockResolvedValue([
      {
        id: 'slot-1',
        classId: 'class-1',
        dayOfWeek: 1,
        from: '19:00:00',
        to: '20:30:00',
        teacherId: 'teacher-1',
        meetLink: null,
        googleCalendarEventId: null,
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: null,
      },
      {
        id: 'slot-2',
        classId: 'class-1',
        dayOfWeek: 3,
        from: '18:00:00',
        to: '19:30:00',
        teacherId: 'teacher-1',
        meetLink: null,
        googleCalendarEventId: null,
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: null,
      },
    ]);
    googleCalendarService.createOrUpdateClassScheduleRecurringEvent.mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve({ eventId: 'slot-1-event', meetLink: undefined }),
            250,
          ),
        ),
    );

    const result =
      await service.resyncClassScheduleWithGoogleCalendar('class-1');

    expect(
      googleCalendarService.createOrUpdateClassScheduleRecurringEvent,
    ).toHaveBeenCalledTimes(1);
    expect(result.data.createdRecurringEvents).toBe(1);
    expect(result.data.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'resync_deadline_exceeded' }),
      ]),
    );
    expect(mockPrisma.classScheduleEntry.updateMany).toHaveBeenCalledWith({
      where: { id: 'slot-1', classId: 'class-1' },
      data: {
        googleCalendarEventId: 'slot-1-event',
        meetLink: null,
      },
    });
  }, 10000);

  it('rejects creating a makeup event when endTime is not after startTime', async () => {
    await expect(
      service.createMakeupScheduleEvent({
        classId: 'class-1',
        teacherId: 'teacher-1',
        date: '2026-05-20',
        startTime: '19:00:00',
        endTime: '19:00:00',
      }),
    ).rejects.toThrow('Giờ kết thúc phải sau giờ bắt đầu.');

    expect(mockPrisma.makeupScheduleEvent.create).not.toHaveBeenCalled();
    expect(
      googleCalendarService.createOrUpdateMakeupScheduleEvent,
    ).not.toHaveBeenCalled();
  });

  it('rejects creating a makeup event when date is before class creation date', async () => {
    mockPrisma.classTeacher.findUnique.mockResolvedValueOnce({
      classId: 'class-1',
      class: {
        createdAt: new Date('2026-05-25T00:00:00.000Z'),
      },
    });

    await expect(
      service.createMakeupScheduleEvent({
        classId: 'class-1',
        teacherId: 'teacher-1',
        date: '2026-05-24',
        startTime: '19:00:00',
        endTime: '20:30:00',
      }),
    ).rejects.toThrow('Ngày xếp lịch bù không được trước ngày tạo lớp học.');

    expect(mockPrisma.makeupScheduleEvent.create).not.toHaveBeenCalled();
  });

  it('rejects updating a makeup event when new date is before class creation date', async () => {
    mockPrisma.makeupScheduleEvent.findUnique.mockResolvedValueOnce({
      id: 'makeup-1',
      classId: 'class-1',
      teacherId: 'teacher-1',
      date: new Date('2026-05-26T00:00:00.000Z'),
      startTime: new Date('1970-01-01T19:00:00'),
      endTime: new Date('1970-01-01T20:30:00'),
    });
    mockPrisma.classTeacher.findUnique.mockResolvedValueOnce({
      classId: 'class-1',
      class: {
        createdAt: new Date('2026-05-25T00:00:00.000Z'),
      },
    });

    await expect(
      service.updateMakeupScheduleEvent('makeup-1', {
        date: '2026-05-24',
      }),
    ).rejects.toThrow('Ngày xếp lịch bù không được trước ngày tạo lớp học.');

    expect(mockPrisma.makeupScheduleEvent.update).not.toHaveBeenCalled();
  });

  it('rejects creating a makeup event from a missing fixed schedule baseline', async () => {
    mockPrisma.classScheduleEntry.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.createMakeupScheduleEvent({
        classId: 'class-1',
        teacherId: 'teacher-1',
        date: '2026-05-20',
        startTime: '19:00:00',
        endTime: '20:30:00',
        baselineScheduleEntryId: 'slot-1',
        originalDate: '2026-05-18',
      }),
    ).rejects.toThrow(
      'Buổi học gốc không còn tồn tại trong lịch cố định của lớp.',
    );

    expect(mockPrisma.makeupScheduleEvent.create).not.toHaveBeenCalled();
  });

  it('rejects partial makeup updates that would make endTime not after startTime', async () => {
    mockPrisma.makeupScheduleEvent.findUnique.mockResolvedValueOnce({
      id: 'makeup-1',
      classId: 'class-1',
      teacherId: 'teacher-1',
      linkedSessionId: null,
      date: new Date('2026-05-20T00:00:00.000Z'),
      startTime: new Date('1970-01-01T19:00:00'),
      endTime: new Date('1970-01-01T20:30:00'),
      baselineScheduleEntryId: null,
      originalDate: null,
      title: null,
      note: null,
      googleMeetLink: null,
      googleCalendarEventId: null,
      calendarSyncedAt: null,
      calendarSyncError: null,
    });

    await expect(
      service.updateMakeupScheduleEvent('makeup-1', {
        endTime: '18:30:00',
      }),
    ).rejects.toThrow('Giờ kết thúc phải sau giờ bắt đầu.');

    expect(mockPrisma.makeupScheduleEvent.update).not.toHaveBeenCalled();
    expect(
      googleCalendarService.createOrUpdateMakeupScheduleEvent,
    ).not.toHaveBeenCalled();
  });

  it('persists an empty makeup note update as null', async () => {
    mockPrisma.makeupScheduleEvent.findUnique
      .mockResolvedValueOnce({
        id: 'makeup-1',
        classId: 'class-1',
        teacherId: 'teacher-1',
        linkedSessionId: null,
        date: new Date('2026-05-20T00:00:00.000Z'),
        startTime: new Date('1970-01-01T19:00:00'),
        endTime: new Date('1970-01-01T20:30:00'),
        baselineScheduleEntryId: null,
        originalDate: null,
        title: null,
        note: 'old note',
        googleMeetLink: null,
        googleCalendarEventId: null,
        calendarSyncedAt: null,
        calendarSyncError: null,
      })
      .mockResolvedValueOnce({
        id: 'makeup-1',
        classId: 'class-1',
        teacherId: 'teacher-1',
        googleCalendarEventId: null,
        googleMeetLink: null,
        date: new Date('2026-05-20T00:00:00.000Z'),
        startTime: new Date('1970-01-01T19:00:00'),
        endTime: new Date('1970-01-01T20:30:00'),
        title: null,
        note: null,
        class: { id: 'class-1', name: 'Toán 9A' },
        teacher: {
          id: 'teacher-1',
          user: {
            email: 'an@example.com',
            first_name: 'An',
            last_name: 'Nguyễn',
          },
        },
      });
    mockPrisma.makeupScheduleEvent.update.mockResolvedValueOnce({
      id: 'makeup-1',
    });
    mockPrisma.makeupScheduleEvent.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'makeup-1',
      classId: 'class-1',
      teacherId: 'teacher-1',
      linkedSessionId: null,
      date: new Date('2026-05-20T00:00:00.000Z'),
      startTime: new Date('1970-01-01T19:00:00'),
      endTime: new Date('1970-01-01T20:30:00'),
      baselineScheduleEntryId: null,
      originalDate: null,
      title: null,
      note: null,
      googleMeetLink: 'https://meet.google.com/makeup',
      googleCalendarEventId: 'google-event-1',
      calendarSyncedAt: new Date('2026-05-19T00:00:00.000Z'),
      calendarSyncError: null,
      class: { id: 'class-1', name: 'Toán 9A' },
      teacher: {
        id: 'teacher-1',
        user: {
          email: 'an@example.com',
          first_name: 'An',
          last_name: 'Nguyễn',
        },
      },
    });

    await service.updateMakeupScheduleEvent('makeup-1', { note: '' });

    const updateArgs = getMakeupScheduleEventUpdateArgs();
    expect(updateArgs.where).toEqual({ id: 'makeup-1' });
    expect(updateArgs.data.note).toBeNull();
  });

  it('clears makeup fixed-schedule baseline when both baseline fields are null', async () => {
    mockPrisma.makeupScheduleEvent.findUnique
      .mockResolvedValueOnce({
        id: 'makeup-1',
        classId: 'class-1',
        teacherId: 'teacher-1',
        linkedSessionId: null,
        date: new Date('2026-05-20T00:00:00.000Z'),
        startTime: new Date('1970-01-01T19:00:00'),
        endTime: new Date('1970-01-01T20:30:00'),
        baselineScheduleEntryId: 'slot-1',
        originalDate: new Date('2026-05-18T00:00:00.000Z'),
        title: null,
        note: null,
        googleMeetLink: null,
        googleCalendarEventId: null,
        calendarSyncedAt: null,
        calendarSyncError: null,
      })
      .mockResolvedValueOnce({
        id: 'makeup-1',
        classId: 'class-1',
        teacherId: 'teacher-1',
        googleCalendarEventId: null,
        googleMeetLink: null,
        date: new Date('2026-05-20T00:00:00.000Z'),
        startTime: new Date('1970-01-01T19:00:00'),
        endTime: new Date('1970-01-01T20:30:00'),
        title: null,
        note: null,
        class: { id: 'class-1', name: 'Toán 9A' },
        teacher: {
          id: 'teacher-1',
          user: {
            email: 'an@example.com',
            first_name: 'An',
            last_name: 'Nguyễn',
          },
        },
      });
    mockPrisma.makeupScheduleEvent.update.mockResolvedValueOnce({
      id: 'makeup-1',
    });
    mockPrisma.makeupScheduleEvent.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'makeup-1',
      classId: 'class-1',
      teacherId: 'teacher-1',
      linkedSessionId: null,
      date: new Date('2026-05-20T00:00:00.000Z'),
      startTime: new Date('1970-01-01T19:00:00'),
      endTime: new Date('1970-01-01T20:30:00'),
      baselineScheduleEntryId: null,
      originalDate: null,
      title: null,
      note: null,
      googleMeetLink: 'https://meet.google.com/makeup',
      googleCalendarEventId: 'google-event-1',
      calendarSyncedAt: new Date('2026-05-19T00:00:00.000Z'),
      calendarSyncError: null,
      class: { id: 'class-1', name: 'Toán 9A' },
      teacher: {
        id: 'teacher-1',
        user: {
          email: 'an@example.com',
          first_name: 'An',
          last_name: 'Nguyễn',
        },
      },
    });

    await service.updateMakeupScheduleEvent('makeup-1', {
      baselineScheduleEntryId: null,
      originalDate: null,
    });

    const updateArgs = getMakeupScheduleEventUpdateArgs();
    expect(updateArgs.where).toEqual({ id: 'makeup-1' });
    expect(updateArgs.data.baselineScheduleEntryId).toBeNull();
    expect(updateArgs.data.originalDate).toBeNull();
  });

  it('keeps the makeup event when Google Calendar delete fails', async () => {
    mockPrisma.makeupScheduleEvent.findUnique.mockResolvedValueOnce({
      id: 'makeup-1',
      classId: 'class-1',
      teacherId: 'teacher-1',
      linkedSessionId: null,
      date: new Date('2026-05-20T00:00:00.000Z'),
      startTime: new Date('1970-01-01T19:00:00'),
      endTime: new Date('1970-01-01T20:30:00'),
      baselineScheduleEntryId: null,
      originalDate: null,
      title: null,
      note: null,
      googleMeetLink: null,
      googleCalendarEventId: 'google-event-1',
      calendarSyncedAt: new Date('2026-05-19T00:00:00.000Z'),
      calendarSyncError: null,
    });
    googleCalendarService.deleteCalendarEvent.mockRejectedValueOnce(
      new Error('Google delete failed'),
    );

    await expect(service.deleteMakeupScheduleEvent('makeup-1')).rejects.toThrow(
      'Buổi bù vẫn được giữ lại để thử lại',
    );

    expect(mockPrisma.makeupScheduleEvent.update).toHaveBeenCalledWith({
      where: { id: 'makeup-1' },
      data: { calendarSyncError: 'Google delete failed' },
    });
    expect(mockPrisma.makeupScheduleEvent.delete).not.toHaveBeenCalled();
  });

  it('records audit history when deleting a makeup event', async () => {
    const event = {
      id: 'makeup-1',
      classId: 'class-1',
      teacherId: 'teacher-1',
      linkedSessionId: null,
      date: new Date('2026-05-20T00:00:00.000Z'),
      startTime: new Date('1970-01-01T19:00:00'),
      endTime: new Date('1970-01-01T20:30:00'),
      baselineScheduleEntryId: null,
      originalDate: null,
      title: null,
      note: null,
      googleMeetLink: null,
      googleCalendarEventId: null,
      calendarSyncedAt: null,
      calendarSyncError: null,
    };
    mockPrisma.makeupScheduleEvent.findUnique.mockResolvedValueOnce(event);

    await service.deleteMakeupScheduleEvent('makeup-1', {
      userId: 'admin-1',
      userEmail: 'admin@example.com',
      roleType: 'admin',
    });

    expect(mockPrisma.makeupScheduleEvent.delete).toHaveBeenCalledWith({
      where: { id: 'makeup-1' },
    });
    const deleteArgs = getActionHistoryDeleteArgs();
    expect(deleteArgs.actor.userId).toBe('admin-1');
    expect(deleteArgs).toMatchObject({
      entityType: 'makeup_schedule_event',
      entityId: 'makeup-1',
      description: 'Xóa buổi bù',
    });
  });

  it('recreates a makeup Google Calendar event when the stored event id is stale', async () => {
    mockPrisma.makeupScheduleEvent.findUnique
      .mockResolvedValueOnce({
        classId: 'class-1',
        teacherId: 'teacher-1',
      })
      .mockResolvedValueOnce({
        id: 'makeup-1',
        classId: 'class-1',
        teacherId: 'teacher-1',
        googleCalendarEventId: 'stale-google-event',
        googleMeetLink: null,
        date: new Date('2026-05-20T00:00:00.000Z'),
        startTime: new Date('1970-01-01T19:00:00'),
        endTime: new Date('1970-01-01T20:30:00'),
        title: null,
        note: 'Học bù',
        class: { id: 'class-1', name: 'Toán 9A' },
        teacher: {
          id: 'teacher-1',
          user: {
            email: 'an@example.com',
            first_name: 'An',
            last_name: 'Nguyễn',
          },
        },
      });
    googleCalendarService.createOrUpdateMakeupScheduleEvent
      .mockRejectedValueOnce(
        new GoogleCalendarApiError('Failed to update makeup event', {
          message: 'Not found',
          response: { status: 404 },
        } as never),
      )
      .mockResolvedValueOnce({
        eventId: 'replacement-google-event',
        meetLink: 'https://meet.google.com/replacement',
      });

    const result =
      await service.resyncMakeupScheduleEventWithGoogleCalendarForClass(
        'class-1',
        'makeup-1',
      );

    expect(result.data).toMatchObject({
      classId: 'class-1',
      makeupEventId: 'makeup-1',
      teacherId: 'teacher-1',
      googleCalendarEventId: 'replacement-google-event',
      googleMeetLink: 'https://meet.google.com/replacement',
      recoveredStaleEvent: true,
    });
    expect(
      googleCalendarService.createOrUpdateMakeupScheduleEvent,
    ).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        makeupEventId: 'makeup-1',
        calendarEventId: 'stale-google-event',
      }),
    );
    expect(
      googleCalendarService.createOrUpdateMakeupScheduleEvent,
    ).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        makeupEventId: 'makeup-1',
        calendarEventId: undefined,
      }),
    );
    const updateMock = mockPrisma.makeupScheduleEvent
      .update as jest.MockedFunction<
      (args: MakeupScheduleEventUpdateArgs) => Promise<unknown>
    >;
    const updateCall = updateMock.mock.calls[0]?.[0];
    expect(updateCall).toBeDefined();
    expect(updateCall?.where).toEqual({ id: 'makeup-1' });
    expect(updateCall?.data).toMatchObject({
      googleCalendarEventId: 'replacement-google-event',
      googleMeetLink: 'https://meet.google.com/replacement',
      calendarSyncError: null,
    });
    expect(updateCall?.data.calendarSyncedAt).toBeInstanceOf(Date);
  });
});
