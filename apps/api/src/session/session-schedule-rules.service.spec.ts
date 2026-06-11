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
    service = new SessionScheduleRulesService(prisma as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('allows creating a session on the fixed schedule day within the 3 hour window', async () => {
    prisma.class.findUnique.mockResolvedValue({
      schedule: [
        {
          id: 'slot-1',
          dayOfWeek: 1,
          from: '19:00:00',
          to: '20:30:00',
          teacherId: 'teacher-1',
        },
      ],
    });
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

  it('blocks creating a session when the date has no fixed or makeup schedule', async () => {
    prisma.class.findUnique.mockResolvedValue({
      schedule: [
        {
          id: 'slot-1',
          dayOfWeek: 1,
          from: '19:00:00',
          teacherId: 'teacher-1',
        },
      ],
    });
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
    prisma.class.findUnique.mockResolvedValue({
      schedule: [
        {
          id: 'slot-1',
          dayOfWeek: 1,
          from: '19:00:00',
          teacherId: 'teacher-1',
        },
      ],
    });
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
    prisma.class.findUnique.mockResolvedValue({
      schedule: [],
    });
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
      schedule: [
        {
          id: 'slot-1',
          dayOfWeek: 1,
          from: '08:00:00',
          to: '09:30:00',
          teacherId: 'teacher-1',
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

  it('omits missed alerts for dates before the class creation date', async () => {
    prisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      name: 'IELTS Foundation',
      status: 'running',
      createdAt: new Date('2026-05-27T00:00:00.000Z'), // Created Wednesday May 27th
      schedule: [
        {
          id: 'slot-1',
          dayOfWeek: 1, // Monday May 25th
          from: '08:00:00',
          to: '09:30:00',
          teacherId: 'teacher-1',
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
      schedule: [
        {
          id: 'slot-1',
          dayOfWeek: 1,
          from: '08:00:00',
          to: '09:30:00',
          teacherId: 'teacher-1',
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
      schedule: [
        {
          id: 'slot-1',
          dayOfWeek: 1,
          from: '08:00:00',
          to: '09:30:00',
          teacherId: 'teacher-1',
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
      schedule: [],
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
      schedule: [
        {
          id: 'slot-1',
          dayOfWeek: 1,
          from: '08:00:00',
          to: '09:30:00',
          teacherId: 'teacher-1',
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
      schedule: [
        {
          id: 'slot-1',
          dayOfWeek: 1,
          from: '09:00:00',
          to: '11:00:00',
          teacherId: 'teacher-1',
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

    it('includes missed alert when session time is outside tolerance', async () => {
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
  });

  it('respects schedule entry active range (createdAt and deletedAt)', async () => {
    prisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      name: 'IELTS Foundation',
      status: 'running',
      createdAt: new Date('2026-05-20T00:00:00.000Z'),
      schedule: [
        {
          id: 'slot-1',
          dayOfWeek: 1, // Monday May 25
          from: '08:00:00',
          to: '09:30:00',
          teacherId: 'teacher-1',
          createdAt: '2026-05-26T00:00:00.000Z', // Active from May 26 (after May 25)
        },
        {
          id: 'slot-2',
          dayOfWeek: 1, // Monday May 25
          from: '10:00:00',
          to: '11:30:00',
          teacherId: 'teacher-1',
          deletedAt: '2026-05-24T00:00:00.000Z', // Deleted before May 25
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

    // Checking last 7 days (May 23 to May 29). Both Monday slots should be omitted since one starts in future and one is deleted.
    await expect(
      service.getMissedTeachingAlertsByClass('class-1', 7),
    ).resolves.toEqual([]);
  });
});
