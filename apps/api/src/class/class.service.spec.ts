jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));

jest.mock('../staff-ops/staff-operations-access.service', () => ({
  // Giữ các predicate thuần (#277: `seesClassAsTrainingManager`, ...).
  ...jest.requireActual('../staff-ops/staff-operations-access.service'),
  StaffOperationsAccessService: class StaffOperationsAccessServiceMock {},
}));

jest.mock('../action-history/action-history.service', () => ({
  ActionHistoryService: class ActionHistoryServiceMock {},
}));

jest.mock('../calendar/calendar.service', () => ({
  CalendarService: class CalendarServiceMock {},
}));

jest.mock('../../generated/client', () => {
  const actualEnums = jest.requireActual<Record<string, unknown>>(
    '../../generated/enums',
  );
  return {
    ...actualEnums,
    Prisma: {
      sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
        strings,
        values,
      }),
    },
  };
});

import { ClassService } from './class.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ClassPricingMode,
  ClassStatus,
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
      findMany: jest.fn(),
      update: jest.fn(),
    },
    classTeacher: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    staffInfo: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    studentInfo: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    studentClass: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      createMany: jest.fn(),
      create: jest.fn(),
    },
    course: {
      findUnique: jest.fn(),
    },
    classScheduleEntry: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      createMany: jest.fn(),
    },
    session: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    attendance: {
      update: jest.fn(),
      findMany: jest.fn(),
    },
    walletTransactionsHistory: {
      update: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };

  const mockPrisma = {
    class: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    customerCareService: {
      findMany: jest.fn(),
    },
    classTeacher: {
      findMany: jest.fn(),
    },
    classScheduleEntry: {
      findMany: jest.fn(),
    },
    makeupScheduleEvent: {
      findMany: jest.fn(),
    },
    studentClass: {
      groupBy: jest.fn(),
      findFirst: jest.fn(),
    },
    $queryRaw: jest.fn(),
    user: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(),
  };

  const mockStaffOperationsAccess = {
    resolveActor: jest.fn(),
    assertTeacherAssignedToClass: jest.fn(),
    resolveClassWorkAccess: jest.fn(),
    resolveClassViewerActor: jest.fn(),
    resolveClassAccess: jest.fn(),
  };
  const mockActionHistoryService = {
    recordUpdate: jest.fn(),
    recordCreate: jest.fn(),
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
      courseId: 'basic-category-id',
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
      courseId: 'basic-category-id',
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
    // #273: mặc định lớp đã có học phí → không chặn test cũ.
    mockTx.class.findMany.mockResolvedValue([]);
    mockTx.classTeacher.findMany.mockResolvedValue([]);
    mockTx.classTeacher.deleteMany.mockResolvedValue({ count: 1 });
    mockTx.classTeacher.createMany.mockResolvedValue({ count: 1 });
    mockTx.classTeacher.update.mockResolvedValue({});
    mockTx.classTeacher.updateMany.mockResolvedValue({ count: 0 });
    mockTx.classTeacher.findUnique.mockResolvedValue(null);
    mockTx.classTeacher.create.mockResolvedValue({});
    mockTx.staffInfo.findUnique.mockResolvedValue({
      status: StaffStatus.active,
      roles: [StaffRole.teacher],
    });
    mockTx.staffInfo.findMany.mockImplementation((args: any) => {
      const ids = args?.where?.id?.in ?? [];
      return ids.map((id: string) => ({ id, status: StaffStatus.active }));
    });
    mockTx.studentInfo.findMany.mockImplementation((args: any) => {
      const ids = args?.where?.id?.in ?? [];
      return ids.map((id: string) => ({ id, status: StudentStatus.active }));
    });
    mockTx.studentClass.findMany.mockResolvedValue([]);
    mockTx.studentClass.findFirst.mockResolvedValue(null);
    mockTx.studentClass.update.mockResolvedValue({});
    mockTx.studentClass.updateMany.mockResolvedValue({ count: 0 });
    mockTx.studentClass.createMany.mockResolvedValue({ count: 0 });
    mockTx.studentClass.create.mockResolvedValue({});
    mockTx.classScheduleEntry.findMany.mockResolvedValue([]);
    mockTx.classScheduleEntry.updateMany.mockResolvedValue({ count: 0 });
    mockTx.classScheduleEntry.createMany.mockResolvedValue({ count: 0 });
    mockTx.session.findMany.mockResolvedValue([]);
    mockTx.session.update.mockResolvedValue({});
    mockTx.attendance.update.mockResolvedValue({});
    mockTx.attendance.findMany.mockResolvedValue([]);
    mockTx.studentInfo.update.mockResolvedValue({});
    mockTx.walletTransactionsHistory.update.mockResolvedValue({});
    mockPrisma.class.count.mockResolvedValue(0);
    mockPrisma.class.findMany.mockResolvedValue([]);
    mockPrisma.classTeacher.findMany.mockResolvedValue([]);
    mockPrisma.classScheduleEntry.findMany.mockResolvedValue([]);
    mockPrisma.makeupScheduleEvent.findMany.mockResolvedValue([]);
    mockPrisma.studentClass.groupBy.mockResolvedValue([]);
    mockPrisma.studentClass.findFirst.mockResolvedValue(null);

    service = new ClassService(
      mockPrisma as never,
      mockStaffOperationsAccess as never,
      mockActionHistoryService as never,
      mockCalendarService as never,
      { reconcile: jest.fn() } as never,
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
    it('ORs teacher and training-manager filters when both are set', async () => {
      mockPrisma.class.count.mockResolvedValue(0);
      mockPrisma.class.findMany.mockResolvedValue([]);

      await service.getClasses({
        page: 1,
        limit: 20,
        teacherId: 'staff-1',
        trainingManagerStaffId: 'staff-1',
      });

      const where = mockPrisma.class.count.mock.calls.at(-1)[0].where;
      expect(where).not.toHaveProperty('trainingManagerStaffId');
      expect(where).not.toHaveProperty('teachers');
      expect(where.OR).toEqual([
        {
          teachers: {
            some: expect.objectContaining({ teacherId: 'staff-1' }),
          },
        },
        { trainingManagerStaffId: 'staff-1' },
      ]);
    });

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
        roles: [
          StaffRole.teacher,
          StaffRole.lesson_plan,
          StaffRole.accountant_income,
        ],
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

    it('gia sư thuần: danh sách không có học phí, chỉ thấy lương của mình (quyết định 13/11)', async () => {
      mockStaffOperationsAccess.resolveActor.mockResolvedValue({
        id: 'teacher-1',
        roles: [StaffRole.teacher],
      });
      jest.spyOn(service, 'getClasses').mockResolvedValue({
        data: [
          {
            id: 'class-1',
            trainingManagerStaffId: 'manager-1',
            studentTuitionPerSession: 250_000,
            tuitionPackageTotal: 2_000_000,
            teachers: [
              { id: 'teacher-1', customAllowance: 100_000 },
              { id: 'teacher-2', customAllowance: 90_000 },
            ],
          },
        ],
        meta: { total: 1, page: 1, limit: 20 },
      } as never);

      const result = (await service.getClassesForStaff(
        'user-1',
        UserRole.staff,
        { page: 1, limit: 20 },
      )) as unknown as {
        data: Array<
          Record<string, unknown> & { teachers: Record<string, unknown>[] }
        >;
      };

      expect(result.data[0].studentTuitionPerSession).toBeUndefined();
      expect(result.data[0].tuitionPackageTotal).toBeUndefined();
      expect(result.data[0].teachers[0].customAllowance).toBe(100_000);
      expect(result.data[0].teachers[1].customAllowance).toBeUndefined();
    });

    it('keeps training-only staff scoped to managed classes', async () => {
      mockStaffOperationsAccess.resolveActor.mockResolvedValue({
        id: 'training-1',
        roles: [StaffRole.training],
      });
      const getClassesSpy = jest
        .spyOn(service, 'getClasses')
        .mockResolvedValue({
          data: [
            {
              id: 'class-1',
              name: 'Math 10A',
              allowancePerSessionPerStudent: 100_000,
              studentTuitionPerSession: 250_000,
              studentTuitionPerBlock: 250_000,
            },
          ],
          meta: { total: 1, page: 1, limit: 20 },
        } as never);

      const result = await service.getClassesForStaff(
        'user-1',
        UserRole.staff,
        {
          page: 1,
          limit: 20,
        },
      );

      expect(getClassesSpy).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        trainingManagerStaffId: 'training-1',
      });
      // Quản lý lớp chỉnh được lương gia sư nên thấy trợ cấp, nhưng không thấy học phí.
      expect(result.data[0]).toHaveProperty(
        'allowancePerSessionPerStudent',
        100_000,
      );
      expect(result.data[0]).not.toHaveProperty('studentTuitionPerSession');
      expect(result.data[0]).not.toHaveProperty('studentTuitionPerBlock');
    });

    it('gives teacher + training staff taught OR managed classes, and managed only with scope=managed', async () => {
      mockStaffOperationsAccess.resolveActor.mockResolvedValue({
        id: 'staff-1',
        roles: [StaffRole.teacher, StaffRole.training],
      });
      const getClassesSpy = jest
        .spyOn(service, 'getClasses')
        .mockResolvedValue({
          data: [],
          meta: { total: 0, page: 1, limit: 20 },
        } as never);

      await service.getClassesForStaff('user-1', UserRole.staff, {
        page: 1,
        limit: 20,
      });
      expect(getClassesSpy).toHaveBeenLastCalledWith({
        page: 1,
        limit: 20,
        teacherId: 'staff-1',
        trainingManagerStaffId: 'staff-1',
      });

      await service.getClassesForStaff('user-1', UserRole.staff, {
        page: 1,
        limit: 1,
        scope: 'managed',
      });
      expect(getClassesSpy).toHaveBeenLastCalledWith({
        page: 1,
        limit: 1,
        trainingManagerStaffId: 'staff-1',
      });
    });

    // #277: Trưởng ban Đào tạo thấy mọi lớp (không học phí); scope=managed
    // vẫn chỉ lớp mình quản lý.
    it('gives training_head every class without tuition, managed only with scope=managed', async () => {
      mockStaffOperationsAccess.resolveActor.mockResolvedValue({
        id: 'head-1',
        roles: [StaffRole.training_head, StaffRole.teacher],
      });
      const getClassesSpy = jest
        .spyOn(service, 'getClasses')
        .mockResolvedValue({
          data: [
            {
              id: 'class-9',
              allowancePerSessionPerStudent: 100_000,
              studentTuitionPerSession: 250_000,
            },
          ],
          meta: { total: 1, page: 1, limit: 20 },
        } as never);

      const result = await service.getClassesForStaff(
        'user-1',
        UserRole.staff,
        { page: 1, limit: 20 },
      );
      expect(getClassesSpy).toHaveBeenLastCalledWith({ page: 1, limit: 20 });
      expect(result.data[0]).toHaveProperty(
        'allowancePerSessionPerStudent',
        100_000,
      );
      expect(result.data[0]).not.toHaveProperty('studentTuitionPerSession');

      await service.getClassesForStaff('user-1', UserRole.staff, {
        page: 1,
        limit: 20,
        scope: 'managed',
      });
      expect(getClassesSpy).toHaveBeenLastCalledWith({
        page: 1,
        limit: 20,
        trainingManagerStaffId: 'head-1',
      });
    });
  });

  describe('createClassForStaff', () => {
    it('allows elevated staff even when they also have teacher role', async () => {
      mockStaffOperationsAccess.resolveActor.mockResolvedValue({
        id: 'staff-1',
        roles: [StaffRole.teacher, StaffRole.accountant_income],
      });
      const createClassSpy = jest
        .spyOn(service, 'createClass')
        .mockResolvedValue({
          id: 'class-1',
        } as never);

      await service.createClassForStaff('user-1', UserRole.staff, {
        name: 'Math 10A',
        course_id: 'basic-category-id',
        status: 'running',
      } as never);

      expect(createClassSpy).toHaveBeenCalledWith(
        {
          name: 'Math 10A',
          course_id: 'basic-category-id',
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
          course_id: 'basic-category-id',
          status: 'running',
        } as never),
      ).rejects.toThrow('Giáo viên không được phép tạo lớp học.');
    });
  });

  describe('createClass', () => {
    it('returns selected students in the created class detail', async () => {
      mockTx.course.findUnique.mockResolvedValue({
        id: 'basic-category-id',
        defaultDurationDays: null,
      });
      mockTx.class.create.mockResolvedValue({
        id: 'class-1',
        name: 'Math 10A',
        courseId: 'basic-category-id',
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
        courseId: 'basic-category-id',
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
        course_id: 'basic-category-id',
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
            customerCareStaff: null,
            effectiveTuitionPerSession: 250000,
            tuitionPackageSource: 'class',
          },
        ],
        sessionTuitionTotal: 250000,
      });
    });
  });

  describe('#274 tạo lớp theo role', () => {
    const staffUserWith = (roles: StaffRole[]) => ({
      roleType: UserRole.staff,
      staffInfo: { id: 'UNISTAFF-self000001', roles },
    });
    const headActor = {
      userId: 'user-head',
      userEmail: 'head@example.com',
      roleType: UserRole.staff,
    };
    const classRow = {
      id: 'class-1',
      name: 'Math 10A',
      courseId: 'basic-category-id',
      status: ClassStatus.running,
      maxStudents: 12,
      allowancePerSessionPerStudent: null,
      maxAllowancePerSession: null,
      scaleAmount: null,
      schedule: [],
      studentTuitionPerSession: null,
      tuitionPackageTotal: null,
      tuitionPackageSession: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    beforeEach(() => {
      mockTx.course.findUnique.mockResolvedValue({
        id: 'basic-category-id',
        defaultDurationDays: null,
      });
      mockTx.class.create.mockResolvedValue(classRow);
      mockTx.class.findUnique.mockResolvedValue(classRow);
      mockTx.studentClass.findMany.mockResolvedValue([]);
    });

    it('Trưởng ban Đào tạo tạo lớp kèm Quản lý lớp: ghi trainingManagerStaffId và cấp role training cho gia sư', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(
        staffUserWith([StaffRole.training_head]),
      );
      mockTx.staffInfo.findUnique.mockResolvedValueOnce({
        id: 'UNISTAFF-manager0001',
        roles: [StaffRole.teacher],
        status: 'active',
      });

      await service.createClass(
        {
          name: 'Math 10A',
          course_id: 'basic-category-id',
          max_students: 12,
          training_manager_staff_id: 'UNISTAFF-manager0001',
        },
        headActor,
      );

      expect(mockTx.class.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            trainingManagerStaffId: 'UNISTAFF-manager0001',
          }),
        }),
      );
      expect(mockTx.staffInfo.update).toHaveBeenCalledWith({
        where: { id: 'UNISTAFF-manager0001' },
        data: { roles: { push: StaffRole.training } },
        select: { id: true },
      });
    });

    it('Quản lý lớp không phải Đào Tạo/gia sư đang hoạt động → 400', async () => {
      mockTx.staffInfo.findUnique.mockResolvedValueOnce({
        id: 'UNISTAFF-manager0001',
        roles: [StaffRole.customer_care],
        status: 'active',
      });

      await expect(
        service.createClass({
          name: 'Math 10A',
          course_id: 'basic-category-id',
          training_manager_staff_id: 'UNISTAFF-manager0001',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockTx.class.create).not.toHaveBeenCalled();
    });

    it('Trưởng ban Đào tạo gửi học phí → 403, không tạo lớp', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(
        staffUserWith([StaffRole.training_head]),
      );

      await expect(
        service.createClass(
          {
            name: 'Math 10A',
            course_id: 'basic-category-id',
            student_tuition_per_session: 200000,
          },
          headActor,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('Trưởng phòng gửi gia sư → 403, không tạo lớp', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(
        staffUserWith([StaffRole.sale_customer_care_head]),
      );

      await expect(
        service.createClass(
          {
            name: 'Math 10A',
            course_id: 'basic-category-id',
            teacher_ids: ['UNISTAFF-other00001'],
          },
          headActor,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('Trưởng phòng tạo lớp kèm học phí được', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(
        staffUserWith([StaffRole.sale_customer_care_head]),
      );

      await expect(
        service.createClass(
          {
            name: 'Math 10A',
            course_id: 'basic-category-id',
            student_tuition_per_session: 200000,
          },
          headActor,
        ),
      ).resolves.toMatchObject({ id: 'class-1' });
    });

    it('staff-ops: Đào Tạo (không phải trưởng) tạo lớp → 403', async () => {
      mockStaffOperationsAccess.resolveActor.mockResolvedValue({
        id: 'staff-1',
        roles: [StaffRole.training],
      });
      mockPrisma.user.findUnique.mockResolvedValueOnce(
        staffUserWith([StaffRole.training]),
      );

      await expect(
        service.createClassForStaff(
          'user-head',
          UserRole.staff,
          {
            name: 'Math 10A',
            course_id: 'basic-category-id',
            status: ClassStatus.running,
          } as never,
          headActor,
        ),
      ).rejects.toThrow(
        'Chỉ Admin, Trưởng ban Đào tạo hoặc Trưởng phòng Sale & CSKH được tạo lớp.',
      );
    });

    it.each([
      [
        'lịch học',
        { schedule: [{ dayOfWeek: 1, from: '18:00', to: '19:30' }] },
      ],
      ['trạng thái kết thúc', { status: ClassStatus.ended }],
    ])('staff-ops: Trưởng ban Đào tạo gửi %s → 403', async (_label, extra) => {
      mockStaffOperationsAccess.resolveActor.mockResolvedValue({
        id: 'staff-1',
        roles: [StaffRole.training_head],
      });
      mockPrisma.user.findUnique.mockResolvedValueOnce(
        staffUserWith([StaffRole.training_head]),
      );

      await expect(
        service.createClassForStaff(
          'user-head',
          UserRole.staff,
          {
            name: 'Math 10A',
            course_id: 'basic-category-id',
            ...extra,
          } as never,
          headActor,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('#274 sửa Thông tin lớp theo role', () => {
    const headActor = { userId: 'user-head', roleType: UserRole.staff };
    const staffUserWith = (roles: StaffRole[]) => ({
      roleType: UserRole.staff,
      staffInfo: { id: 'UNISTAFF-self000001', roles },
    });

    it.each([
      ['Trưởng ban Đào tạo', [StaffRole.training_head]],
      ['Trưởng phòng', [StaffRole.sale_customer_care_head]],
    ])('%s sửa tên, khoá học, sĩ số được', async (_label, roles) => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(staffUserWith(roles));

      await service.updateClassBasicInfo(
        'class-1',
        { name: 'Lớp mới', max_students: 20 },
        headActor,
      );

      expect(mockTx.class.update).toHaveBeenCalledWith({
        where: { id: 'class-1' },
        data: { name: 'Lớp mới', maxStudents: 20 },
      });
    });

    it.each([
      ['kết thúc lớp (status ended)', { status: ClassStatus.ended }],
      ['lương gia sư', { allowance_per_session_per_student: 90000 }],
      ['không cần điểm danh', { no_attendance: true }],
    ])('Trưởng phòng gửi %s → 403', async (_label, dto) => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(
        staffUserWith([StaffRole.sale_customer_care_head]),
      );

      await expect(
        service.updateClassBasicInfo('class-1', dto, headActor),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockTx.class.update).not.toHaveBeenCalled();
    });
  });

  describe('updateClassStudentTuition', () => {
    it('derives custom per-session from custom package when saving student tuition', async () => {
      mockPrisma.class.findUnique.mockResolvedValue({ id: 'class-1' });
      mockPrisma.studentClass.findFirst.mockResolvedValue({
        id: 'student-class-1',
      });
      (
        service as unknown as {
          getClassAuditSnapshot: jest.Mock;
        }
      ).getClassAuditSnapshot
        .mockResolvedValueOnce({ id: 'class-1' })
        .mockResolvedValueOnce({ id: 'class-1' });

      await service.updateClassStudentTuition(
        'class-1',
        {
          student_id: 'student-1',
          custom_tuition_package_total: 525000,
          custom_tuition_package_session: 4,
        },
        {
          userId: 'admin-1',
          userEmail: 'admin@example.com',
          roleType: UserRole.admin,
        },
      );

      expect(mockTx.studentClass.update).toHaveBeenCalledWith({
        where: { id: 'student-class-1' },
        data: {
          customTuitionPackageTotal: 525000,
          customTuitionPackageSession: 4,
          customStudentTuitionPerSession: 131250,
          customTuitionPerBlock: null,
        },
      });
    });
  });

  describe('operational status actions', () => {
    it('ends a class (even with unpaid teacher sessions) and closes active roster plus teacher assignments', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { session_count: 3, unpaid_session_count: 1 },
      ]);
      const beforeSnapshot = {
        id: 'class-1',
        status: ClassStatus.running,
        schedule: [],
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
      mockTx.classScheduleEntry.findMany.mockResolvedValue([
        {
          id: 'slot-1',
          classId: 'class-1',
          dayOfWeek: 1,
          from: '19:00',
          to: '20:30',
          teacherId: 'teacher-1',
          googleCalendarEventId: 'calendar-1',
          meetLink: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
          effectiveTo: null,
        },
      ]);
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
        },
      });
      expect(mockTx.classScheduleEntry.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['slot-1'] } },
        data: { effectiveTo: expect.any(Date) },
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

    it('still resolves with warnings when Google Calendar cleanup fails after commit', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { session_count: 0, unpaid_session_count: 0 },
      ]);
      const snapshot = {
        id: 'class-1',
        status: ClassStatus.running,
        schedule: [],
        teachers: [],
      };
      (
        service as unknown as {
          getClassAuditSnapshot: jest.Mock;
        }
      ).getClassAuditSnapshot
        .mockResolvedValueOnce(snapshot)
        .mockResolvedValueOnce({ ...snapshot, status: ClassStatus.ended });
      mockTx.classScheduleEntry.findMany.mockResolvedValue([]);
      mockPrisma.makeupScheduleEvent.findMany.mockResolvedValue([
        { id: 'makeup-1' },
        { id: 'makeup-2' },
      ]);
      mockCalendarService.syncScheduleWithCalendar.mockRejectedValueOnce(
        new Error('token expired'),
      );
      mockCalendarService.deleteMakeupScheduleEvent.mockRejectedValueOnce(
        new Error('google 500'),
      );
      jest.spyOn(service, 'getClassById').mockResolvedValue({
        id: 'class-1',
        status: ClassStatus.ended,
      } as never);

      const result = await service.endClass('class-1', {}, undefined);

      expect(result).toMatchObject({
        id: 'class-1',
        status: ClassStatus.ended,
      });
      expect(result.calendarSyncWarnings).toEqual([
        'Không gỡ được lịch cố định trên Google Calendar: token expired',
        'Còn 1 buổi bù chưa xoá được (lỗi Google Calendar), xoá lại trong card Lịch dạy bù.',
      ]);
      // Buổi bù lỗi không chặn các buổi còn lại.
      expect(
        mockCalendarService.deleteMakeupScheduleEvent,
      ).toHaveBeenCalledTimes(2);
    });

    it('stops one teacher assignment and prunes that teacher from the schedule', async () => {
      const beforeSnapshot = {
        id: 'class-1',
        status: ClassStatus.running,
        schedule: [],
        teachers: [],
      };
      const afterSnapshot = { ...beforeSnapshot };
      (
        service as unknown as {
          getClassAuditSnapshot: jest.Mock;
        }
      ).getClassAuditSnapshot
        .mockResolvedValueOnce(beforeSnapshot)
        .mockResolvedValueOnce(afterSnapshot);
      mockTx.classTeacher.findUnique.mockResolvedValue({ status: 'active' });
      mockTx.classScheduleEntry.findMany.mockResolvedValue([
        {
          id: 'slot-1',
          classId: 'class-1',
          dayOfWeek: 1,
          from: '19:00',
          to: '20:30',
          teacherId: 'teacher-1',
          googleCalendarEventId: null,
          meetLink: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
          effectiveTo: null,
        },
      ]);
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
      expect(mockTx.classScheduleEntry.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['slot-1'] } },
        data: { effectiveTo: expect.any(Date) },
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
    const workAccess = (
      overrides: Partial<{
        staffId: string | null;
        isAdmin: boolean;
        isClassTeacher: boolean;
        isClassManager: boolean;
      }>,
    ) => ({
      staffId: 'staff-1',
      isAdmin: false,
      isClassTeacher: false,
      isClassManager: false,
      ...overrides,
    });
    const otherTeacherSlot = {
      schedule: [
        {
          dayOfWeek: 3,
          from: '20:00:00',
          to: '21:30:00',
          teacherId: 'teacher-2',
          effectiveFrom: '2026-01-01',
        },
      ],
    };

    it('lets admin edit any slot and keep effectiveFrom', async () => {
      mockStaffOperationsAccess.resolveClassWorkAccess.mockResolvedValue(
        workAccess({ isAdmin: true }),
      );
      const updateScheduleSpy = jest
        .spyOn(service, 'updateClassSchedule')
        .mockResolvedValue({ id: 'class-1' } as never);

      await service.updateClassScheduleForStaff(
        'user-1',
        UserRole.staff,
        'class-1',
        otherTeacherSlot as never,
      );

      expect(updateScheduleSpy).toHaveBeenCalledWith(
        'class-1',
        otherTeacherSlot,
        undefined,
      );
    });

    it('#275: Quản lý lớp sửa được slot của gia sư khác (không backdate)', async () => {
      mockStaffOperationsAccess.resolveClassWorkAccess.mockResolvedValue(
        workAccess({ staffId: 'manager-1', isClassManager: true }),
      );
      const updateScheduleSpy = jest
        .spyOn(service, 'updateClassSchedule')
        .mockResolvedValue({ id: 'class-1' } as never);

      await service.updateClassScheduleForStaff(
        'user-1',
        UserRole.staff,
        'class-1',
        otherTeacherSlot as never,
      );

      expect(updateScheduleSpy).toHaveBeenCalledWith(
        'class-1',
        {
          schedule: [
            expect.objectContaining({
              teacherId: 'teacher-2',
              effectiveFrom: undefined,
            }),
          ],
        },
        undefined,
      );
    });

    it('#275: kiêm gia sư + Quản lý lớp được hợp quyền (không bị khoá về slot của mình)', async () => {
      mockStaffOperationsAccess.resolveClassWorkAccess.mockResolvedValue(
        workAccess({
          staffId: 'teacher-1',
          isClassTeacher: true,
          isClassManager: true,
        }),
      );
      const updateScheduleSpy = jest
        .spyOn(service, 'updateClassSchedule')
        .mockResolvedValue({ id: 'class-1' } as never);

      await service.updateClassScheduleForStaff(
        'user-1',
        UserRole.staff,
        'class-1',
        otherTeacherSlot as never,
      );

      expect(updateScheduleSpy).toHaveBeenCalled();
    });

    it('rejects a pure teacher editing another teacher slot', async () => {
      mockStaffOperationsAccess.resolveClassWorkAccess.mockResolvedValue(
        workAccess({ staffId: 'teacher-1', isClassTeacher: true }),
      );
      const updateScheduleSpy = jest
        .spyOn(service, 'updateClassSchedule')
        .mockResolvedValue({ id: 'class-1' } as never);

      await expect(
        service.updateClassScheduleForStaff(
          'user-1',
          UserRole.staff,
          'class-1',
          otherTeacherSlot as never,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(updateScheduleSpy).not.toHaveBeenCalled();
    });

    it('#275: lớp không được giao (hoặc Kế toán) → 403 từ resolveClassWorkAccess', async () => {
      mockStaffOperationsAccess.resolveClassWorkAccess.mockRejectedValue(
        new ForbiddenException('no'),
      );
      const updateScheduleSpy = jest
        .spyOn(service, 'updateClassSchedule')
        .mockResolvedValue({ id: 'class-1' } as never);

      await expect(
        service.updateClassScheduleForStaff(
          'user-1',
          UserRole.staff,
          'class-1',
          otherTeacherSlot as never,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(updateScheduleSpy).not.toHaveBeenCalled();
    });

    it('strips effectiveFrom from a pure-teacher actor submission (only admin may backdate)', async () => {
      mockStaffOperationsAccess.resolveClassWorkAccess.mockResolvedValue(
        workAccess({ staffId: 'teacher-1', isClassTeacher: true }),
      );
      const updateScheduleSpy = jest
        .spyOn(service, 'updateClassSchedule')
        .mockResolvedValue({ id: 'class-1' } as never);

      await service.updateClassScheduleForStaff(
        'user-1',
        UserRole.staff,
        'class-1',
        {
          schedule: [
            {
              dayOfWeek: 3,
              from: '20:00:00',
              to: '21:30:00',
              teacherId: 'teacher-1',
              effectiveFrom: '2026-01-01',
            },
          ],
        } as never,
      );

      expect(updateScheduleSpy).toHaveBeenCalledWith(
        'class-1',
        {
          schedule: [
            expect.objectContaining({
              teacherId: 'teacher-1',
              effectiveFrom: undefined,
            }),
          ],
        },
        undefined,
      );
    });
  });

  describe('updateClassBasicInfo', () => {
    it('updates class default allowance without overwriting teacher custom_allowance', async () => {
      await service.updateClassBasicInfo('class-1', {
        allowance_per_session_per_student: 90000,
      });

      expect(mockTx.class.update).toHaveBeenCalledWith({
        where: { id: 'class-1' },
        data: {
          allowancePerSessionPerStudent: 90000,
        },
      });
      expect(mockTx.classTeacher.updateMany).not.toHaveBeenCalled();
    });

    it('dual-writes per-block allowance when the class has a 90-minute fixed schedule', async () => {
      mockTx.classScheduleEntry.findMany.mockResolvedValue([
        { from: '19:00:00', to: '20:30:00' },
      ]);

      await service.updateClassBasicInfo('class-1', {
        allowance_per_session_per_student: 90000,
      });

      expect(mockTx.class.update).toHaveBeenCalledWith({
        where: { id: 'class-1' },
        data: {
          allowancePerSessionPerStudent: 90000,
          allowancePerBlockPerStudent: 30000,
        },
      });
    });

    it('stores explicit student_tuition_per_block and does not overwrite it from per-session', async () => {
      mockTx.classScheduleEntry.findMany.mockResolvedValue([
        { from: '19:00:00', to: '20:30:00' },
      ]);

      await service.updateClassTuition('class-1', {
        student_tuition_per_session: 180000,
        student_tuition_per_block: 50000,
      });

      expect(mockTx.class.update).toHaveBeenCalledWith({
        where: { id: 'class-1' },
        data: {
          studentTuitionPerSession: 180000,
          studentTuitionPerBlock: 50000,
        },
      });
    });

    it('derives student_tuition_per_block from per-session when the explicit field is null', async () => {
      mockTx.classScheduleEntry.findMany.mockResolvedValue([
        { from: '19:00:00', to: '20:30:00' },
      ]);

      await service.updateClassTuition('class-1', {
        student_tuition_per_session: 180000,
        student_tuition_per_block: null,
      });

      expect(mockTx.class.update).toHaveBeenCalledWith({
        where: { id: 'class-1' },
        data: {
          studentTuitionPerSession: 180000,
          studentTuitionPerBlock: 60000,
        },
      });
    });

    it('#272: basic-info bỏ qua trường học phí lọt qua (chỉ ghi Thông tin lớp)', async () => {
      await service.updateClassBasicInfo('class-1', {
        name: 'Lớp mới',
        student_tuition_per_session: 180000,
        tuition_package_total: 2000000,
      } as never);

      expect(mockTx.class.update).toHaveBeenCalledWith({
        where: { id: 'class-1' },
        data: { name: 'Lớp mới' },
      });
    });

    it('#272: updateClassTuition chỉ ghi trường học phí, bỏ qua lương / tên lớp', async () => {
      await service.updateClassTuition('class-1', {
        tuition_package_total: 2000000,
        tuition_package_session: 10,
        name: 'Không được đổi',
        allowance_per_session_per_student: 999999,
      } as never);

      expect(mockTx.class.update).toHaveBeenCalledWith({
        where: { id: 'class-1' },
        data: {
          tuitionPackageTotal: 2000000,
          tuitionPackageSession: 10,
        },
      });
    });

    it('rejects ending a running class via basic-info (must use POST /end)', async () => {
      mockPrisma.class.findUnique.mockResolvedValueOnce({
        id: 'class-1',
        status: ClassStatus.running,
      });

      await expect(
        service.updateClassBasicInfo('class-1', {
          status: ClassStatus.ended,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mockTx.class.update).not.toHaveBeenCalled();
    });
  });

  describe('updateClassPricingMode', () => {
    it('rejects enabling block mode when the class has no standard duration', async () => {
      mockPrisma.class.findUnique.mockResolvedValueOnce({
        id: 'class-1',
        pricingMode: ClassPricingMode.per_session,
      });
      mockPrisma.classScheduleEntry.findMany.mockResolvedValue([]);

      await expect(
        service.updateClassPricingMode('class-1', {
          pricing_mode: ClassPricingMode.per_block,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mockTx.class.update).not.toHaveBeenCalled();
    });

    it('recalculates unpaid sessions and leaves paid/deposit sessions unchanged', async () => {
      mockPrisma.class.findUnique.mockResolvedValue({
        id: 'class-1',
        pricingMode: ClassPricingMode.per_session,
      });
      mockPrisma.classScheduleEntry.findMany.mockResolvedValue([
        { from: '19:00:00', to: '21:00:00' },
      ]);
      mockTx.class.findUnique.mockResolvedValue({
        studentTuitionPerSession: 180000,
        studentTuitionPerBlock: 60000,
        tuitionPackageTotal: null,
        tuitionPackageSession: null,
        allowancePerSessionPerStudent: 90000,
        allowancePerBlockPerStudent: 30000,
        scaleAmount: 0,
        trainingManagerStaffId: null,
        trainingManagerRatePercent: null,
      });
      mockTx.classScheduleEntry.findMany.mockResolvedValue([
        { from: '19:00:00', to: '21:00:00' },
      ]);
      mockTx.classTeacher.findMany.mockResolvedValue([
        { teacherId: 'teacher-1', customAllowance: null },
      ]);
      mockTx.studentClass.findMany.mockResolvedValue([
        {
          studentId: 'student-1',
          customStudentTuitionPerSession: null,
          customTuitionPerBlock: null,
          customTuitionPackageTotal: null,
          customTuitionPackageSession: null,
        },
      ]);
      mockTx.attendance.findMany = jest.fn().mockResolvedValue([]);
      mockTx.staffInfo.findMany.mockResolvedValue([]);
      mockTx.session.findMany.mockResolvedValue([
        {
          id: 'unpaid-session',
          teacherId: 'teacher-1',
          teacherPaymentStatus: 'unpaid',
          startTime: new Date('1970-01-01T19:00:00.000Z'),
          endTime: new Date('1970-01-01T21:00:00.000Z'),
          attendance: [
            {
              id: 'att-unpaid',
              studentId: 'student-1',
              status: 'present',
              tuitionFee: 180000,
              transactionId: 'txn-1',
            },
          ],
        },
        {
          id: 'paid-session',
          teacherId: 'teacher-1',
          teacherPaymentStatus: 'paid',
          startTime: new Date('1970-01-01T19:00:00.000Z'),
          endTime: new Date('1970-01-01T21:00:00.000Z'),
          attendance: [
            {
              id: 'att-paid',
              studentId: 'student-1',
              status: 'present',
              tuitionFee: 180000,
              transactionId: 'txn-paid',
            },
          ],
        },
      ]);

      await service.updateClassPricingMode('class-1', {
        pricing_mode: ClassPricingMode.per_block,
      });

      expect(mockTx.class.update).toHaveBeenCalledWith({
        where: { id: 'class-1' },
        data: { pricingMode: ClassPricingMode.per_block },
      });
      expect(mockTx.session.update).toHaveBeenCalledTimes(1);
      expect(mockTx.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'unpaid-session' },
          data: expect.objectContaining({
            snapshotBlockCount: 4,
            tuitionFee: 240000,
            allowanceAmount: 120000,
            snapshotPerStudentAllowance: 120000,
          }),
        }),
      );
      expect(mockTx.attendance.update).toHaveBeenCalledWith({
        where: { id: 'att-unpaid' },
        data: { tuitionFee: 240000, trialCatchUpFee: null },
      });
      expect(mockTx.attendance.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'att-paid' } }),
      );
    });
  });

  describe('updateClassTeachers', () => {
    it('persists null custom_allowance for new teachers when field is omitted', async () => {
      await service.updateClassTeachers('class-1', {
        teachers: [{ teacher_id: 'teacher-1' }],
      });

      expect(mockTx.classTeacher.createMany).toHaveBeenCalledWith({
        data: [
          {
            classId: 'class-1',
            teacherId: 'teacher-1',
            customAllowance: null,
            customAllowancePerSession: null,
            customScaleAmount: null,
            operatingDeductionRatePercent: 0,
            status: 'active',
          },
        ],
      });
    });

    it('preserves existing custom_allowance when field is omitted', async () => {
      mockTx.classTeacher.findMany.mockResolvedValue([
        {
          teacherId: 'teacher-1',
          customAllowance: 180000,
          operatingDeductionRatePercent: 0,
        },
      ]);

      await service.updateClassTeachers('class-1', {
        teachers: [{ teacher_id: 'teacher-1' }],
      });

      expect(mockTx.classTeacher.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            teacherId: 'teacher-1',
            customAllowance: 180000,
          }),
        ],
      });
    });

    it('clears override when custom_allowance is null', async () => {
      mockTx.classTeacher.findMany.mockResolvedValue([
        {
          teacherId: 'teacher-1',
          customAllowance: 180000,
          operatingDeductionRatePercent: 0,
        },
      ]);

      await service.updateClassTeachers('class-1', {
        teachers: [{ teacher_id: 'teacher-1', custom_allowance: null }],
      });

      expect(mockTx.classTeacher.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            teacherId: 'teacher-1',
            customAllowance: null,
          }),
        ],
      });
    });

    it('preserves existing custom_scale_amount (including 0) when field is omitted', async () => {
      mockTx.classTeacher.findMany.mockResolvedValue([
        {
          teacherId: 'teacher-1',
          customAllowance: null,
          customScaleAmount: 0,
          operatingDeductionRatePercent: 0,
        },
      ]);

      await service.updateClassTeachers('class-1', {
        teachers: [{ teacher_id: 'teacher-1' }],
      });

      expect(mockTx.classTeacher.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            teacherId: 'teacher-1',
            customScaleAmount: 0,
          }),
        ],
      });
    });

    it('sets and clears custom_scale_amount explicitly', async () => {
      mockTx.classTeacher.findMany.mockResolvedValue([
        {
          teacherId: 'teacher-1',
          customAllowance: null,
          customScaleAmount: 40000,
          operatingDeductionRatePercent: 0,
        },
      ]);

      await service.updateClassTeachers('class-1', {
        teachers: [
          { teacher_id: 'teacher-1', custom_scale_amount: null },
          { teacher_id: 'teacher-2', custom_scale_amount: 25000 },
        ],
      });

      expect(mockTx.classTeacher.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            teacherId: 'teacher-1',
            customScaleAmount: null,
          }),
          expect.objectContaining({
            teacherId: 'teacher-2',
            customScaleAmount: 25000,
          }),
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
            customAllowancePerSession: 150000,
            customScaleAmount: null,
            operatingDeductionRatePercent: 7.5,
            status: 'active',
          },
        ],
      });
    });

    it('removes fixed schedule slots owned by teachers removed from the class and syncs Google Calendar', async () => {
      mockPrisma.class.findUnique.mockResolvedValue({
        id: 'class-1',
        name: 'Math 10A',
        allowancePerSessionPerStudent: 120000,
      });
      mockTx.classScheduleEntry.findMany.mockResolvedValue([
        {
          id: 'slot-removed',
          classId: 'class-1',
          dayOfWeek: 1,
          from: '19:00:00',
          to: '20:30:00',
          teacherId: 'teacher-removed',
          googleCalendarEventId: 'google-removed',
          meetLink: 'https://meet.google.com/removed',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
          effectiveTo: null,
        },
      ]);
      mockTx.classTeacher.findMany.mockResolvedValue([
        {
          teacherId: 'teacher-removed',
          customAllowance: null,
          operatingDeductionRatePercent: 0,
        },
        {
          teacherId: 'teacher-kept',
          customAllowance: null,
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

      expect(mockTx.classScheduleEntry.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['slot-removed'] } },
        data: { effectiveTo: expect.any(Date) },
      });
      expect(mockCalendarService.syncScheduleWithCalendar).toHaveBeenCalledWith(
        'class-1',
        [
          expect.objectContaining({
            id: 'slot-removed',
            teacherId: 'teacher-removed',
            googleCalendarEventId: 'google-removed',
            meetLink: 'https://meet.google.com/removed',
            deletedAt: expect.any(String),
          }),
        ],
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
          customAllowancePerSession: 150000,
          operatingDeductionRatePercent: 7.5,
        },
      });
    });

    it('updates only compensation fields included in the payload', async () => {
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
          operatingDeductionRatePercent: 7.5,
        },
      });
    });

    it('stores custom_scale_amount 0 as override and null as inherit', async () => {
      mockPrisma.class.findUnique.mockResolvedValue({
        id: 'class-1',
        teachers: [
          { teacherId: 'teacher-1', operatingDeductionRatePercent: 5 },
          { teacherId: 'teacher-2', operatingDeductionRatePercent: 5 },
        ],
      });

      await service.updateClassTeacherCompensation('class-1', {
        teachers: [
          { teacher_id: 'teacher-1', custom_scale_amount: 0 },
          { teacher_id: 'teacher-2', custom_scale_amount: null },
        ],
      });

      expect(mockTx.classTeacher.update).toHaveBeenCalledWith({
        where: {
          classId_teacherId: { classId: 'class-1', teacherId: 'teacher-1' },
        },
        data: { customScaleAmount: 0, operatingDeductionRatePercent: 5 },
      });
      expect(mockTx.classTeacher.update).toHaveBeenCalledWith({
        where: {
          classId_teacherId: { classId: 'class-1', teacherId: 'teacher-2' },
        },
        data: { customScaleAmount: null, operatingDeductionRatePercent: 5 },
      });
    });

    it('clears custom allowance when null is sent', async () => {
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
            custom_allowance: null,
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
          customAllowance: null,
          customAllowancePerSession: null,
          operatingDeductionRatePercent: 5,
        },
      });
    });
  });

  describe('getClassByIdForStaff ẩn học phí với Quản lý lớp (#276)', () => {
    const classDetail = () => ({
      id: 'class-1',
      studentTuitionPerSession: 200000,
      tuitionPackageTotal: 2000000,
      tuitionPackageSession: 10,
      teachers: [
        { id: 'teacher-actor', customAllowance: 100000 },
        { id: 'teacher-2', customAllowance: 90000 },
      ],
      students: [
        {
          id: 'student-1',
          customTuitionPerSession: 180000,
          effectiveTuitionPerSession: 180000,
        },
      ],
    });

    const viewAs = async (flags: {
      mode: 'teacher' | 'training_manager' | 'training_head';
      isClassManager: boolean;
      isTrainingHead?: boolean;
    }) => {
      mockStaffOperationsAccess.resolveClassViewerActor.mockResolvedValue({
        id: 'teacher-actor',
        roles: ['teacher', 'training'],
      });
      mockStaffOperationsAccess.resolveClassAccess.mockResolvedValue({
        isTrainingHead: false,
        ...flags,
        isAdmin: false,
        isClassTeacher: flags.mode === 'teacher',
      });
      jest
        .spyOn(service, 'getClassById')
        .mockResolvedValue(classDetail() as never);
      return (await service.getClassByIdForStaff(
        'user-1',
        UserRole.staff,
        'class-1',
      )) as unknown as Record<string, unknown> & {
        students: Record<string, unknown>[];
        teachers: Record<string, unknown>[];
      };
    };

    it.each([
      ['Quản lý lớp kiêm gia sư', 'teacher'],
      ['Quản lý lớp thuần', 'training_manager'],
    ] as const)('%s không thấy học phí lớp / học sinh', async (_l, mode) => {
      const result = await viewAs({ mode, isClassManager: true });

      expect(result.studentTuitionPerSession).toBeUndefined();
      expect(result.tuitionPackageTotal).toBeUndefined();
      expect(result.students[0].customTuitionPerSession).toBeUndefined();
      expect(result.students[0].effectiveTuitionPerSession).toBeUndefined();
      // Vẫn thấy lương các gia sư khác để chỉnh.
      expect(result.teachers[1].customAllowance).toBe(90000);
    });

    it.each([
      ['Trưởng ban Đào tạo trên lớp không quản lý', 'training_head'],
      ['Trưởng ban Đào tạo kiêm gia sư lớp', 'teacher'],
    ] as const)(
      '%s không thấy học phí, thấy lương mọi gia sư (#277)',
      async (_l, mode) => {
        const result = await viewAs({
          mode,
          isClassManager: false,
          isTrainingHead: true,
        });

        expect(result.studentTuitionPerSession).toBeUndefined();
        expect(result.tuitionPackageTotal).toBeUndefined();
        expect(result.students[0].customTuitionPerSession).toBeUndefined();
        expect(result.teachers[1].customAllowance).toBe(90000);
      },
    );

    it('gia sư thuần không thấy học phí, chỉ thấy lương của mình (quyết định 13/11)', async () => {
      const result = await viewAs({ mode: 'teacher', isClassManager: false });

      expect(result.studentTuitionPerSession).toBeUndefined();
      expect(result.tuitionPackageTotal).toBeUndefined();
      expect(result.students[0].effectiveTuitionPerSession).toBeUndefined();
      expect(result.teachers[0].customAllowance).toBe(100000);
      expect(result.teachers[1].customAllowance).toBeUndefined();
    });

    it('CSKH chỉ thấy học phí học sinh mình chăm sóc, không thấy học phí lớp / lương gia sư', async () => {
      mockStaffOperationsAccess.resolveClassViewerActor.mockResolvedValue({
        id: 'cskh-actor',
        roles: ['customer_care'],
      });
      mockStaffOperationsAccess.resolveClassAccess.mockResolvedValue({
        mode: 'customer_care',
        isAdmin: false,
        isClassTeacher: false,
        isClassManager: false,
        isTrainingHead: false,
      });
      jest.spyOn(service, 'getClassById').mockResolvedValue({
        ...classDetail(),
        students: [
          { id: 'student-1', effectiveTuitionPerSession: 180000 },
          { id: 'student-2', effectiveTuitionPerSession: 150000 },
        ],
      } as never);
      mockPrisma.customerCareService.findMany.mockResolvedValue([
        { studentId: 'student-1' },
      ]);

      const result = (await service.getClassByIdForStaff(
        'user-1',
        UserRole.staff,
        'class-1',
      )) as unknown as Record<string, unknown> & {
        students: Record<string, unknown>[];
        teachers: Record<string, unknown>[];
      };

      expect(result.studentTuitionPerSession).toBeUndefined();
      expect(result.tuitionPackageTotal).toBeUndefined();
      expect(result.students[0].effectiveTuitionPerSession).toBe(180000);
      expect(result.students[1].effectiveTuitionPerSession).toBeUndefined();
      expect(result.teachers[0].customAllowance).toBeUndefined();
      expect(result.teachers[1].customAllowance).toBeUndefined();
    });
  });

  describe('updateClassTeacherPay', () => {
    beforeEach(() => {
      mockPrisma.class.findUnique.mockResolvedValue({
        id: 'class-1',
        teachers: [
          {
            teacherId: 'teacher-1',
            operatingDeductionRatePercent: 5,
            customAllowance: null,
            customAllowancePerSession: null,
            customScaleAmount: null,
            status: 'active',
          },
          // Quản lý lớp kiêm gia sư, có trợ cấp + scale riêng.
          {
            teacherId: 'manager-1',
            operatingDeductionRatePercent: 0,
            customAllowance: 120000,
            customAllowancePerSession: 120000,
            customScaleAmount: 10000,
            status: 'active',
          },
        ],
      });
    });

    it('rejects an empty pay update instead of writing an empty audit', async () => {
      await expect(
        service.updateClassTeacherPay(
          'class-1',
          {},
          { lockedTeacherId: 'manager-1' },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('updates class defaults and teacher compensation in one transaction', async () => {
      await service.updateClassTeacherPay(
        'class-1',
        {
          allowance_per_session_per_student: 90000,
          scale_amount: 20000,
          teachers: [
            {
              teacher_id: 'teacher-1',
              custom_scale_amount: 0,
              operating_deduction_rate_percent: 8,
            },
          ],
        },
        { lockedTeacherId: 'manager-1' },
        { userId: 'training-user', roleType: UserRole.staff },
      );

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      const [classUpdateArgs] = mockTx.class.update.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(classUpdateArgs).toMatchObject({
        where: { id: 'class-1' },
        data: { allowancePerSessionPerStudent: 90000, scaleAmount: 20000 },
      });
      expect(classUpdateArgs.data).not.toHaveProperty(
        'studentTuitionPerSession',
      );
      expect(mockTx.classTeacher.update).toHaveBeenCalledWith({
        where: {
          classId_teacherId: { classId: 'class-1', teacherId: 'teacher-1' },
        },
        data: { customScaleAmount: 0, operatingDeductionRatePercent: 8 },
      });
      expect(mockActionHistoryService.recordUpdate).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({
          description: 'Cập nhật lương gia sư của lớp học (quản lý lớp)',
        }),
      );
    });

    it('rejects editing the locked (self) teacher row', async () => {
      await expect(
        service.updateClassTeacherPay(
          'class-1',
          { teachers: [{ teacher_id: 'manager-1', custom_allowance: 1 }] },
          { lockedTeacherId: 'manager-1' },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('allows class defaults the teaching manager does not inherit (custom allowance/scale)', async () => {
      await service.updateClassTeacherPay(
        'class-1',
        { allowance_per_session_per_student: 100000, scale_amount: 5000 },
        { lockedTeacherId: 'manager-1' },
      );

      expect(mockTx.class.update).toHaveBeenCalled();
      expect(mockTx.classTeacher.update).not.toHaveBeenCalled();
    });

    // #276: mức mặc định lớp mà dòng của Quản lý lớp đang kế thừa = lương của chính mình.
    it.each([
      [{ allowance_per_session_per_student: 100000 }],
      [{ scale_amount: 5000 }],
      [{ max_allowance_per_session: 300000 }],
    ])(
      'rejects class default %p inherited by the teaching manager',
      async (dto) => {
        mockPrisma.class.findUnique.mockResolvedValue({
          id: 'class-1',
          teachers: [
            {
              teacherId: 'manager-1',
              operatingDeductionRatePercent: 0,
              customAllowance: null,
              customAllowancePerSession: null,
              customScaleAmount: null,
              status: 'active',
            },
          ],
        });

        await expect(
          service.updateClassTeacherPay('class-1', dto, {
            lockedTeacherId: 'manager-1',
          }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      },
    );

    it('rejects the pay cap even when the teaching manager has custom pay', async () => {
      await expect(
        service.updateClassTeacherPay(
          'class-1',
          { max_allowance_per_session: 300000 },
          { lockedTeacherId: 'manager-1' },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows any class default when the manager does not teach (or stopped teaching) the class', async () => {
      mockPrisma.class.findUnique.mockResolvedValue({
        id: 'class-1',
        teachers: [
          {
            teacherId: 'teacher-1',
            operatingDeductionRatePercent: 5,
            customAllowance: null,
            customAllowancePerSession: null,
            customScaleAmount: null,
            status: 'active',
          },
          {
            teacherId: 'manager-1',
            operatingDeductionRatePercent: 0,
            customAllowance: null,
            customAllowancePerSession: null,
            customScaleAmount: null,
            status: 'inactive',
          },
        ],
      });

      await service.updateClassTeacherPay(
        'class-1',
        {
          allowance_per_session_per_student: 100000,
          max_allowance_per_session: 300000,
          scale_amount: 5000,
        },
        { lockedTeacherId: 'manager-1' },
      );

      expect(mockTx.class.update).toHaveBeenCalled();
    });

    it('lets Admin (no locked teacher) change every class default', async () => {
      await service.updateClassTeacherPay(
        'class-1',
        {
          max_allowance_per_session: 300000,
          teachers: [{ teacher_id: 'manager-1', custom_allowance: 1 }],
        },
        { lockedTeacherId: null },
      );

      expect(mockTx.classTeacher.update).toHaveBeenCalled();
    });

    it('rejects teachers not assigned to the class', async () => {
      await expect(
        service.updateClassTeacherPay('class-1', {
          teachers: [{ teacher_id: 'teacher-x', custom_allowance: 1 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('addClassTeacher', () => {
    beforeEach(() => {
      jest.spyOn(service, 'getClassById').mockResolvedValue({
        id: 'class-1',
      } as never);
    });

    it('creates a new active assignment with class-default pay', async () => {
      await service.addClassTeacher('class-1', 'teacher-2', {
        userId: 'training-user',
        roleType: UserRole.staff,
      });

      expect(mockTx.classTeacher.create).toHaveBeenCalledWith({
        data: {
          classId: 'class-1',
          teacherId: 'teacher-2',
          customAllowance: null,
          customAllowancePerSession: null,
          customScaleAmount: null,
          operatingDeductionRatePercent: 0,
          status: 'active',
        },
      });
      expect(mockTx.classTeacher.deleteMany).not.toHaveBeenCalled();
      expect(mockActionHistoryService.recordUpdate).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({ description: 'Thêm gia sư vào lớp học' }),
      );
    });

    it('reactivates a stopped teacher and resets pay overrides', async () => {
      mockTx.classTeacher.findUnique.mockResolvedValue({ status: 'inactive' });

      await service.addClassTeacher('class-1', 'teacher-2');

      expect(mockTx.classTeacher.create).not.toHaveBeenCalled();
      expect(mockTx.classTeacher.update).toHaveBeenCalledWith({
        where: {
          classId_teacherId: { classId: 'class-1', teacherId: 'teacher-2' },
        },
        data: {
          customAllowance: null,
          customAllowancePerSession: null,
          customScaleAmount: null,
          operatingDeductionRatePercent: 0,
          status: 'active',
        },
      });
    });

    it('rejects a teacher already active in the class', async () => {
      mockTx.classTeacher.findUnique.mockResolvedValue({ status: 'active' });

      await expect(
        service.addClassTeacher('class-1', 'teacher-2'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects staff without the teacher role', async () => {
      mockTx.staffInfo.findUnique.mockResolvedValue({
        status: StaffStatus.active,
        roles: [StaffRole.training],
      });

      await expect(
        service.addClassTeacher('class-1', 'staff-2'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects inactive teachers', async () => {
      mockTx.staffInfo.findUnique.mockResolvedValue({
        status: StaffStatus.inactive,
        roles: [StaffRole.teacher],
      });

      await expect(
        service.addClassTeacher('class-1', 'teacher-2'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects ended classes', async () => {
      (
        service as unknown as {
          getClassAuditSnapshot: jest.Mock;
        }
      ).getClassAuditSnapshot.mockResolvedValueOnce({
        id: 'class-1',
        status: ClassStatus.ended,
        schedule: [],
        teachers: [],
      });

      await expect(
        service.addClassTeacher('class-1', 'teacher-2'),
      ).rejects.toBeInstanceOf(BadRequestException);
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

    describe('#273 bắt điền học phí lớp khi thêm học sinh đầu tiên', () => {
      const classTuitionRow = (overrides: Record<string, unknown> = {}) => ({
        id: 'class-1',
        name: 'Math 10A',
        pricingMode: ClassPricingMode.per_session,
        studentTuitionPerSession: null,
        studentTuitionPerBlock: null,
        tuitionPackageTotal: null,
        tuitionPackageSession: null,
        ...overrides,
      });
      /** Truy vấn học sinh đang học của #273 có `OR` status; còn lại là roster cũ. */
      const mockRoster = (activeClassIds: string[]) => {
        mockTx.studentClass.findMany.mockImplementation((args: any) =>
          Promise.resolve(
            args?.where?.OR
              ? activeClassIds.map((classId) => ({ classId }))
              : [],
          ),
        );
      };

      it('lớp trống, học phí lớp null → 400 và không thêm học sinh', async () => {
        mockRoster([]);
        mockTx.class.findMany.mockResolvedValue([classTuitionRow()]);

        await expect(
          service.updateClassStudents('class-1', {
            students: [{ id: 'student-1' }],
          }),
        ).rejects.toThrow(
          'Lớp chưa có học phí. Hãy điền Học phí lớp trước khi thêm học sinh đầu tiên.',
        );
        expect(mockTx.studentClass.create).not.toHaveBeenCalled();
        expect(mockTx.studentClass.updateMany).not.toHaveBeenCalled();
      });

      it('học sinh có học phí riêng vẫn bị chặn khi lớp chưa có học phí', async () => {
        mockRoster([]);
        mockTx.class.findMany.mockResolvedValue([classTuitionRow()]);

        await expect(
          service.updateClassStudents('class-1', {
            students: [
              {
                id: 'student-1',
                custom_tuition_package_total: 3600000,
                custom_tuition_package_session: 12,
              },
            ],
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(mockTx.studentClass.create).not.toHaveBeenCalled();
      });

      it('học phí lớp 0đ tính là đã điền', async () => {
        mockRoster([]);
        mockTx.class.findMany.mockResolvedValue([
          classTuitionRow({ studentTuitionPerSession: 0 }),
        ]);

        await service.updateClassStudents('class-1', {
          students: [{ id: 'student-1' }],
        });
        expect(mockTx.studentClass.create).toHaveBeenCalledTimes(1);
      });

      it.each([
        [
          'theo buổi',
          {
            pricingMode: ClassPricingMode.per_session,
            studentTuitionPerSession: 250000,
          },
        ],
        [
          'theo gói buổi',
          {
            pricingMode: ClassPricingMode.per_session,
            tuitionPackageTotal: 3000000,
            tuitionPackageSession: 12,
          },
        ],
        [
          'theo 30 phút',
          {
            pricingMode: ClassPricingMode.per_block,
            studentTuitionPerBlock: 80000,
          },
        ],
        [
          'trọn gói',
          {
            pricingMode: ClassPricingMode.one_time,
            tuitionPackageTotal: 5000000,
          },
        ],
      ])('cho thêm khi lớp đã có học phí %s', async (_label, tuition) => {
        mockRoster([]);
        mockTx.class.findMany.mockResolvedValue([classTuitionRow(tuition)]);

        await service.updateClassStudents('class-1', {
          students: [{ id: 'student-1' }],
        });
        expect(mockTx.studentClass.create).toHaveBeenCalledTimes(1);
      });

      it('trọn gói chỉ có học phí / buổi (thiếu tổng gói) → 400', async () => {
        mockRoster([]);
        mockTx.class.findMany.mockResolvedValue([
          classTuitionRow({
            pricingMode: ClassPricingMode.one_time,
            studentTuitionPerSession: 300000,
          }),
        ]);

        await expect(
          service.updateClassStudents('class-1', {
            students: [{ id: 'student-1' }],
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it('lớp đã có học sinh đang học → không áp quy tắc', async () => {
        mockRoster(['class-1']);
        mockTx.class.findMany.mockResolvedValue([classTuitionRow()]);

        await service.updateClassStudents('class-1', {
          students: [{ id: 'student-1' }],
        });
        expect(mockTx.class.findMany).not.toHaveBeenCalled();
        expect(mockTx.studentClass.create).toHaveBeenCalledTimes(1);
      });

      it('bớt hết học sinh không cần học phí', async () => {
        mockRoster([]);
        mockTx.class.findMany.mockResolvedValue([classTuitionRow()]);

        await service.updateClassStudents('class-1', { students: [] });
        expect(mockTx.class.findMany).not.toHaveBeenCalled();
      });

      it('PATCH /class: học phí gửi cùng payload được tính (kiểm sau khi ghi lớp)', async () => {
        mockRoster([]);
        mockPrisma.class.findUnique.mockResolvedValue({ id: 'class-1' });
        mockTx.class.findUnique.mockResolvedValue({
          courseId: 'course-basic',
          tuitionPackageTotal: null,
          course: { isOneTime: false },
        });
        mockTx.class.findMany.mockResolvedValue([
          classTuitionRow({ studentTuitionPerSession: 0 }),
        ]);

        await service.updateClass({
          id: 'class-1',
          student_tuition_per_session: 0,
          student_ids: ['student-1'],
        } as never);

        expect(mockTx.class.findMany).toHaveBeenCalledTimes(1);
        expect(mockTx.class.update.mock.invocationCallOrder[0]).toBeLessThan(
          mockTx.class.findMany.mock.invocationCallOrder[0],
        );
      });

      it('16/11 PATCH /class: học sinh đang học giữ học phí riêng, chỉ học sinh vào lại bị reset', async () => {
        mockPrisma.class.findUnique.mockResolvedValue({ id: 'class-1' });
        mockTx.class.findUnique.mockResolvedValue({
          courseId: 'course-basic',
          tuitionPackageTotal: 1_600_000,
          course: { isOneTime: false },
        });
        type FindArgs = {
          where?: { class?: unknown; OR?: unknown };
          select?: { status?: boolean };
        };
        mockTx.studentClass.findMany.mockImplementation((args: FindArgs) => {
          if (args?.where?.class) return Promise.resolve([]);
          if (args?.where?.OR) {
            return Promise.resolve([{ classId: 'class-1' }]);
          }
          if (args?.select?.status) {
            return Promise.resolve([
              { studentId: 'student-1', status: 'active' },
              { studentId: 'student-2', status: 'inactive' },
            ]);
          }
          return Promise.resolve([]);
        });

        await service.updateClass({
          id: 'class-1',
          student_ids: ['student-1', 'student-2'],
        } as never);

        const resetCalls = (
          mockTx.studentClass.updateMany.mock.calls as Array<
            [{ data?: { status?: string } }]
          >
        ).filter(([args]) => args?.data?.status === 'active');
        expect(resetCalls).toHaveLength(1);
        expect(resetCalls[0][0]).toEqual({
          where: { classId: 'class-1', studentId: 'student-2' },
          data: {
            status: 'active',
            customStudentTuitionPerSession: null,
            customTuitionPerBlock: null,
            customTuitionPackageTotal: null,
            customTuitionPackageSession: null,
          },
        });
        expect(mockTx.studentClass.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              classId: { in: ['class-1'] },
              studentId: { in: ['student-1', 'student-2'] },
              class: { pricingMode: 'one_time' },
            }) as unknown,
          }),
        );
      });

      it('PATCH /class: lớp trống, không học phí → 400', async () => {
        mockRoster([]);
        mockPrisma.class.findUnique.mockResolvedValue({ id: 'class-1' });
        mockTx.class.findUnique.mockResolvedValue({
          courseId: 'course-basic',
          tuitionPackageTotal: null,
          course: { isOneTime: false },
        });
        mockTx.class.findMany.mockResolvedValue([classTuitionRow()]);

        await expect(
          service.updateClass({
            id: 'class-1',
            student_ids: ['student-1'],
          } as never),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it('POST /class kèm học sinh mà chưa có học phí → 400 trước khi ghi roster', async () => {
        mockTx.course.findUnique.mockResolvedValue({
          id: 'basic-category-id',
          defaultDurationDays: null,
        });
        mockTx.class.findMany.mockResolvedValue([classTuitionRow()]);

        await expect(
          service.createClass({
            name: 'Math 10A',
            course_id: 'basic-category-id',
            status: ClassStatus.running,
            student_ids: ['student-1'],
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(mockTx.studentClass.createMany).not.toHaveBeenCalled();
      });
    });
  });

  describe('khoá bán một lần', () => {
    beforeEach(() => {
      mockPrisma.class.findUnique.mockResolvedValue({
        id: 'class-1',
        status: ClassStatus.running,
        pricingMode: ClassPricingMode.per_session,
      });
      mockTx.class.findUnique.mockResolvedValue({
        courseId: 'course-basic',
        tuitionPackageTotal: 1600000,
        course: { isOneTime: false },
      });
    });

    it('chặn đổi lớp sang khoá khác chế độ', async () => {
      mockTx.course.findUnique.mockResolvedValue({
        id: 'course-thptqg',
        name: 'THPTQG',
        isOneTime: true,
        defaultDurationDays: null,
      });
      await expect(
        service.updateClassBasicInfo('class-1', { course_id: 'course-thptqg' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockTx.class.update).not.toHaveBeenCalled();
    });

    it('cho đổi sang khoá cùng chế độ', async () => {
      mockTx.course.findUnique.mockResolvedValue({
        id: 'course-advance',
        name: 'Advance',
        isOneTime: false,
        defaultDurationDays: null,
      });
      await service.updateClassBasicInfo('class-1', {
        course_id: 'course-advance',
      });
      expect(mockTx.class.update).toHaveBeenCalled();
    });

    it('chặn xoá tổng gói của lớp bán một lần', async () => {
      mockTx.class.findUnique.mockResolvedValue({
        courseId: 'course-thptqg',
        tuitionPackageTotal: 1600000,
        course: { isOneTime: true },
      });
      await expect(
        service.updateClassTuition('class-1', { tuition_package_total: 0 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockTx.class.update).not.toHaveBeenCalled();
    });

    describe('gói trống của lớp bán một lần (follow-up grill 13/11)', () => {
      const oneTimeCourse = {
        id: 'course-thptqg',
        name: 'THPTQG',
        isOneTime: true,
        defaultDurationDays: null,
      };
      const mockActiveRoster = (activeClassIds: string[]) => {
        mockTx.studentClass.findMany.mockImplementation((args: any) =>
          Promise.resolve(
            args?.where?.OR
              ? activeClassIds.map((classId) => ({ classId }))
              : [],
          ),
        );
      };

      it('tạo lớp bán một lần với gói trống → cho tạo (điền gói sau)', async () => {
        mockTx.course.findUnique.mockResolvedValue(oneTimeCourse);
        mockTx.class.findUnique.mockResolvedValue({
          id: 'class-1',
          name: 'THPTQG 2027',
          courseId: oneTimeCourse.id,
          status: ClassStatus.running,
          pricingMode: ClassPricingMode.one_time,
          schedule: [],
          tuitionPackageTotal: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        });
        mockActiveRoster([]);

        await service.createClass({
          name: 'THPTQG 2027',
          course_id: oneTimeCourse.id,
          status: ClassStatus.running,
        });

        expect(mockTx.class.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              pricingMode: ClassPricingMode.one_time,
              tuitionPackageTotal: undefined,
            }),
          }),
        );
      });

      it('tạo lớp bán một lần gói 0đ → 400', async () => {
        mockTx.course.findUnique.mockResolvedValue(oneTimeCourse);
        await expect(
          service.createClass({
            name: 'THPTQG 2027',
            course_id: oneTimeCourse.id,
            status: ClassStatus.running,
            tuition_package_total: 0,
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(mockTx.class.create).not.toHaveBeenCalled();
      });

      it('tạo lớp bán một lần gói trống kèm học sinh → 400 trước khi ghi roster', async () => {
        mockTx.course.findUnique.mockResolvedValue(oneTimeCourse);
        mockTx.class.findMany.mockResolvedValue([
          {
            id: 'class-1',
            name: 'THPTQG 2027',
            pricingMode: ClassPricingMode.one_time,
            studentTuitionPerSession: null,
            studentTuitionPerBlock: null,
            tuitionPackageTotal: null,
            tuitionPackageSession: null,
          },
        ]);
        await expect(
          service.createClass({
            name: 'THPTQG 2027',
            course_id: oneTimeCourse.id,
            status: ClassStatus.running,
            student_ids: ['student-1'],
          }),
        ).rejects.toThrow(/Tổng gói lớn hơn 0đ/);
        expect(mockTx.studentClass.createMany).not.toHaveBeenCalled();
      });

      it('sửa lớp bán một lần còn trống mà gói vẫn trống → cho lưu', async () => {
        mockTx.class.findUnique.mockResolvedValue({
          courseId: oneTimeCourse.id,
          tuitionPackageTotal: null,
          course: { isOneTime: true },
        });
        mockActiveRoster([]);
        await service.updateClassBasicInfo('class-1', { name: 'Tên mới' });
        expect(mockTx.class.update).toHaveBeenCalled();
      });

      it('xoá gói lớp bán một lần đang có học sinh học → 400', async () => {
        mockTx.class.findUnique.mockResolvedValue({
          courseId: oneTimeCourse.id,
          tuitionPackageTotal: 1600000,
          course: { isOneTime: true },
        });
        mockActiveRoster(['class-1']);
        await expect(
          service.updateClassTuition('class-1', {
            tuition_package_total: null,
          } as never),
        ).rejects.toThrow(/đang có học sinh/);
        expect(mockTx.class.update).not.toHaveBeenCalled();
      });

      it('lớp bán một lần đang có học sinh mà gói trống (dữ liệu cũ) → mọi lần sửa đều bắt điền gói', async () => {
        mockTx.class.findUnique.mockResolvedValue({
          courseId: oneTimeCourse.id,
          tuitionPackageTotal: null,
          course: { isOneTime: true },
        });
        mockActiveRoster(['class-1']);
        await expect(
          service.updateClassBasicInfo('class-1', { name: 'Tên mới' }),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it('đổi sang khoá bán một lần khác khi lớp trống, gói trống → cho đổi', async () => {
        mockTx.class.findUnique.mockResolvedValue({
          courseId: oneTimeCourse.id,
          tuitionPackageTotal: null,
          course: { isOneTime: true },
        });
        mockTx.course.findUnique.mockResolvedValue({
          ...oneTimeCourse,
          id: 'course-prevoi',
          name: 'PREVOI',
        });
        mockActiveRoster([]);
        await service.updateClassBasicInfo('class-1', {
          course_id: 'course-prevoi',
        });
        expect(mockTx.class.update).toHaveBeenCalled();
      });

      it('đổi sang khoá bán một lần khác khi lớp có học sinh mà gói trống → 400', async () => {
        mockTx.class.findUnique.mockResolvedValue({
          courseId: oneTimeCourse.id,
          tuitionPackageTotal: null,
          course: { isOneTime: true },
        });
        mockTx.course.findUnique.mockResolvedValue({
          ...oneTimeCourse,
          id: 'course-prevoi',
          name: 'PREVOI',
        });
        mockActiveRoster(['class-1']);
        await expect(
          service.updateClassBasicInfo('class-1', {
            course_id: 'course-prevoi',
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
      });
    });

    it('không bật/tắt one_time trên từng lớp', async () => {
      await expect(
        service.updateClassPricingMode('class-1', {
          pricing_mode: ClassPricingMode.one_time,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      mockPrisma.class.findUnique.mockResolvedValue({
        id: 'class-1',
        pricingMode: ClassPricingMode.one_time,
      });
      await expect(
        service.updateClassPricingMode('class-1', {
          pricing_mode: ClassPricingMode.per_session,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
