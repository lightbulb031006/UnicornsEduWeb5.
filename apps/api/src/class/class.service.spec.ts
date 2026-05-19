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
  Prisma: {},
}));

import { ClassService } from './class.service';
import { StaffRole, UserRole } from '../../generated/enums';

type ClassServiceTestAccess = {
  getClassAuditSnapshot: (
    ...args: unknown[]
  ) => Promise<{ id: string; teachers: never[] }>;
};

describe('ClassService', () => {
  const mockTx = {
    class: {
      update: jest.fn(),
    },
    classTeacher: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    classTeacherOperatingDeductionRate: {
      upsert: jest.fn(),
    },
  };

  const mockPrisma = {
    class: {
      findUnique: jest.fn(),
    },
    classTeacher: {
      findMany: jest.fn(),
    },
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
    mockTx.class.update.mockResolvedValue({ id: 'class-1' });
    mockTx.classTeacher.findMany.mockResolvedValue([]);
    mockTx.classTeacher.deleteMany.mockResolvedValue({ count: 1 });
    mockTx.classTeacher.createMany.mockResolvedValue({ count: 1 });
    mockTx.classTeacherOperatingDeductionRate.upsert.mockResolvedValue({
      id: 'history-1',
    });
    mockPrisma.classTeacher.findMany.mockResolvedValue([]);

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
        teachers: [],
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
          },
        ],
      });
    });

    it('upserts same-day operating deduction history rows', async () => {
      const expectedEffectiveFrom = expect.any(Date) as unknown as Date;

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
          },
        ],
      });
      expect(
        mockTx.classTeacherOperatingDeductionRate.upsert,
      ).toHaveBeenCalledWith({
        where: {
          classId_teacherId_effectiveFrom: {
            classId: 'class-1',
            teacherId: 'teacher-1',
            effectiveFrom: expectedEffectiveFrom,
          },
        },
        create: {
          classId: 'class-1',
          teacherId: 'teacher-1',
          ratePercent: 7.5,
          effectiveFrom: expectedEffectiveFrom,
        },
        update: {
          ratePercent: 7.5,
        },
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
            {
              id: 'slot-kept',
              dayOfWeek: 3,
              from: '18:00:00',
              to: '19:30:00',
              teacherId: 'teacher-kept',
              googleCalendarEventId: 'google-kept',
              meetLink: 'https://meet.google.com/kept',
            },
          ],
        },
      });
      expect(mockCalendarService.syncScheduleWithCalendar).toHaveBeenCalledWith(
        'class-1',
        oldSchedule,
      );
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
});
