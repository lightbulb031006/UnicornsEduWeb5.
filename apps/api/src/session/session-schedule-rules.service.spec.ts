jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));

import { BadRequestException } from '@nestjs/common';
import { SessionScheduleRulesService } from './session-schedule-rules.service';

describe('SessionScheduleRulesService', () => {
  const prisma = {
    class: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    classScheduleEntry: {
      findMany: jest.fn(),
    },
    classTeacher: {
      findUnique: jest.fn(),
    },
    session: {
      findMany: jest.fn(),
    },
    makeupScheduleEvent: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    missedTeachingExplanation: {
      findMany: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
  };

  let service: SessionScheduleRulesService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-05-29T12:00:00'));
    prisma.missedTeachingExplanation.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);
    prisma.classScheduleEntry.findMany.mockResolvedValue([]);
    prisma.classTeacher.findUnique.mockResolvedValue({ status: 'active' });
    service = new SessionScheduleRulesService(prisma as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('allows creating a session on the fixed schedule day within the 3 hour window', async () => {
    prisma.classScheduleEntry.findMany.mockResolvedValue([
      {
        from: '19:00:00',
      },
    ]);
    prisma.makeupScheduleEvent.findMany.mockResolvedValue([]);

    await expect(
      service.assertSessionMatchesDeclaredSchedule(prisma as never, {
        classId: 'class-1',
        teacherId: 'teacher-1',
        date: new Date(Date.UTC(2026, 4, 18)),
        startTime: '21:59:00',
      }),
    ).resolves.toEqual({});
  });

  it('allows an active class teacher to submit a session for a slot owned by another teacher (dạy thay)', async () => {
    prisma.classTeacher.findUnique.mockResolvedValue({ status: 'active' });
    prisma.classScheduleEntry.findMany.mockResolvedValue([
      {
        from: '19:00:00',
      },
    ]);
    prisma.makeupScheduleEvent.findMany.mockResolvedValue([]);

    await expect(
      service.assertSessionMatchesDeclaredSchedule(prisma as never, {
        classId: 'class-1',
        teacherId: 'teacher-substitute',
        date: new Date(Date.UTC(2026, 4, 18)),
        startTime: '19:00:00',
      }),
    ).resolves.toEqual({});
    expect(prisma.classScheduleEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ teacherId: expect.anything() }),
      }),
    );
  });

  it("blocks a removed (inactive) class teacher from matching another teacher's slot", async () => {
    prisma.classTeacher.findUnique.mockResolvedValue({ status: 'inactive' });
    prisma.classScheduleEntry.findMany.mockResolvedValue([]);
    prisma.makeupScheduleEvent.findMany.mockResolvedValue([]);

    await expect(
      service.assertSessionMatchesDeclaredSchedule(prisma as never, {
        classId: 'class-1',
        teacherId: 'teacher-removed',
        date: new Date(Date.UTC(2026, 4, 18)),
        startTime: '19:00:00',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.classScheduleEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ teacherId: 'teacher-removed' }),
      }),
    );
  });

  it('blocks creating a session when the date has no fixed or makeup schedule', async () => {
    prisma.classScheduleEntry.findMany.mockResolvedValue([]);
    prisma.makeupScheduleEvent.findMany.mockResolvedValue([]);

    await expect(
      service.assertSessionMatchesDeclaredSchedule(prisma as never, {
        classId: 'class-1',
        teacherId: 'teacher-1',
        date: new Date(Date.UTC(2026, 4, 19)),
        startTime: '19:00:00',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('blocks creating a session when start time is more than 3 hours from declared schedule', async () => {
    prisma.classScheduleEntry.findMany.mockResolvedValue([
      {
        from: '19:00:00',
      },
    ]);
    prisma.makeupScheduleEvent.findMany.mockResolvedValue([]);

    await expect(
      service.assertSessionMatchesDeclaredSchedule(prisma as never, {
        classId: 'class-1',
        teacherId: 'teacher-1',
        date: new Date(Date.UTC(2026, 4, 18)),
        startTime: '15:59:00',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('links an unlinked matching makeup schedule event', async () => {
    const makeupDate = new Date(Date.UTC(2026, 4, 19));
    prisma.classScheduleEntry.findMany.mockResolvedValue([]);
    prisma.makeupScheduleEvent.findMany.mockResolvedValue([
      {
        id: 'makeup-1',
        linkedSessionId: null,
        startTime: new Date('1970-01-01T18:30:00.000Z'),
      },
    ]);

    await expect(
      service.assertSessionMatchesDeclaredSchedule(prisma as never, {
        classId: 'class-1',
        teacherId: 'teacher-1',
        date: makeupDate,
        startTime: '19:00:00',
      }),
    ).resolves.toEqual({ makeupEventId: 'makeup-1' });
  });

  it('omits missed alerts once the fixed occurrence has a makeup schedule', async () => {
    prisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      name: 'IELTS Foundation',
      status: 'running',
      scheduleEntries: [
        {
          id: 'slot-1',
          dayOfWeek: 1,
          from: '08:00:00',
          to: '09:30:00',
          teacherId: 'teacher-1',
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
          effectiveTo: null,
        },
      ],
      teachers: [
        {
          teacherId: 'teacher-1',
          status: 'active',
          teacher: {
            id: 'teacher-1',
            user: {
              first_name: 'An',
              last_name: 'Nguyen',
              email: 'an@example.com',
            },
          },
        },
      ],
    });
    prisma.session.findMany.mockResolvedValue([]);
    prisma.makeupScheduleEvent.findMany.mockResolvedValue([
      {
        classId: 'class-1',
        teacherId: 'teacher-1',
        baselineScheduleEntryId: 'slot-1',
        originalDate: new Date(Date.UTC(2026, 4, 25)),
      },
    ]);

    await expect(
      service.getMissedTeachingAlertsByClass('class-1', 7),
    ).resolves.toEqual([]);
  });

  it('omits missed alerts for dates before the schedule entry effectiveFrom', async () => {
    prisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      name: 'IELTS Foundation',
      status: 'running',
      createdAt: new Date('2026-05-27T00:00:00.000Z'), // Created Wednesday May 27th
      scheduleEntries: [
        {
          id: 'slot-1',
          dayOfWeek: 1, // Monday May 25th
          from: '08:00:00',
          to: '09:30:00',
          teacherId: 'teacher-1',
          effectiveFrom: new Date('2026-05-27T00:00:00.000Z'),
          effectiveTo: null,
        },
      ],
      teachers: [
        {
          teacherId: 'teacher-1',
          status: 'active',
          teacher: {
            id: 'teacher-1',
            user: {
              first_name: 'An',
              last_name: 'Nguyen',
              email: 'an@example.com',
            },
          },
        },
      ],
    });
    prisma.session.findMany.mockResolvedValue([]);
    prisma.makeupScheduleEvent.findMany.mockResolvedValue([]);

    // Checking last 7 days (May 23 to May 29). Monday May 25 is before May 27, so it should be omitted.
    await expect(
      service.getMissedTeachingAlertsByClass('class-1', 7),
    ).resolves.toEqual([]);
  });

  it('omits missed alerts with originalDate before 2026-06-01', async () => {
    prisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      name: 'IELTS Foundation',
      status: 'running',
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      scheduleEntries: [
        {
          id: 'slot-1',
          dayOfWeek: 1,
          from: '08:00:00',
          to: '09:30:00',
          teacherId: 'teacher-1',
          effectiveFrom: new Date('2026-05-01T00:00:00.000Z'),
          effectiveTo: null,
        },
      ],
      teachers: [
        {
          teacherId: 'teacher-1',
          status: 'active',
          teacher: {
            id: 'teacher-1',
            user: {
              first_name: 'An',
              last_name: 'Nguyen',
              email: 'an@example.com',
            },
          },
        },
      ],
    });
    prisma.session.findMany.mockResolvedValue([]);
    prisma.makeupScheduleEvent.findMany.mockResolvedValue([]);

    await expect(
      service.getMissedTeachingAlertsByClass('class-1', 31),
    ).resolves.toEqual([]);
  });

  it('includes missed alerts with originalDate on or after 2026-06-01', async () => {
    jest.setSystemTime(new Date('2026-06-05T12:00:00'));

    prisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      name: 'IELTS Foundation',
      status: 'running',
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      scheduleEntries: [
        {
          id: 'slot-1',
          dayOfWeek: 1,
          from: '08:00:00',
          to: '09:30:00',
          teacherId: 'teacher-1',
          effectiveFrom: new Date('2026-05-01T00:00:00.000Z'),
          effectiveTo: null,
        },
      ],
      teachers: [
        {
          teacherId: 'teacher-1',
          status: 'active',
          teacher: {
            id: 'teacher-1',
            user: {
              first_name: 'An',
              last_name: 'Nguyen',
              email: 'an@example.com',
            },
          },
        },
      ],
    });
    prisma.session.findMany.mockResolvedValue([]);
    prisma.makeupScheduleEvent.findMany.mockResolvedValue([]);

    await expect(
      service.getMissedTeachingAlertsByClass('class-1', 7),
    ).resolves.toEqual([
      expect.objectContaining({
        classId: 'class-1',
        originalDate: '2026-06-01',
        scheduleEntryId: 'slot-1',
        status: 'pending_explanation',
      }),
    ]);
  });

  it('returns empty alerts for ended classes', async () => {
    prisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      name: 'IELTS Foundation',
      status: 'ended',
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      scheduleEntries: [],
      teachers: [],
    });

    await expect(
      service.getMissedTeachingAlertsByClass('class-1', 7),
    ).resolves.toEqual([]);
  });

  it('marks alerts as explained_pending_makeup when explanation exists', async () => {
    jest.setSystemTime(new Date('2026-06-05T12:00:00'));

    prisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      name: 'IELTS Foundation',
      status: 'running',
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      scheduleEntries: [
        {
          id: 'slot-1',
          dayOfWeek: 1,
          from: '08:00:00',
          to: '09:30:00',
          teacherId: 'teacher-1',
          effectiveFrom: new Date('2026-05-01T00:00:00.000Z'),
          effectiveTo: null,
        },
      ],
      teachers: [
        {
          teacherId: 'teacher-1',
          status: 'active',
          teacher: {
            id: 'teacher-1',
            user: {
              first_name: 'An',
              last_name: 'Nguyen',
              email: 'an@example.com',
            },
          },
        },
      ],
    });
    prisma.session.findMany.mockResolvedValue([]);
    prisma.makeupScheduleEvent.findMany.mockResolvedValue([]);
    prisma.missedTeachingExplanation.findMany.mockResolvedValue([
      {
        id: 'explanation-1',
        classId: 'class-1',
        teacherId: 'teacher-1',
        baselineScheduleEntryId: 'slot-1',
        originalDate: new Date(Date.UTC(2026, 5, 1)),
        reason: 'Gia sư ốm',
        createdAt: new Date('2026-06-02T10:00:00.000Z'),
        explainedByUserId: 'user-1',
      },
    ]);
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'user-1',
        first_name: 'Admin',
        last_name: 'User',
        email: 'admin@example.com',
      },
    ]);

    await expect(
      service.getMissedTeachingAlertsByClass('class-1', 7),
    ).resolves.toEqual([
      expect.objectContaining({
        status: 'explained_pending_makeup',
        explanation: expect.objectContaining({
          id: 'explanation-1',
          reason: 'Gia sư ốm',
          canEdit: true,
        }),
      }),
    ]);
  });

  describe('missed alert session matching (Asia/Ho_Chi_Minh)', () => {
    const originalTz = process.env.TZ;

    beforeEach(() => {
      process.env.TZ = 'Asia/Ho_Chi_Minh';
      jest.setSystemTime(new Date('2026-06-02T12:00:00'));
    });

    afterEach(() => {
      if (originalTz === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTz;
      }
    });

    const classFixture = {
      id: 'class-1',
      name: 'IELTS Foundation',
      status: 'running',
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      scheduleEntries: [
        {
          id: 'slot-1',
          dayOfWeek: 1,
          from: '09:00:00',
          to: '11:00:00',
          teacherId: 'teacher-1',
          effectiveFrom: new Date('2026-05-01T00:00:00.000Z'),
          effectiveTo: null,
        },
      ],
      teachers: [
        {
          teacherId: 'teacher-1',
          status: 'active',
          teacher: {
            id: 'teacher-1',
            user: {
              first_name: 'An',
              last_name: 'Nguyen',
              email: 'an@example.com',
            },
          },
        },
      ],
    };

    it('omits missed alert when a matching session exists', async () => {
      prisma.class.findUnique.mockResolvedValue(classFixture);
      prisma.session.findMany.mockResolvedValue([
        {
          classId: 'class-1',
          teacherId: 'teacher-1',
          date: new Date(Date.UTC(2026, 5, 1)),
          startTime: new Date('1970-01-01T09:00:00.000Z'),
        },
      ]);
      prisma.makeupScheduleEvent.findMany.mockResolvedValue([]);

      await expect(
        service.getMissedTeachingAlertsByClass('class-1', 7),
      ).resolves.toEqual([]);
    });

    it('includes missed alert when session time is outside the 60-minute alert tolerance', async () => {
      prisma.class.findUnique.mockResolvedValue(classFixture);
      prisma.session.findMany.mockResolvedValue([
        {
          classId: 'class-1',
          teacherId: 'teacher-1',
          date: new Date(Date.UTC(2026, 5, 1)),
          startTime: new Date('1970-01-01T15:00:00.000Z'),
        },
      ]);
      prisma.makeupScheduleEvent.findMany.mockResolvedValue([]);

      await expect(
        service.getMissedTeachingAlertsByClass('class-1', 7),
      ).resolves.toEqual([
        expect.objectContaining({
          classId: 'class-1',
          originalDate: '2026-06-01',
          scheduledStartTime: '09:00:00',
        }),
      ]);
    });

    it('omits missed alert when session time is within the 60-minute alert tolerance but outside the old 180-minute one', async () => {
      prisma.class.findUnique.mockResolvedValue(classFixture);
      prisma.session.findMany.mockResolvedValue([
        {
          classId: 'class-1',
          teacherId: 'teacher-1',
          date: new Date(Date.UTC(2026, 5, 1)),
          // 09:45 start vs 09:00 scheduled: 45 minutes off, inside 60 but would
          // also have matched the old 180-minute tolerance.
          startTime: new Date('1970-01-01T09:45:00.000Z'),
        },
      ]);
      prisma.makeupScheduleEvent.findMany.mockResolvedValue([]);

      await expect(
        service.getMissedTeachingAlertsByClass('class-1', 7),
      ).resolves.toEqual([]);
    });

    it('omits missed alert when another active teacher of the class taught the slot as a substitute', async () => {
      prisma.class.findUnique.mockResolvedValue({
        ...classFixture,
        teachers: [
          ...classFixture.teachers,
          {
            teacherId: 'teacher-2',
            status: 'active',
            teacher: {
              id: 'teacher-2',
              user: {
                first_name: 'Binh',
                last_name: 'Tran',
                email: 'binh@example.com',
              },
            },
          },
        ],
      });
      prisma.session.findMany.mockResolvedValue([
        {
          classId: 'class-1',
          teacherId: 'teacher-2',
          date: new Date(Date.UTC(2026, 5, 1)),
          startTime: new Date('1970-01-01T09:00:00.000Z'),
        },
      ]);
      prisma.makeupScheduleEvent.findMany.mockResolvedValue([]);

      await expect(
        service.getMissedTeachingAlertsByClass('class-1', 7),
      ).resolves.toEqual([]);
    });

    it('still raises alert when a teacher outside the class taught the slot', async () => {
      prisma.class.findUnique.mockResolvedValue(classFixture);
      prisma.session.findMany.mockResolvedValue([
        {
          classId: 'class-1',
          teacherId: 'teacher-outsider',
          date: new Date(Date.UTC(2026, 5, 1)),
          startTime: new Date('1970-01-01T09:00:00.000Z'),
        },
      ]);
      prisma.makeupScheduleEvent.findMany.mockResolvedValue([]);

      await expect(
        service.getMissedTeachingAlertsByClass('class-1', 7),
      ).resolves.toEqual([
        expect.objectContaining({
          classId: 'class-1',
          originalDate: '2026-06-01',
        }),
      ]);
    });
  });

  it('respects schedule entry active range (effectiveFrom and effectiveTo)', async () => {
    prisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      name: 'IELTS Foundation',
      status: 'running',
      createdAt: new Date('2026-05-20T00:00:00.000Z'),
      scheduleEntries: [
        {
          id: 'slot-1',
          dayOfWeek: 1, // Monday May 25
          from: '08:00:00',
          to: '09:30:00',
          teacherId: 'teacher-1',
          effectiveFrom: new Date('2026-05-26T00:00:00.000Z'), // Active from May 26 (after May 25)
          effectiveTo: null,
        },
        {
          id: 'slot-2',
          dayOfWeek: 1, // Monday May 25
          from: '10:00:00',
          to: '11:30:00',
          teacherId: 'teacher-1',
          effectiveFrom: new Date('2026-05-01T00:00:00.000Z'),
          effectiveTo: new Date('2026-05-24T00:00:00.000Z'), // Closed before May 25
        },
      ],
      teachers: [
        {
          teacherId: 'teacher-1',
          status: 'active',
          teacher: {
            id: 'teacher-1',
            user: {
              first_name: 'An',
              last_name: 'Nguyen',
              email: 'an@example.com',
            },
          },
        },
      ],
    });
    prisma.session.findMany.mockResolvedValue([]);
    prisma.makeupScheduleEvent.findMany.mockResolvedValue([]);

    // Checking last 7 days (May 23 to May 29). Both Monday slots should be omitted since one starts in future and one is closed.
    await expect(
      service.getMissedTeachingAlertsByClass('class-1', 7),
    ).resolves.toEqual([]);
  });

  it('still raises alert for closed entry even when teacher is no longer active', async () => {
    // Dùng fake time sau MISSED_TEACHING_ALERT_MIN_DATE_KEY (2026-06-01)
    // Today = 2026-06-10 (Thứ 3), range 7 ngày = 2026-06-04 → 2026-06-10
    // Thứ 2 trong range: 2026-06-08
    jest.setSystemTime(new Date('2026-06-10T12:00:00'));

    // Scenario: teacher-old đã bị inactive, nhưng entry lịch của họ
    // có effectiveTo = 2026-06-10 → buổi thứ 2 (08/06) trước effectiveTo vẫn phải raise alert.
    prisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      name: 'IELTS Foundation',
      status: 'running',
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      scheduleEntries: [
        {
          id: 'slot-old',
          dayOfWeek: 1, // Monday June 8 2026
          from: '09:00:00',
          to: '10:30:00',
          teacherId: 'teacher-old',
          effectiveFrom: new Date('2026-05-01T00:00:00.000Z'),
          effectiveTo: new Date('2026-06-10T00:00:00.000Z'), // closed today → June 8 còn hợp lệ
        },
      ],
      teachers: [
        {
          // teacher-old không còn active
          teacherId: 'teacher-old',
          status: 'inactive',
          teacher: {
            id: 'teacher-old',
            user: {
              first_name: 'Cu',
              last_name: 'Old',
              email: 'old@example.com',
            },
          },
        },
      ],
    });
    prisma.session.findMany.mockResolvedValue([]);
    prisma.makeupScheduleEvent.findMany.mockResolvedValue([]);

    const alerts = await service.getMissedTeachingAlertsByClass('class-1', 7);
    // June 8 (Mon) nằm trong range, trước effectiveTo June 10 → phải có alert
    expect(alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          classId: 'class-1',
          teacherId: 'teacher-old',
          originalDate: '2026-06-08',
          scheduleEntryId: 'slot-old',
        }),
      ]),
    );
  });
});
