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
        scheduleEntries: [
          { dayOfWeek: 5, from: '10:00:00', to: '11:00:00' },
          { dayOfWeek: 2, from: '10:00:00', to: '11:00:00' },
        ],
      },
      {
        id: 'class-2',
        scheduleEntries: [{ dayOfWeek: 5, from: '14:00:00', to: '15:00:00' }],
      },
      {
        id: 'class-3',
        scheduleEntries: [{ dayOfWeek: 5, from: '', to: '17:00:00' }],
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
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        classId: 'class-1',
        name: 'Lớp chưa báo cáo',
        surveyId: 'survey-1',
        surveyName: 'Kiểm tra định kỳ lần 8',
        startDate: new Date('2026-08-17T00:00:00.000Z'),
        endDate: new Date('2026-08-24T00:00:00.000Z'),
        teacherNames: 'Thầy Tuấn',
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
        owner: 'Gia sư: Thầy Tuấn',
        amount: 0,
        due: 'Kiểm tra định kỳ lần 8',
        detail: 'Chưa báo cáo: Kiểm tra định kỳ lần 8',
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

describe('DashboardService financial export', () => {
  const prisma = {
    $queryRaw: jest.fn(),
    costExtend: {
      findMany: jest.fn(),
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
    jest.useFakeTimers().setSystemTime(new Date('2026-08-03T05:30:00.000Z'));
    jest.clearAllMocks();
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.costExtend.findMany.mockResolvedValue([]);
    service = new DashboardService(
      prisma as never,
      dashboardCacheService as never,
      surveyRoundService as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function mockFinancialExportQueries(options?: {
    revenueRows?: Array<{
      studentId: string;
      studentName: string;
      className: string;
      totalAmount: number;
      attendanceCount: number;
    }>;
    staffRows?: Array<{
      staffId: string;
      staffName: string;
      sessionAmount: number;
      bonusAmount: number;
      customerCareAmount: number;
      lessonAmount: number;
      extraAllowanceAmount: number;
      fixedSalaryAmount: number;
      assistantAmount: number;
      trainingManagerAmount: number;
      totalCost: number;
    }>;
    topupTotal?: number;
    revenueTotal?: number;
    personnelCost?: number;
    otherCost?: number;
  }) {
    const revenueRows = options?.revenueRows ?? [
      {
        studentId: 'st-1',
        studentName: 'Nguyen Van A',
        className: 'VIP-01',
        totalAmount: 1_200_000,
        attendanceCount: 4,
      },
    ];
    const staffRows = options?.staffRows ?? [
      {
        staffId: 'staff-1',
        staffName: 'Gia su B',
        sessionAmount: 400_000,
        bonusAmount: 0,
        customerCareAmount: 0,
        lessonAmount: 0,
        extraAllowanceAmount: 0,
        fixedSalaryAmount: 0,
        assistantAmount: 0,
        trainingManagerAmount: 0,
        totalCost: 400_000,
      },
    ];
    const topupTotal = options?.topupTotal ?? 2_000_000;
    const revenueTotal = options?.revenueTotal ?? 1_200_000;
    const personnelCost = options?.personnelCost ?? 400_000;
    const otherCost = options?.otherCost ?? 100_000;

    prisma.$queryRaw.mockImplementation(
      async (query: { strings: string[] }) => {
        const sql = query.strings.join('');

        if (sql.includes("wallet_transactions_history.type::text = 'topup'")) {
          return [{ totalAmount: topupTotal }];
        }

        if (sql.includes('STRING_AGG(DISTINCT classes.name')) {
          return revenueRows;
        }

        if (sql.includes('active_staff AS')) {
          return staffRows;
        }

        if (sql.includes('generate_series') || sql.includes('month_series')) {
          return [
            {
              monthStart: new Date('2026-08-01T00:00:00.000Z'),
              revenue: revenueTotal,
              teacherCost: personnelCost,
              customerCareCost: 0,
              lessonCost: 0,
              bonusCost: 0,
              extraAllowanceCost: 0,
              fixedSalaryCost: 0,
              assistantCost: 0,
              trainingManagerCost: 0,
              operatingCost: otherCost,
            },
          ];
        }

        if (sql.includes('range_revenue')) {
          return [
            {
              revenue: revenueTotal,
              teacherCost: personnelCost,
              customerCareCost: 0,
              lessonCost: 0,
              bonusCost: 0,
              extraAllowanceCost: 0,
              fixedSalaryCost: 0,
              assistantCost: 0,
              trainingManagerCost: 0,
              operatingCost: otherCost,
            },
          ];
        }

        return [];
      },
    );

    prisma.costExtend.findMany.mockResolvedValue([
      {
        id: 'cost-1',
        description: 'Thue van phong',
        category: 'van-hanh',
        amount: otherCost,
        date: new Date('2026-08-02T00:00:00.000Z'),
        month: '2026-08',
      },
    ]);
  }

  it('returns per-student revenue items for month mode', async () => {
    mockFinancialExportQueries();

    const result = await service.getAdminFinancialExport({
      month: '08',
      year: '2026',
    });

    expect(result.period).toEqual(
      expect.objectContaining({
        month: '08',
        year: '2026',
        viewMode: 'month',
      }),
    );
    expect(result.summary).toEqual(
      expect.objectContaining({
        topup: 2_000_000,
        revenue: 1_200_000,
        personnelCost: 400_000,
        otherCost: 100_000,
        profit: 700_000,
        totalIn: 1_500_000,
      }),
    );
    expect(result.revenueItems).toEqual([
      {
        studentId: 'st-1',
        studentName: 'Nguyen Van A',
        className: 'VIP-01',
        amount: 1_200_000,
        attendanceCount: 4,
      },
    ]);
    expect(result.personnelItems[0]).toEqual(
      expect.objectContaining({
        staffId: 'staff-1',
        staffName: 'Gia su B',
        amount: 400_000,
      }),
    );
    expect(result.otherCostItems).toEqual([
      expect.objectContaining({
        id: 'cost-1',
        label: 'Thue van phong',
        amount: 100_000,
      }),
    ]);
    expect(result.meta.revenueTruncated).toBe(false);
  });

  it('includes closed-month fixed salary in personnel cost totals', async () => {
    mockFinancialExportQueries({
      personnelCost: 400_000,
    });
    prisma.$queryRaw.mockImplementation(
      async (query: { strings: string[] }) => {
        const sql = query.strings.join('');
        if (sql.includes("wallet_transactions_history.type::text = 'topup'")) {
          return [{ totalAmount: 2_000_000 }];
        }
        if (sql.includes('STRING_AGG(DISTINCT classes.name')) {
          return [
            {
              studentId: 'st-1',
              studentName: 'Nguyen Van A',
              className: 'VIP-01',
              totalAmount: 1_200_000,
              attendanceCount: 4,
            },
          ];
        }
        if (sql.includes('active_staff AS')) {
          return [
            {
              staffId: 'staff-1',
              staffName: 'Gia su B',
              sessionAmount: 400_000,
              bonusAmount: 0,
              customerCareAmount: 0,
              lessonAmount: 0,
              extraAllowanceAmount: 0,
              fixedSalaryAmount: 150_000,
              assistantAmount: 0,
              trainingManagerAmount: 0,
              totalCost: 550_000,
            },
          ];
        }
        if (sql.includes('generate_series') || sql.includes('month_series')) {
          return [
            {
              monthStart: new Date('2026-08-01T00:00:00.000Z'),
              revenue: 1_200_000,
              teacherCost: 400_000,
              customerCareCost: 0,
              lessonCost: 0,
              bonusCost: 0,
              extraAllowanceCost: 0,
              fixedSalaryCost: 150_000,
              assistantCost: 0,
              trainingManagerCost: 0,
              operatingCost: 100_000,
            },
          ];
        }
        return [];
      },
    );

    const result = await service.getAdminFinancialExport({
      month: '08',
      year: '2026',
    });

    expect(result.summary.personnelCost).toBe(550_000);
    expect(result.summary.profit).toBe(550_000);
    expect(result.personnelItems[0]?.note).toContain('Lương cứng');
  });

  it('returns per-student revenue items for date-range mode', async () => {
    mockFinancialExportQueries({
      revenueRows: [
        {
          studentId: 'st-2',
          studentName: 'Tran Thi C',
          className: 'BASIC-02',
          totalAmount: 900_000,
          attendanceCount: 3,
        },
      ],
      revenueTotal: 900_000,
      personnelCost: 200_000,
      otherCost: 50_000,
      topupTotal: 1_000_000,
    });

    const result = await service.getAdminFinancialExport({
      dateFrom: '2026-01-01',
      dateTo: '2026-08-03',
    });

    expect(result.period).toEqual(
      expect.objectContaining({
        viewMode: 'range',
        dateFrom: '2026-01-01',
        dateTo: '2026-08-03',
      }),
    );
    expect(result.revenueItems).toEqual([
      {
        studentId: 'st-2',
        studentName: 'Tran Thi C',
        className: 'BASIC-02',
        amount: 900_000,
        attendanceCount: 3,
      },
    ]);
    expect(result.summary.revenue).toBe(900_000);
    expect(result.summary.profit).toBe(650_000);
    expect(result.summary.totalIn).toBe(750_000);
  });

  it('marks revenueTruncated when more student rows than limit', async () => {
    mockFinancialExportQueries({
      revenueRows: [
        {
          studentId: 'st-1',
          studentName: 'A',
          className: 'C1',
          totalAmount: 100,
          attendanceCount: 1,
        },
        {
          studentId: 'st-2',
          studentName: 'B',
          className: 'C2',
          totalAmount: 90,
          attendanceCount: 1,
        },
      ],
    });

    const result = await service.getAdminFinancialExport({
      month: '08',
      year: '2026',
      limit: 1,
    });

    expect(result.revenueItems).toHaveLength(1);
    expect(result.meta.revenueItemCount).toBe(1);
    expect(result.meta.revenueTruncated).toBe(true);
  });
});
