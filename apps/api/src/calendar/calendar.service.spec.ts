jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));

jest.mock('../../generated/client', () => ({
  Prisma: {},
}));

import { CalendarService } from './calendar.service';

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

describe('CalendarService', () => {
  const mockPrisma = {
    class: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    makeupScheduleEvent: {
      findMany: jest.fn(),
    },
    studentExamSchedule: {
      findMany: jest.fn(),
    },
    staffInfo: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };
  const googleCalendarService = {
    deleteCalendarEvent: jest.fn(),
    createOrUpdateClassScheduleRecurringEvent: jest.fn(),
    createOrUpdateMakeupScheduleEvent: jest.fn(),
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

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.class.findMany.mockResolvedValue([]);
    mockPrisma.class.findUnique.mockResolvedValue(null);
    mockPrisma.class.update.mockResolvedValue({});
    mockPrisma.makeupScheduleEvent.findMany.mockResolvedValue([]);
    mockPrisma.studentExamSchedule.findMany.mockResolvedValue([]);
    mockPrisma.staffInfo.findMany.mockResolvedValue([]);
    mockPrisma.staffInfo.count.mockResolvedValue(0);

    service = new CalendarService(
      mockPrisma as never,
      googleCalendarService as never,
      { ensureTutorMeetLink: jest.fn().mockResolvedValue(null) } as never,
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

    const result = await service.getStaffScheduleEvents('teacher-1', {
      startDate: '2026-05-01',
      endDate: '2026-05-31',
    } as never);

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

  it('includes classId filters when building teacher exam scope', async () => {
    await service.getStaffScheduleEvents('teacher-7', {
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      classId: 'class-7',
    } as never);

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
      data: [{ id: 'teacher-1', name: 'An Nguyễn' }],
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
        schedule: [
          {
            id: 'slot-1',
            dayOfWeek: 1,
            from: '19:00:00',
            to: '20:30:00',
            teacherId: 'teacher-1',
            meetLink: 'https://meet.google.com/old-slot-link',
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

    const result = await service.getStaffScheduleEvents('teacher-1', {
      startDate: '2026-05-18',
      endDate: '2026-05-18',
    } as never);

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
    );

    mockPrisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      name: 'Toán 9A',
      schedule: [
        {
          id: 'slot-1',
          dayOfWeek: 1,
          from: '19:00:00',
          to: '20:30:00',
          teacherId: 'teacher-1',
          meetLink: 'https://meet.google.com/old-slot-link',
        },
      ],
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
    expect(mockPrisma.class.update).toHaveBeenCalledWith({
      where: { id: 'class-1' },
      data: {
        schedule: [
          {
            id: 'slot-1',
            dayOfWeek: 1,
            from: '19:00:00',
            to: '20:30:00',
            teacherId: 'teacher-1',
            googleCalendarEventId: 'calendar-event-1',
            meetLink: 'https://meet.google.com/fixed-teacher-link',
          },
        ],
      },
    });
  });
});
