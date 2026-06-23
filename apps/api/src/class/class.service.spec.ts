jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));

jest.mock('../staff-ops/staff-operations-access.service', () => ({
  StaffOperationsAccessService: class StaffOperationsAccessServiceMock {},
}));

jest.mock('../action-history/action-history.service', () => ({
  ActionHistoryService: class ActionHistoryServiceMock {},
}));

jest.mock('../calendar/calendar.service', () => ({
  CalendarService: class CalendarServiceMock {},
}));

jest.mock('../../generated/client', () => ({
  Prisma: {
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings,
      values,
    }),
  },
}));

import { ClassService } from './class.service';
import { BadRequestException } from '@nestjs/common';
import {
  ClassStatus,
  ClassType,
  StaffRole,
  StaffStatus,
  StudentClassStatus,
  StudentStatus,
  UserRole,
} from '../../generated/enums';

type ClassServiceTestAccess = {
  getClassAuditSnapshot: (...args: unknown[]) => Promise<{
    id: string;
    status: ClassStatus;
    schedule: unknown[];
    teachers: never[];
  } | null>;
};

describe('ClassService', () => {
  const mockTx = {
    class: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    classTeacher: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
    staffInfo: {
      findMany: jest.fn(),
    },
    studentInfo: {
      findMany: jest.fn(),
    },
    studentClass: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      createMany: jest.fn(),
      create: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };

  const mockPrisma = {
    class: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    classTeacher: {
      findMany: jest.fn(),
    },
    makeupScheduleEvent: {
      findMany: jest.fn(),
    },
    studentClass: {
      groupBy: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };

  const mockStaffOperationsAccess = {
    resolveActor: jest.fn(),
    assertTeacherAssignedToClass: jest.fn(),
  };
  const mockActionHistoryService = {
    recordUpdate: jest.fn(),
  };
  const mockCalendarService = {
    syncScheduleWithCalendar: jest.fn().mockResolvedValue(undefined),
    deleteMakeupScheduleEvent: jest.fn().mockResolvedValue(undefined),
  };

  let service: ClassService;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPrisma.class.findUnique.mockResolvedValue({
      id: 'class-1',
      name: 'Math 10A',
      schedule: [],
      allowancePerSessionPerStudent: 120000,
    });
    mockPrisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mockTx) => Promise<unknown>) =>
        callback(mockTx),
    );
    mockPrisma.$queryRaw.mockResolvedValue([
      { session_count: 0, unpaid_session_count: 0 },
    ]);
    mockTx.$queryRaw.mockResolvedValue([
      { session_count: 0, unpaid_session_count: 0 },
    ]);
    mockTx.class.create.mockResolvedValue({
      id: 'class-1',
      name: 'Math 10A',
      type: ClassType.basic,
      status: ClassStatus.running,
      maxStudents: null,
      allowancePerSessionPerStudent: null,
      maxAllowancePerSession: null,
      scaleAmount: null,
      schedule: [],
      studentTuitionPerSession: null,
      tuitionPackageTotal: null,
      tuitionPackageSession: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    mockTx.class.findUnique.mockResolvedValue({
      id: 'class-1',
      name: 'Math 10A',
      type: ClassType.basic,
      status: ClassStatus.running,
      maxStudents: null,
      allowancePerSessionPerStudent: null,
      maxAllowancePerSession: null,
      scaleAmount: null,
      schedule: [],
      studentTuitionPerSession: null,
      tuitionPackageTotal: null,
      tuitionPackageSession: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    mockTx.class.update.mockResolvedValue({ id: 'class-1' });
    mockTx.classTeacher.findMany.mockResolvedValue([]);
    mockTx.classTeacher.deleteMany.mockResolvedValue({ count: 1 });
    mockTx.classTeacher.createMany.mockResolvedValue({ count: 1 });
    mockTx.classTeacher.update.mockResolvedValue({});
    mockTx.classTeacher.updateMany.mockResolvedValue({ count: 0 });
    mockTx.classTeacher.findUnique.mockResolvedValue(null);
    mockTx.staffInfo.findMany.mockImplementation((args: any) => {
      const ids = args?.where?.id?.in ?? [];
      return ids.map((id: string) => ({ id, status: StaffStatus.active }));
    });
    mockTx.studentInfo.findMany.mockImplementation((args: any) => {
      const ids = args?.where?.id?.in ?? [];
      return ids.map((id: string) => ({ id, status: StudentStatus.active }));
    });
    mockTx.studentClass.findMany.mockResolvedValue([]);
    mockTx.studentClass.updateMany.mockResolvedValue({ count: 0 });
    mockTx.studentClass.createMany.mockResolvedValue({ count: 0 });
    mockTx.studentClass.create.mockResolvedValue({});
    mockPrisma.class.count.mockResolvedValue(0);
    mockPrisma.class.findMany.mockResolvedValue([]);
    mockPrisma.classTeacher.findMany.mockResolvedValue([]);
    mockPrisma.makeupScheduleEvent.findMany.mockResolvedValue([]);
    mockPrisma.studentClass.groupBy.mockResolvedValue([]);

    service = new ClassService(
      mockPrisma as never,
      mockStaffOperationsAccess as never,
      mockActionHistoryService as never,
      mockCalendarService as never,
    );
    jest
      .spyOn(
        service as unknown as ClassServiceTestAccess,
        'getClassAuditSnapshot',
      )
      .mockResolvedValue({
        id: 'class-1',
        status: ClassStatus.running,
        schedule: [],
        teachers: [],
      });
  });

  describe('getClasses', () => {
    it('returns only active class teacher assignments for active staff', async () => {
      const logger = (service as unknown as { logger: { warn: jest.Mock } })
        .logger;
      jest.spyOn(logger, 'warn').mockImplementation();

      mockPrisma.class.count.mockResolvedValue(1);
      mockPrisma.class.findMany.mockResolvedValue([
        {
          id: 'class-1',
          name: 'Math 10A',
        },
      ]);
      mockPrisma.classTeacher.findMany.mockResolvedValue([
        {
          classId: 'class-1',
          teacherId: 'missing-teacher',
          status: 'active',
          customAllowance: null,
          operatingDeductionRatePercent: null,
          teacher: null,
        },
        {
          classId: 'class-1',
          teacherId: 'stopped-teacher',
          status: 'inactive',
          customAllowance: null,
          operatingDeductionRatePercent: null,
          teacher: {
            id: 'stopped-teacher',
            status: StaffStatus.active,
            user: {
              first_name: 'Grace',
              last_name: 'Hopper',
            },
          },
        },
        {
          classId: 'class-1',
          teacherId: 'inactive-staff',
          status: 'active',
          customAllowance: null,
          operatingDeductionRatePercent: null,
          teacher: {
            id: 'inactive-staff',
            status: StaffStatus.inactive,
            user: {
              first_name: 'Alan',
              last_name: 'Turing',
            },
          },
        },
        {
          classId: 'class-1',
          teacherId: 'teacher-1',
          status: 'active',
          customAllowance: 100000,
          operatingDeductionRatePercent: 10,
          teacher: {
            id: 'teacher-1',
            status: StaffStatus.active,
            user: {
              first_name: 'Ada',
              last_name: 'Lovelace',
            },
          },
        },
      ]);
      mockPrisma.studentClass.groupBy.mockResolvedValue([
        {
          classId: 'class-1',
          _count: {
            _all: 2,
          },
        },
      ]);

      await expect(
        service.getClasses({
          page: 1,
          limit: 20,
        }),
      ).resolves.toMatchObject({
        data: [
          {
            id: 'class-1',
            studentCount: 2,
            teachers: [
              {
                id: 'teacher-1',
                fullName: 'Lovelace Ada',
                status: StaffStatus.active,
                customAllowance: 100000,
                operatingDeductionRatePercent: 10,
              },
            ],
          },
        ],
        meta: {
          total: 1,
          page: 1,
          limit: 20,
        },
      });
      expect(mockPrisma.classTeacher.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ status: null }, { status: 'active' }],
            teacher: { is: { status: StaffStatus.active } },
          }),
        }),
      );
      expect(logger.warn).toHaveBeenCalledWith(
        'Skipping class teacher assignment with missing teacher relation: classId=class-1 teacherId=missing-teacher',
      );
    });
  });

  describe('getClassesForStaff', () => {
    it('uses accountant access instead of teacher scope for multi-role staff', async () => {
      mockStaffOperationsAccess.resolveActor.mockResolvedValue({
        id: 'staff-1',
        roles: [StaffRole.teacher, StaffRole.lesson_plan, StaffRole.accountant],
      });
      const getClassesSpy = jest
        .spyOn(service, 'getClasses')
        .mockResolvedValue({
          data: [],
          meta: { total: 0, page: 1, limit: 20 },
        });

      await service.getClassesForStaff('user-1', UserRole.staff, {
        page: 1,
        limit: 20,
        search: 'SAT',
      });

      expect(getClassesSpy).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        search: 'SAT',
      });
    });

    it('keeps teacher-only staff scoped to their assigned classes', async () => {
      mockStaffOperationsAccess.resolveActor.mockResolvedValue({
        id: 'teacher-1',
        roles: [StaffRole.teacher],
      });
      const getClassesSpy = jest
        .spyOn(service, 'getClasses')
        .mockResolvedValue({
          data: [],
          meta: { total: 0, page: 1, limit: 20 },
        });

      await service.getClassesForStaff('user-1', UserRole.staff, {
        page: 1,
        limit: 20,
      });

      expect(getClassesSpy).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        teacherId: 'teacher-1',
      });
    });
  });

  describe('createClassForStaff', () => {
    it('allows elevated staff even when they also have teacher role', async () => {
      mockStaffOperationsAccess.resolveActor.mockResolvedValue({
        id: 'staff-1',
        roles: [StaffRole.teacher, StaffRole.accountant],
      });
      const createClassSpy = jest
        .spyOn(service, 'createClass')
        .mockResolvedValue({
          id: 'class-1',
        } as never);

      await service.createClassForStaff('user-1', UserRole.staff, {
        name: 'Math 10A',
        type: 'basic',
        status: 'running',
      } as never);

      expect(createClassSpy).toHaveBeenCalledWith(
        {
          name: 'Math 10A',
          type: 'basic',
          status: 'running',
          schedule: undefined,
        },
        undefined,
      );
    });

    it('keeps teacher-only staff blocked from creating classes', async () => {
      mockStaffOperationsAccess.resolveActor.mockResolvedValue({
        id: 'teacher-1',
        roles: [StaffRole.teacher],
      });

      await expect(
        service.createClassForStaff('user-1', UserRole.staff, {
          name: 'Math 10A',
          type: 'basic',
          status: 'running',
        } as never),
      ).rejects.toThrow('Giáo viên không được phép tạo lớp học.');
    });
  });

  describe('createClass', () => {
    it('returns selected students in the created class detail', async () => {
      mockTx.class.create.mockResolvedValue({
        id: 'class-1',
        name: 'Math 10A',
        type: ClassType.basic,
        status: ClassStatus.running,
        maxStudents: 12,
        allowancePerSessionPerStudent: null,
        maxAllowancePerSession: null,
        scaleAmount: null,
        schedule: [],
        studentTuitionPerSession: 250000,
        tuitionPackageTotal: null,
        tuitionPackageSession: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      mockTx.class.findUnique.mockResolvedValue({
        id: 'class-1',
        name: 'Math 10A',
        type: ClassType.basic,
        status: ClassStatus.running,
        maxStudents: 12,
        allowancePerSessionPerStudent: null,
        maxAllowancePerSession: null,
        scaleAmount: null,
        schedule: [],
        studentTuitionPerSession: 250000,
        tuitionPackageTotal: null,
        tuitionPackageSession: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      mockTx.studentClass.findMany.mockResolvedValue([
        {
          classId: 'class-1',
          studentId: 'student-1',
          status: StudentClassStatus.active,
          customStudentTuitionPerSession: null,
          customTuitionPackageTotal: null,
          customTuitionPackageSession: null,
          totalAttendedSession: 0,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          student: {
            id: 'student-1',
            fullName: 'Jane Student',
          },
        },
      ]);

      const result = await service.createClass({
        name: 'Math 10A',
        type: ClassType.basic,
        status: ClassStatus.running,
        max_students: 12,
        student_tuition_per_session: 250000,
        student_ids: ['student-1'],
      });

      expect(mockTx.studentClass.createMany).toHaveBeenCalledWith({
        data: [
          {
            classId: 'class-1',
            studentId: 'student-1',
            status: StudentClassStatus.active,
          },
        ],
      });
      expect(result).toMatchObject({
        id: 'class-1',
        students: [
          {
            id: 'student-1',
            fullName: 'Jane Student',
            status: StudentClassStatus.active,
            effectiveTuitionPerSession: 250000,
            tuitionPackageSource: 'class',
          },
        ],
        sessionTuitionTotal: 250000,
      });
    });
  });

  describe('operational status actions', () => {
    it('rejects ending a class when teacher sessions are not fully paid', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { session_count: 3, unpaid_session_count: 1 },
      ]);

      await expect(
        service.endClass(
          'class-1',
          {},
          {
            userId: 'admin-1',
            roleType: UserRole.admin,
          },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('ends a class and closes active roster plus teacher assignments', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { session_count: 2, unpaid_session_count: 0 },
      ]);
      const beforeSnapshot = {
        id: 'class-1',
        status: ClassStatus.running,
        schedule: [
          {
            id: 'slot-1',
            dayOfWeek: 1,
            from: '19:00',
            to: '20:30',
            teacherId: 'teacher-1',
            googleCalendarEventId: 'calendar-1',
          },
        ],
        teachers: [],
      };
      const afterSnapshot = {
        ...beforeSnapshot,
        status: ClassStatus.ended,
        schedule: [],
      };
      (
        service as unknown as {
          getClassAuditSnapshot: jest.Mock;
        }
      ).getClassAuditSnapshot
        .mockResolvedValueOnce(beforeSnapshot)
        .mockResolvedValueOnce(afterSnapshot);
      mockPrisma.makeupScheduleEvent.findMany.mockResolvedValue([
        { id: 'makeup-1' },
      ]);
      jest.spyOn(service, 'getClassById').mockResolvedValue({
        id: 'class-1',
        status: ClassStatus.ended,
      } as never);

      await expect(
        service.endClass(
          'class-1',
          { reason: 'Kết thúc khóa' },
          { userId: 'admin-1', roleType: UserRole.admin },
        ),
      ).resolves.toMatchObject({
        id: 'class-1',
        status: ClassStatus.ended,
      });

      expect(mockTx.class.update).toHaveBeenCalledWith({
        where: { id: 'class-1' },
        data: {
          status: ClassStatus.ended,
          schedule: [],
        },
      });
      expect(mockTx.studentClass.updateMany).toHaveBeenCalledWith({
        where: { classId: 'class-1', status: StudentClassStatus.active },
        data: { status: StudentClassStatus.inactive },
      });
      expect(mockTx.classTeacher.updateMany).toHaveBeenCalledWith({
        where: {
          classId: 'class-1',
          OR: [{ status: null }, { status: 'active' }],
        },
        data: { status: 'inactive' },
      });
      expect(mockActionHistoryService.recordUpdate).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({
          description: 'Kết thúc lớp học - Lý do: Kết thúc khóa',
        }),
      );
      expect(mockCalendarService.syncScheduleWithCalendar).toHaveBeenCalledWith(
        'class-1',
        expect.arrayContaining([
          expect.objectContaining({ id: 'slot-1', teacherId: 'teacher-1' }),
        ]),
      );
      expect(
        mockCalendarService.deleteMakeupScheduleEvent,
      ).toHaveBeenCalledWith('makeup-1', {
        userId: 'admin-1',
        roleType: UserRole.admin,
      });
    });

    it('stops one teacher assignment and prunes that teacher from the schedule', async () => {
      const beforeSnapshot = {
        id: 'class-1',
        status: ClassStatus.running,
        schedule: [
          {
            id: 'slot-1',
            dayOfWeek: 1,
            from: '19:00',
            to: '20:30',
            teacherId: 'teacher-1',
          },
          {
            id: 'slot-2',
            dayOfWeek: 3,
            from: '19:00',
            to: '20:30',
            teacherId: 'teacher-2',
          },
        ],
        teachers: [],
      };
      const afterSnapshot = {
        ...beforeSnapshot,
        schedule: [
          {
            ...beforeSnapshot.schedule[0],
            deletedAt: '2026-06-03T15:20:38.775Z',
          },
          beforeSnapshot.schedule[1],
        ],
      };
      (
        service as unknown as {
          getClassAuditSnapshot: jest.Mock;
        }
      ).getClassAuditSnapshot
        .mockResolvedValueOnce(beforeSnapshot)
        .mockResolvedValueOnce(afterSnapshot);
      mockTx.classTeacher.findUnique.mockResolvedValue({ status: 'active' });
      mockPrisma.makeupScheduleEvent.findMany.mockResolvedValue([
        { id: 'makeup-2' },
      ]);
      jest.spyOn(service, 'getClassById').mockResolvedValue({
        id: 'class-1',
        status: ClassStatus.running,
      } as never);

      await service.stopClassTeacher(
        'class-1',
        'teacher-1',
        { reason: 'Đổi người phụ trách' },
        { userId: 'assistant-1', roleType: UserRole.staff },
      );

      expect(mockTx.classTeacher.update).toHaveBeenCalledWith({
        where: {
          classId_teacherId: { classId: 'class-1', teacherId: 'teacher-1' },
        },
        data: { status: 'inactive' },
      });
      expect(mockTx.class.update).toHaveBeenCalledWith({
        where: { id: 'class-1' },
        data: {
          schedule: [
            expect.objectContaining({
              id: 'slot-1',
              teacherId: 'teacher-1',
              deletedAt: expect.any(String),
            }),
            expect.objectContaining({
              id: 'slot-2',
              teacherId: 'teacher-2',
            }),
          ],
        },
      });
      expect(mockActionHistoryService.recordUpdate).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({
          description:
            'Chuyển gia sư sang nghỉ dạy theo lớp - Lý do: Đổi người phụ trách',
        }),
      );
      expect(mockPrisma.makeupScheduleEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            classId: 'class-1',
            teacherId: 'teacher-1',
          }),
        }),
      );
      expect(
        mockCalendarService.deleteMakeupScheduleEvent,
      ).toHaveBeenCalledWith('makeup-2', {
        userId: 'assistant-1',
        roleType: UserRole.staff,
      });
    });
  });

  describe('updateClassScheduleForStaff', () => {
    it('does not apply teacher assignment scope to elevated multi-role staff', async () => {
      mockStaffOperationsAccess.resolveActor.mockResolvedValue({
        id: 'staff-1',
        roles: [StaffRole.teacher, StaffRole.assistant],
      });
      const updateScheduleSpy = jest
        .spyOn(service, 'updateClassSchedule')
        .mockResolvedValue({ id: 'class-1' } as never);

      await service.updateClassScheduleForStaff(
        'user-1',
        UserRole.staff,
        'class-1',
        { schedule: [] } as never,
      );

      expect(
        mockStaffOperationsAccess.assertTeacherAssignedToClass,
      ).not.toHaveBeenCalled();
      expect(updateScheduleSpy).toHaveBeenCalledWith(
        'class-1',
        { schedule: [] },
        undefined,
      );
    });
  });

  describe('updateClassTeachers', () => {
    it('fills blank custom_allowance with the class default allowance', async () => {
      await service.updateClassTeachers('class-1', {
        teachers: [{ teacher_id: 'teacher-1' }],
      });

      expect(mockTx.classTeacher.createMany).toHaveBeenCalledWith({
        data: [
          {
            classId: 'class-1',
            teacherId: 'teacher-1',
            customAllowance: 120000,
            operatingDeductionRatePercent: 0,
            status: 'active',
          },
        ],
      });
    });

    it('persists operating deduction on the class-teacher assignment', async () => {
      await service.updateClassTeachers('class-1', {
        teachers: [
          {
            teacher_id: 'teacher-1',
            custom_allowance: 150000,
            operating_deduction_rate_percent: 7.5,
          },
        ],
      });

      expect(mockTx.classTeacher.createMany).toHaveBeenCalledWith({
        data: [
          {
            classId: 'class-1',
            teacherId: 'teacher-1',
            customAllowance: 150000,
            operatingDeductionRatePercent: 7.5,
            status: 'active',
          },
        ],
      });
    });

    it('removes fixed schedule slots owned by teachers removed from the class and syncs Google Calendar', async () => {
      const oldSchedule = [
        {
          id: 'slot-removed',
          dayOfWeek: 1,
          from: '19:00:00',
          to: '20:30:00',
          teacherId: 'teacher-removed',
          googleCalendarEventId: 'google-removed',
          meetLink: 'https://meet.google.com/removed',
        },
        {
          id: 'slot-kept',
          dayOfWeek: 3,
          from: '18:00:00',
          to: '19:30:00',
          teacherId: 'teacher-kept',
          googleCalendarEventId: 'google-kept',
          meetLink: 'https://meet.google.com/kept',
        },
      ];
      mockPrisma.class.findUnique.mockResolvedValue({
        id: 'class-1',
        name: 'Math 10A',
        schedule: oldSchedule,
        allowancePerSessionPerStudent: 120000,
      });
      mockTx.classTeacher.findMany.mockResolvedValue([
        {
          teacherId: 'teacher-removed',
          operatingDeductionRatePercent: 0,
        },
        {
          teacherId: 'teacher-kept',
          operatingDeductionRatePercent: 5,
        },
      ]);

      await service.updateClassTeachers('class-1', {
        teachers: [
          {
            teacher_id: 'teacher-kept',
            operating_deduction_rate_percent: 5,
          },
        ],
      });

      expect(mockTx.class.update).toHaveBeenCalledWith({
        where: { id: 'class-1' },
        data: {
          schedule: [
            expect.objectContaining({
              id: 'slot-removed',
              deletedAt: expect.any(String),
            }),
            expect.objectContaining({
              id: 'slot-kept',
              dayOfWeek: 3,
              from: '18:00:00',
              to: '19:30:00',
              teacherId: 'teacher-kept',
              googleCalendarEventId: 'google-kept',
              meetLink: 'https://meet.google.com/kept',
            }),
          ],
        },
      });
      expect(mockCalendarService.syncScheduleWithCalendar).toHaveBeenCalledWith(
        'class-1',
        oldSchedule,
      );
    });

    it('rejects inactive teachers for class assignment updates', async () => {
      mockTx.staffInfo.findMany.mockResolvedValue([
        { id: 'teacher-1', status: StaffStatus.inactive },
      ]);

      await expect(
        service.updateClassTeachers('class-1', {
          teachers: [{ teacher_id: 'teacher-1' }],
        }),
      ).rejects.toThrow('Nhân sự đang ở trạng thái ngừng hoạt động.');

      expect(mockTx.classTeacher.createMany).not.toHaveBeenCalled();
    });
  });

  describe('updateClassTeacherCompensation', () => {
    it('updates custom allowance and operating deduction rate for existing teachers', async () => {
      mockPrisma.class.findUnique.mockResolvedValue({
        id: 'class-1',
        teachers: [
          {
            teacherId: 'teacher-1',
            operatingDeductionRatePercent: 5,
          },
        ],
      });

      await service.updateClassTeacherCompensation('class-1', {
        teachers: [
          {
            teacher_id: 'teacher-1',
            custom_allowance: 150000,
            operating_deduction_rate_percent: 7.5,
          },
        ],
      });

      expect(mockTx.classTeacher.update).toHaveBeenCalledWith({
        where: {
          classId_teacherId: {
            classId: 'class-1',
            teacherId: 'teacher-1',
          },
        },
        data: {
          customAllowance: 150000,
          operatingDeductionRatePercent: 7.5,
        },
      });
    });
  });

  describe('updateClassSchedule', () => {
    it('rejects schedule slots whose responsible tutor is not assigned to the class', async () => {
      await expect(
        service.updateClassSchedule('class-1', {
          schedule: [
            {
              id: 'slot-1',
              dayOfWeek: 1,
              from: '19:00:00',
              to: '20:30:00',
              teacherId: 'teacher-99',
            },
          ],
        }),
      ).rejects.toThrow(
        'Gia sư chịu trách nhiệm phải thuộc danh sách gia sư hiện có của lớp.',
      );

      expect(mockTx.class.update).not.toHaveBeenCalled();
    });
  });

  describe('updateClass', () => {
    it('rejects schedule updates through the generic endpoint', async () => {
      await expect(
        service.updateClass({
          id: 'class-1',
          schedule: [
            {
              dayOfWeek: 1,
              from: '19:00:00',
              to: '20:30:00',
            },
          ],
        } as never),
      ).rejects.toThrow(
        'PATCH /class không nhận schedule. Hãy dùng PATCH /class/:id/schedule.',
      );

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('updateClassStudents', () => {
    it('rejects inactive students for class assignment updates', async () => {
      mockTx.studentInfo.findMany.mockResolvedValue([
        { id: 'student-1', status: StudentStatus.inactive },
      ]);

      await expect(
        service.updateClassStudents('class-1', {
          students: [{ id: 'student-1' }],
        }),
      ).rejects.toThrow('Học sinh đang ở trạng thái nghỉ học.');

      expect(mockTx.studentClass.create).not.toHaveBeenCalled();
    });
  });
});
