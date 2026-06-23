jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));

import { AttendanceStatus, StaffRole } from '../../generated/enums';
import { DashboardService } from './dashboard.service';

describe('DashboardService staff training dashboard', () => {
  const prisma = {
    $queryRaw: jest.fn(),
    class: {
      findMany: jest.fn(),
      count: jest.fn(),
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
    customerCareService: {
      findMany: jest.fn(),
    },
    attendance: {
      groupBy: jest.fn(),
    },
    walletTransactionsHistory: {
      groupBy: jest.fn(),
    },
  };
  const dashboardCacheService = {
    wrapJson: jest.fn(
      async <T>(options: { loader: () => Promise<T> }): Promise<T> =>
        options.loader(),
    ),
  };
  const surveyRoundService = {
    getCurrentRound: jest.fn(async () => 6),
  };

  let service: DashboardService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-29T05:30:00.000Z'));
    jest.clearAllMocks();
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.staffInfo.findMany.mockResolvedValue([]);
    prisma.staffInfo.count.mockResolvedValue(0);
    prisma.customerCareService.findMany.mockResolvedValue([]);
    prisma.attendance.groupBy.mockResolvedValue([]);
    prisma.walletTransactionsHistory.groupBy.mockResolvedValue([]);
    surveyRoundService.getCurrentRound.mockResolvedValue(6);
    service = new DashboardService(
      prisma as never,
      dashboardCacheService as never,
      surveyRoundService as never,
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

  it('returns paginated missing-survey class action alerts with meta total', async () => {
    surveyRoundService.getCurrentRound.mockResolvedValue(6);
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        classId: 'class-1',
        name: 'Lớp chưa báo cáo',
        latestReportedRound: 4,
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
        amount: 0,
        due: 'Chưa báo cáo lần 6',
        detail: 'Mới nhất: lần 4',
      }),
    ]);
  });
});

describe('DashboardService CSKH dashboard clarity', () => {
  const prisma = {
    $queryRaw: jest.fn(),
    class: {
      findMany: jest.fn(),
      count: jest.fn(),
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
    customerCareService: {
      findMany: jest.fn(),
    },
    attendance: {
      groupBy: jest.fn(),
    },
    walletTransactionsHistory: {
      groupBy: jest.fn(),
    },
  };
  const dashboardCacheService = {
    wrapJson: jest.fn(
      async <T>(options: { loader: () => Promise<T> }): Promise<T> =>
        options.loader(),
    ),
  };
  const surveyRoundService = {
    getCurrentRound: jest.fn(async () => 6),
  };

  let service: DashboardService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-15T05:30:00.000Z'));
    jest.clearAllMocks();
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.staffInfo.findMany.mockResolvedValue([]);
    prisma.staffInfo.count.mockResolvedValue(0);
    prisma.customerCareService.findMany.mockResolvedValue([]);
    prisma.attendance.groupBy.mockResolvedValue([]);
    prisma.walletTransactionsHistory.groupBy.mockResolvedValue([]);
    surveyRoundService.getCurrentRound.mockResolvedValue(6);
    service = new DashboardService(
      prisma as never,
      dashboardCacheService as never,
      surveyRoundService as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('scopes customer-care learned tuition and wallet topups to the selected month', async () => {
    prisma.customerCareService.findMany.mockResolvedValue([
      {
        student: {
          id: 'student-1',
          status: 'active',
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          dropOutDate: null,
        },
      },
    ]);
    prisma.attendance.groupBy.mockResolvedValue([
      {
        studentId: 'student-1',
        _sum: { tuitionFee: 450000 },
      },
    ]);
    prisma.walletTransactionsHistory.groupBy.mockResolvedValue([
      {
        studentId: 'student-1',
        _sum: { amount: 1200000 },
      },
    ]);

    const dashboard = await service.getStaffDashboard({
      staffId: 'cskh-1',
      staffRoles: [StaffRole.customer_care],
      query: { month: '05', year: '2026' },
    });

    expect(dashboard.customerCare).toMatchObject({
      learnedTuitionTotal: 450000,
      topupTotal: 1200000,
    });
    expect(prisma.attendance.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: {
            in: [AttendanceStatus.present, AttendanceStatus.excused],
          },
          session: {
            date: {
              gte: new Date(Date.UTC(2026, 4, 1)),
              lt: new Date(Date.UTC(2026, 5, 1)),
            },
          },
        }),
      }),
    );
    expect(prisma.walletTransactionsHistory.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: {
            gte: new Date(Date.UTC(2026, 4, 1)),
            lt: new Date(Date.UTC(2026, 5, 1)),
          },
        }),
      }),
    );
  });

  it('includes a self row in assistant sales breakdown when dual-role', async () => {
    prisma.staffInfo.findMany.mockImplementation(
      async (args: {
        where?: {
          id?: { in?: string[] };
          customerCareManagedByStaffId?: string;
        };
      }) => {
        if (args.where?.customerCareManagedByStaffId) {
          return [
            {
              id: 'managed-cskh-1',
              user: { first_name: 'Lan', last_name: 'CSKH' },
            },
          ];
        }

        if (args.where?.id?.in?.includes('assistant-1')) {
          return [
            {
              id: 'assistant-1',
              user: { first_name: 'Minh', last_name: 'Trợ lí' },
            },
          ];
        }

        if (args.where?.id?.in?.includes('managed-cskh-1')) {
          return [
            {
              id: 'managed-cskh-1',
              user: { first_name: 'Lan', last_name: 'CSKH' },
            },
          ];
        }

        return [];
      },
    );
    prisma.customerCareService.findMany.mockResolvedValue([
      {
        staffId: 'managed-cskh-1',
        student: { id: 'student-managed', status: 'active' },
      },
      {
        staffId: 'assistant-1',
        student: { id: 'student-self', status: 'active' },
      },
    ]);
    prisma.$queryRaw.mockImplementation(
      async (query: { strings: string[] }) => {
        const sql = query.strings.join('');

        if (sql.includes('scoped_students')) {
          return [
            {
              activeStudentsCount: 2,
              newStudentsThisMonth: 0,
              droppedStudentsThisMonth: 0,
            },
          ];
        }

        if (sql.includes('"monthlyRevenue"')) {
          return [
            {
              staffId: 'managed-cskh-1',
              monthlyRevenue: 5000000,
            },
            {
              staffId: 'assistant-1',
              monthlyRevenue: 1500000,
            },
          ];
        }

        if (sql.includes('"debtStudentCount"')) {
          return [
            {
              staffId: 'managed-cskh-1',
              debtStudentCount: 1,
              totalDebtAmount: 300000,
            },
            {
              staffId: 'assistant-1',
              debtStudentCount: 0,
              totalDebtAmount: 0,
            },
          ];
        }

        return [];
      },
    );

    const dashboard = await service.getStaffDashboard({
      staffId: 'assistant-1',
      staffRoles: [StaffRole.assistant, StaffRole.customer_care],
      query: { month: '05', year: '2026' },
    });

    expect(dashboard.assistant?.salesCsStaffBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          staffId: 'managed-cskh-1',
          staffName: 'CSKH Lan',
          monthlyRevenue: 5000000,
        }),
        expect.objectContaining({
          staffId: 'assistant-1',
          staffName: '(Tôi)',
          monthlyRevenue: 1500000,
        }),
      ]),
    );
  });
});
