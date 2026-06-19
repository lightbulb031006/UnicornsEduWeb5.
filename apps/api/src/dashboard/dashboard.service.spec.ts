jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));

import { StaffRole } from '../../generated/enums';
import { DashboardService } from './dashboard.service';

describe('DashboardService staff training dashboard', () => {
  const prisma = {
    $queryRaw: jest.fn(),
    class: {
      findMany: jest.fn(),
    },
    makeupScheduleEvent: {
      findMany: jest.fn(),
    },
    studentExamSchedule: {
      findMany: jest.fn(),
    },
  };
  const dashboardCacheService = {
    wrapJson: jest.fn(
      async <T>(options: { loader: () => Promise<T> }): Promise<T> =>
        options.loader(),
    ),
  };

  let service: DashboardService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-29T05:30:00.000Z'));
    jest.clearAllMocks();
    prisma.$queryRaw.mockResolvedValue([]);
    service = new DashboardService(
      prisma as never,
      dashboardCacheService as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns training metrics only for staff with training role', async () => {
    prisma.class.findMany.mockResolvedValue([
      {
        id: 'class-1',
        schedule: [
          { dayOfWeek: 5, from: '10:00:00', to: '11:00:00' },
          { dayOfWeek: 2, from: '10:00:00', to: '11:00:00' },
        ],
      },
      {
        id: 'class-2',
        schedule: [{ dayOfWeek: 5, from: '14:00:00', end: '15:00:00' }],
      },
      {
        id: 'class-3',
        schedule: [{ dayOfWeek: 5, to: '17:00:00' }],
      },
    ]);
    prisma.makeupScheduleEvent.findMany.mockResolvedValue([
      { id: 'makeup-1', classId: 'class-3' },
    ]);
    prisma.studentExamSchedule.findMany.mockResolvedValue([
      {
        id: 'exam-1',
        student: {
          studentClasses: [{ classId: 'class-2' }, { classId: 'class-4' }],
        },
      },
    ]);

    const dashboard = await service.getStaffDashboard({
      staffId: 'training-1',
      staffRoles: [StaffRole.training],
      query: {},
    });

    expect(dashboard.training).toEqual({
      todayClassCount: 4,
      todayEventCount: 4,
      runningClassCount: 3,
      fixedScheduleSlotCount: 3,
    });

    const withoutTraining = await service.getStaffDashboard({
      staffId: 'teacher-1',
      staffRoles: [],
      query: {},
    });

    expect(withoutTraining.training).toBeUndefined();
  });

  it('returns expense dashboard only for staff with accountant_expense role', async () => {
    const dashboard = await service.getStaffDashboard({
      staffId: 'expense-accountant-1',
      staffRoles: [StaffRole.accountant_expense],
      query: { month: '05', year: '2026' },
    });

    expect(dashboard.accountant).toBeUndefined();
    expect(dashboard.accountantExpense).toMatchObject({
      period: {
        month: '05',
        year: '2026',
        viewMode: 'month',
      },
      summary: {
        totalIncurred: 0,
        totalPaid: 0,
        totalPending: 0,
        pendingStaffCount: 0,
        pendingStaffTotal: 0,
      },
      pendingStaff: [],
      pendingOperatingCosts: {
        totalAmount: 0,
        totalCount: 0,
        items: [],
      },
    });
    expect(dashboard.accountantExpense?.breakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'teacherCost', amount: 0 }),
        expect.objectContaining({ key: 'assistantCost', amount: 0 }),
        expect.objectContaining({ key: 'operatingCost', amount: 0 }),
      ]),
    );
  });

  it('returns paginated expiring action alerts with meta total', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        studentId: 'student-1',
        studentName: 'An',
        classNames: 'Lớp A',
        ownerName: 'CSKH 1',
        accountBalance: 100000,
        referenceTuition: 100000,
        remainingSessions: 1,
        debtAmount: 0,
        totalCount: 3,
        totalAmount: 300000,
      },
    ]);

    const result = await service.getAdminActionAlerts({
      group: 'expiring',
      month: '05',
      year: '2026',
      page: 1,
      limit: 20,
    });

    expect(result.meta).toEqual({ total: 3, page: 1, limit: 20 });
    expect(result.data).toEqual([
      expect.objectContaining({
        type: 'Sắp hết tiền',
        targetType: 'student',
        targetId: 'student-1',
        subject: 'An · Lớp A',
      }),
    ]);
  });

  it('returns paginated class action alerts with meta total', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        classId: 'class-1',
        name: 'Lớp cảnh báo',
        students: 5,
        revenue: 1000000,
        profit: 500000,
        balanceRisk: 200000,
        totalCount: 2,
      },
    ]);

    const result = await service.getAdminActionAlerts({
      group: 'class',
      month: '05',
      year: '2026',
      page: 2,
      limit: 10,
    });

    expect(result.meta).toEqual({ total: 2, page: 2, limit: 10 });
    expect(result.data).toEqual([
      expect.objectContaining({
        type: 'Lớp cảnh báo',
        targetType: 'class',
        targetId: 'class-1',
        amount: 200000,
      }),
    ]);
  });
});
