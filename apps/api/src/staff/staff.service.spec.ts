jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));
jest.mock('../../generated/client', () => ({
  Prisma: {
    sql: () => ({}),
    join: () => ({}),
  },
}));
jest.mock('src/storage/supabase-storage', () => ({
  createSignedStorageUrl: jest.fn(async (options: { path?: string | null }) =>
    options.path ? `signed:${options.path}` : null,
  ),
  getSupabaseAdminClient: jest.fn(),
  validateImageFile: jest.fn(),
}));

import { BadRequestException } from '@nestjs/common';
import {
  PaymentStatus,
  StaffRole,
  StaffStatus,
  UserRole,
} from '../../generated/enums';
import { createSignedStorageUrl } from 'src/storage/supabase-storage';
import { StaffService } from './staff.service';

const mockCreateSignedStorageUrl =
  createSignedStorageUrl as jest.MockedFunction<typeof createSignedStorageUrl>;

type StaffServiceTestAccess = {
  getTeacherAllowanceSourceRowsByStatusAndTaxBucket: (
    ...args: unknown[]
  ) => Promise<unknown[]>;
  getTeacherAllowanceRowsByClassStatusAndTaxBucket: (
    ...args: unknown[]
  ) => Promise<unknown[]>;
  getDepositSessionRows: (...args: unknown[]) => Promise<unknown[]>;
  getUnpaidTotalsByStaffIds: (
    staffIds: string[],
    recentWindow?: unknown,
  ) => Promise<Map<string, number>>;
  getTeacherSnapshotPaymentPreviewRows: (
    db: unknown,
    params: { start?: Date; end?: Date },
  ) => Promise<unknown[]>;
};

describe('StaffService', () => {
  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    staffInfo: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    class: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    makeupScheduleEvent: {
      updateMany: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    customerCareService: {
      deleteMany: jest.fn(),
    },
    classTeacher: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    session: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    attendance: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    lessonOutput: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    bonus: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    extraAllowance: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    roleTaxDeductionRate: {
      findFirst: jest.fn(),
    },
    staffTaxDeductionOverride: {
      findFirst: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };

  const actionHistoryService = {
    recordCreate: jest.fn(),
    recordUpdate: jest.fn(),
    recordDelete: jest.fn(),
  };
  const authIdentityCacheService = {
    invalidateUser: jest.fn(),
  };
  const googleCalendarService = {
    generateTutorMeetLink: jest.fn(),
    deleteCalendarEvent: jest.fn(),
  };

  let service: StaffService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateSignedStorageUrl.mockImplementation(
      async (options: { path?: string | null }) =>
        options.path ? `signed:${options.path}` : null,
    );
    mockPrisma.extraAllowance.findMany.mockResolvedValue([]);
    mockPrisma.bonus.findMany.mockResolvedValue([]);
    mockPrisma.session.findMany.mockResolvedValue([]);
    mockPrisma.session.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.attendance.findMany.mockResolvedValue([]);
    mockPrisma.attendance.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.lessonOutput.findMany.mockResolvedValue([]);
    mockPrisma.lessonOutput.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.bonus.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.extraAllowance.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.roleTaxDeductionRate.findFirst.mockResolvedValue(null);
    mockPrisma.staffTaxDeductionOverride.findFirst.mockResolvedValue(null);
    mockPrisma.classTeacher.findMany.mockResolvedValue([]);
    mockPrisma.classTeacher.findUnique.mockResolvedValue(null);
    mockPrisma.classTeacher.update.mockResolvedValue({});
    mockPrisma.classTeacher.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.class.findMany.mockResolvedValue([]);
    mockPrisma.class.update.mockResolvedValue({});
    mockPrisma.makeupScheduleEvent.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.makeupScheduleEvent.findMany.mockResolvedValue([]);
    mockPrisma.makeupScheduleEvent.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.customerCareService.deleteMany.mockResolvedValue({ count: 0 });
    googleCalendarService.generateTutorMeetLink.mockResolvedValue(
      'https://meet.google.com/fixed-staff-link',
    );
    googleCalendarService.deleteCalendarEvent.mockResolvedValue(undefined);
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockPrisma.$transaction.mockImplementation(
      (callback: (db: typeof mockPrisma) => unknown) => callback(mockPrisma),
    );
    service = new StaffService(
      mockPrisma as never,
      actionHistoryService as never,
      googleCalendarService as never,
      authIdentityCacheService as never,
    );
  });

  function mockEmptyTeacherIncome() {
    jest
      .spyOn(
        service as any,
        'getTeacherAllowanceSourceRowsByStatusAndTaxBucket',
      )
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    jest
      .spyOn(service as any, 'getTeacherAllowanceRowsByClassStatusAndTaxBucket')
      .mockResolvedValue([]);
    jest.spyOn(service as any, 'getDepositSessionRows').mockResolvedValue([]);
  }

  function mockOtherRoleUnpaidByRole(entries: Array<[StaffRole, number]>) {
    jest
      .spyOn(service as any, 'computeOtherRoleUnpaidNetByRole')
      .mockResolvedValue(new Map(entries));
  }

  it('records action history after creating a staff profile', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      roleType: UserRole.guest,
      staffInfo: null,
    });
    mockPrisma.staffInfo.create.mockResolvedValue({
      id: 'staff-1',
      fullName: 'Teacher A',
      birthDate: new Date('2000-01-01T00:00:00.000Z'),
      university: 'HCMUS',
      highSchool: 'LHP',
      specialization: 'Math',
      bankAccount: '123',
      bankQrLink: 'qr',
      roles: [StaffRole.teacher],
      userId: 'user-1',
      status: 'active',
      createdAt: new Date('2026-03-20T10:00:00.000Z'),
      updatedAt: new Date('2026-03-20T10:00:00.000Z'),
    });
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
      fullName: 'Teacher A',
      birthDate: new Date('2000-01-01T00:00:00.000Z'),
      university: 'HCMUS',
      highSchool: 'LHP',
      specialization: 'Math',
      bankAccount: '123',
      bankQrLink: 'qr',
      roles: [StaffRole.teacher],
      userId: 'user-1',
      status: 'active',
      createdAt: new Date('2026-03-20T10:00:00.000Z'),
      updatedAt: new Date('2026-03-20T10:00:00.000Z'),
      user: {
        id: 'user-1',
        email: 'teacher@example.com',
        accountHandle: 'teacher',
        phone: null,
        first_name: 'Teacher',
        last_name: 'A',
        province: 'Hanoi',
        roleType: UserRole.staff,
        status: 'active',
        emailVerified: true,
        phoneVerified: false,
        linkId: null,
      },
      classTeachers: [],
    });

    await service.createStaff(
      {
        full_name: 'Teacher A',
        cccd_number: '012345678901',
        birth_date: '2000-01-01',
        university: 'HCMUS',
        high_school: 'LHP',
        specialization: 'Math',
        bank_account: '123',
        bank_qr_link: 'qr',
        roles: [StaffRole.teacher],
        user_id: 'user-1',
      },
      {
        userId: 'admin-1',
        userEmail: 'admin@example.com',
        roleType: 'admin',
      },
    );

    expect(actionHistoryService.recordCreate).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({
        entityType: 'staff',
        entityId: 'staff-1',
      }),
    );
    expect(authIdentityCacheService.invalidateUser).toHaveBeenCalledWith(
      'user-1',
    );
  });

  it('returns only active customer-care staff options', async () => {
    mockPrisma.staffInfo.findMany.mockResolvedValue([]);

    await service.searchCustomerCareStaff({ limit: 10 });

    expect(mockPrisma.staffInfo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          roles: {
            hasSome: [StaffRole.customer_care],
          },
          status: StaffStatus.active,
        }),
      }),
    );
  });

  it('returns only active general staff options', async () => {
    mockPrisma.staffInfo.findMany.mockResolvedValue([]);

    await service.searchStaffOptions({ limit: 10 });

    expect(mockPrisma.staffInfo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: StaffStatus.active,
        }),
      }),
    );
  });

  it('updates staff status and invalidates linked auth cache', async () => {
    jest
      .spyOn(service as any, 'getStaffAuditSnapshot')
      .mockResolvedValueOnce({
        id: 'staff-1',
        userId: 'user-1',
        status: StaffStatus.active,
      })
      .mockResolvedValueOnce({
        id: 'staff-1',
        userId: 'user-1',
        status: StaffStatus.inactive,
      });
    jest.spyOn(service, 'getStaffById').mockResolvedValue({
      id: 'staff-1',
      status: StaffStatus.inactive,
    } as never);
    mockPrisma.staffInfo.update.mockResolvedValue({
      id: 'staff-1',
      status: StaffStatus.inactive,
    });

    await expect(
      service.updateStaffStatus('staff-1', { status: StaffStatus.inactive }),
    ).resolves.toMatchObject({
      id: 'staff-1',
      status: StaffStatus.inactive,
    });

    expect(mockPrisma.staffInfo.update).toHaveBeenCalledWith({
      where: { id: 'staff-1' },
      data: { status: StaffStatus.inactive },
    });
    expect(authIdentityCacheService.invalidateUser).toHaveBeenCalledWith(
      'user-1',
    );
  });

  it('deactivates active operational assignments when staff stops working', async () => {
    jest
      .spyOn(service as any, 'getStaffAuditSnapshot')
      .mockResolvedValueOnce({
        id: 'staff-1',
        userId: 'user-1',
        status: StaffStatus.active,
      })
      .mockResolvedValueOnce({
        id: 'staff-1',
        userId: 'user-1',
        status: StaffStatus.inactive,
      });
    jest.spyOn(service, 'getStaffById').mockResolvedValue({
      id: 'staff-1',
      status: StaffStatus.inactive,
    } as never);
    mockPrisma.class.findMany.mockResolvedValue([
      {
        id: 'class-1',
        schedule: [
          {
            id: 'slot-1',
            teacherId: 'staff-1',
            googleCalendarEventId: 'calendar-1',
          },
          { id: 'slot-2', teacherId: 'staff-2' },
        ],
      },
    ]);
    mockPrisma.makeupScheduleEvent.findMany.mockResolvedValue([
      { id: 'makeup-1', googleCalendarEventId: 'makeup-calendar-1' },
    ]);

    await service.updateStaffStatus(
      'staff-1',
      { status: StaffStatus.inactive, reason: 'Nghỉ việc' },
      { userId: 'assistant-1', roleType: UserRole.staff },
    );

    expect(mockPrisma.class.update).toHaveBeenCalledWith({
      where: { id: 'class-1' },
      data: {
        schedule: [
          expect.objectContaining({
            id: 'slot-1',
            teacherId: 'staff-1',
            deletedAt: expect.any(String),
          }),
          expect.objectContaining({
            id: 'slot-2',
            teacherId: 'staff-2',
          }),
        ],
      },
    });
    expect(mockPrisma.classTeacher.updateMany).toHaveBeenCalledWith({
      where: {
        teacherId: 'staff-1',
        OR: [{ status: null }, { status: 'active' }],
      },
      data: { status: 'inactive' },
    });
    expect(mockPrisma.customerCareService.deleteMany).toHaveBeenCalledWith({
      where: { staffId: 'staff-1' },
    });
    expect(mockPrisma.makeupScheduleEvent.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['makeup-1'] } },
    });
    expect(actionHistoryService.recordUpdate).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({
        description: 'Chuyển nhân sự sang ngừng hoạt động - Lý do: Nghỉ việc',
      }),
    );
    expect(googleCalendarService.deleteCalendarEvent).toHaveBeenCalledWith(
      'calendar-1',
    );
    expect(googleCalendarService.deleteCalendarEvent).toHaveBeenCalledWith(
      'makeup-calendar-1',
    );
  });

  it('promotes the new linked user and invalidates old and new staff auth cache on relink', async () => {
    const existingStaff = {
      id: 'staff-1',
      userId: 'old-user',
      roles: [StaffRole.teacher],
      status: 'active',
      user: {
        id: 'old-user',
        email: 'old@example.com',
        phone: null,
        first_name: 'Old',
        last_name: 'Staff',
        accountHandle: 'old-staff',
        province: null,
        roleType: UserRole.staff,
        status: 'active',
        emailVerified: true,
        phoneVerified: false,
        linkId: null,
        createdAt: new Date('2026-03-20T10:00:00.000Z'),
        updatedAt: new Date('2026-03-20T10:00:00.000Z'),
      },
      classTeachers: [],
    };
    const updatedStaff = {
      id: 'staff-1',
      userId: 'new-user',
      roles: [StaffRole.teacher],
      status: 'active',
      user: {
        id: 'new-user',
        email: 'new@example.com',
        accountHandle: 'new-staff',
        phone: null,
        first_name: 'New',
        last_name: 'Staff',
        province: null,
      },
      classTeachers: [],
      monthlyStats: [],
      customerCareManagedBy: null,
    };

    mockPrisma.staffInfo.findUnique
      .mockResolvedValueOnce(existingStaff)
      .mockResolvedValueOnce(updatedStaff);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'new-user',
      roleType: UserRole.guest,
      staffInfo: null,
    });
    mockPrisma.staffInfo.update.mockResolvedValue({ id: 'staff-1' });

    await service.updateStaff({
      id: 'staff-1',
      user_id: 'new-user',
    });

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'new-user' },
      data: { roleType: UserRole.staff },
    });
    expect(authIdentityCacheService.invalidateUser).toHaveBeenCalledWith(
      'old-user',
    );
    expect(authIdentityCacheService.invalidateUser).toHaveBeenCalledWith(
      'new-user',
    );
  });

  it('returns friendly error when cccd number is duplicated', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      roleType: UserRole.guest,
      staffInfo: null,
    });
    mockPrisma.$transaction.mockRejectedValueOnce({
      code: 'P2002',
      meta: { target: ['staff_info_cccd_number_key'] },
    });

    await expect(
      service.createStaff({
        full_name: 'Teacher B',
        cccd_number: '012345678901',
        roles: [StaffRole.teacher],
        user_id: 'user-1',
      }),
    ).rejects.toThrow(
      new BadRequestException('Số CCCD đã tồn tại trong hệ thống.'),
    );
  });

  it('regenerates a fixed Meet link and backfills schedules owned by the staff member', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
      user: {
        first_name: 'Tutor',
        last_name: 'One',
        email: 'tutor@example.com',
      },
    });
    mockPrisma.staffInfo.update.mockResolvedValue({
      id: 'staff-1',
      googleMeetLink: 'https://meet.google.com/fixed-staff-link',
    });
    mockPrisma.class.findMany.mockResolvedValue([
      {
        id: 'class-1',
        schedule: [
          {
            id: 'slot-1',
            dayOfWeek: 1,
            from: '19:00:00',
            to: '20:30:00',
            teacherId: 'staff-1',
            meetLink: 'https://meet.google.com/old-slot-link',
          },
          {
            id: 'slot-2',
            dayOfWeek: 2,
            from: '19:00:00',
            to: '20:30:00',
            teacherId: 'staff-2',
            meetLink: 'https://meet.google.com/other-teacher-link',
          },
        ],
        teachers: [{ teacherId: 'staff-1' }, { teacherId: 'staff-2' }],
      },
    ]);

    await expect(service.regenerateMeetLink('staff-1')).resolves.toEqual({
      googleMeetLink: 'https://meet.google.com/fixed-staff-link',
    });

    expect(mockPrisma.staffInfo.update).toHaveBeenCalledWith({
      where: { id: 'staff-1' },
      data: { googleMeetLink: 'https://meet.google.com/fixed-staff-link' },
    });
    expect(mockPrisma.class.update).toHaveBeenCalledWith({
      where: { id: 'class-1' },
      data: {
        schedule: [
          {
            id: 'slot-1',
            dayOfWeek: 1,
            from: '19:00:00',
            to: '20:30:00',
            teacherId: 'staff-1',
            meetLink: 'https://meet.google.com/fixed-staff-link',
          },
          {
            id: 'slot-2',
            dayOfWeek: 2,
            from: '19:00:00',
            to: '20:30:00',
            teacherId: 'staff-2',
            meetLink: 'https://meet.google.com/other-teacher-link',
          },
        ],
      },
    });
    expect(mockPrisma.makeupScheduleEvent.updateMany).toHaveBeenCalledWith({
      where: { teacherId: 'staff-1' },
      data: { googleMeetLink: 'https://meet.google.com/fixed-staff-link' },
    });
  });

  it('keeps bonuses separate from customer care and lesson output role summaries', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.customer_care, StaffRole.lesson_plan],
      classTeachers: [],
    });
    mockEmptyTeacherIncome();
    mockPrisma.bonus.findMany
      .mockResolvedValueOnce([
        {
          workType: 'CSKH',
          amount: 5000,
          status: PaymentStatus.pending,
        },
        {
          workType: 'Giáo án',
          amount: 10000,
          status: PaymentStatus.paid,
        },
      ])
      .mockResolvedValueOnce([
        {
          amount: 5000,
        },
        {
          amount: 10000,
        },
      ]);
    jest
      .spyOn(service as any, 'getCustomerCareCommissionRowsByStatus')
      .mockResolvedValueOnce([
        {
          paymentStatus: PaymentStatus.paid,
          grossAmount: 30000,
          taxRatePercent: 0,
          operatingAmount: 0,
        },
        {
          paymentStatus: PaymentStatus.pending,
          grossAmount: 12000,
          taxRatePercent: 0,
          operatingAmount: 0,
        },
      ])
      .mockResolvedValueOnce([
        {
          paymentStatus: PaymentStatus.paid,
          grossAmount: 30000,
          taxRatePercent: 0,
          operatingAmount: 0,
        },
        {
          paymentStatus: PaymentStatus.pending,
          grossAmount: 12000,
          taxRatePercent: 0,
          operatingAmount: 0,
        },
      ]);
    jest
      .spyOn(service as any, 'getLessonOutputRowsByPaymentStatus')
      .mockResolvedValueOnce([
        {
          paymentStatus: PaymentStatus.paid,
          grossAmount: 80000,
          taxRatePercent: 0,
          operatingAmount: 0,
        },
        {
          paymentStatus: PaymentStatus.pending,
          grossAmount: 20000,
          taxRatePercent: 0,
          operatingAmount: 0,
        },
      ])
      .mockResolvedValueOnce([
        {
          paymentStatus: PaymentStatus.paid,
          grossAmount: 80000,
          taxRatePercent: 0,
          operatingAmount: 0,
        },
        {
          paymentStatus: PaymentStatus.pending,
          grossAmount: 20000,
          taxRatePercent: 0,
          operatingAmount: 0,
        },
      ]);

    mockOtherRoleUnpaidByRole([
      [StaffRole.customer_care, 12000],
      [StaffRole.lesson_plan, 20000],
    ]);

    const result = await service.getIncomeSummary('staff-1', {
      month: '03',
      year: '2026',
      days: 14,
    });

    expect(result.monthlyIncomeTotals).toEqual({
      total: 157000,
      paid: 120000,
      unpaid: 37000,
    });
    expect(result.yearIncomeTotal).toBe(157000);
    expect(result.otherRoleSummaries).toEqual([
      {
        role: StaffRole.customer_care,
        label: 'CSKH',
        total: 42000,
        paid: 30000,
        unpaid: 12000,
      },
      {
        role: StaffRole.lesson_plan,
        label: 'Giáo án',
        total: 100000,
        paid: 80000,
        unpaid: 20000,
      },
    ]);
  });

  it('aggregates extra allowances for assistant and communication into other-role summaries', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.assistant, StaffRole.communication],
      classTeachers: [],
    });
    mockEmptyTeacherIncome();
    mockPrisma.bonus.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockPrisma.extraAllowance.findMany
      .mockResolvedValueOnce([
        {
          roleType: StaffRole.assistant,
          status: PaymentStatus.paid,
          amount: 25000,
          taxDeductionRatePercent: 0,
        },
        {
          roleType: StaffRole.assistant,
          status: PaymentStatus.pending,
          amount: 10000,
          taxDeductionRatePercent: 0,
        },
        {
          roleType: StaffRole.communication,
          status: PaymentStatus.pending,
          amount: 15000,
          taxDeductionRatePercent: 0,
        },
      ])
      .mockResolvedValueOnce([
        {
          roleType: StaffRole.assistant,
          status: PaymentStatus.paid,
          amount: 25000,
          taxDeductionRatePercent: 0,
        },
        {
          roleType: StaffRole.assistant,
          status: PaymentStatus.pending,
          amount: 10000,
          taxDeductionRatePercent: 0,
        },
        {
          roleType: StaffRole.communication,
          status: PaymentStatus.pending,
          amount: 15000,
          taxDeductionRatePercent: 0,
        },
        {
          roleType: StaffRole.communication,
          status: PaymentStatus.paid,
          amount: 5000,
          taxDeductionRatePercent: 0,
        },
      ]);
    jest
      .spyOn(service as any, 'getAssistantTuitionShareRowsByStatus')
      .mockResolvedValueOnce([
        {
          paymentStatus: PaymentStatus.paid,
          grossAmount: 6000,
          taxRatePercent: 0,
          operatingAmount: 0,
        },
        {
          paymentStatus: PaymentStatus.pending,
          grossAmount: 3000,
          taxRatePercent: 0,
          operatingAmount: 0,
        },
      ])
      .mockResolvedValueOnce([
        {
          paymentStatus: PaymentStatus.paid,
          grossAmount: 6000,
          taxRatePercent: 0,
          operatingAmount: 0,
        },
        {
          paymentStatus: PaymentStatus.pending,
          grossAmount: 3000,
          taxRatePercent: 0,
          operatingAmount: 0,
        },
      ]);

    mockOtherRoleUnpaidByRole([
      [StaffRole.assistant, 13000],
      [StaffRole.communication, 15000],
    ]);

    const result = await service.getIncomeSummary('staff-1', {
      month: '03',
      year: '2026',
      days: 14,
    });

    expect(result.monthlyIncomeTotals).toEqual({
      total: 59000,
      paid: 31000,
      unpaid: 28000,
    });
    expect(result.yearIncomeTotal).toBe(64000);
    expect(result.otherRoleSummaries).toEqual([
      {
        role: StaffRole.assistant,
        label: 'Trợ lí',
        total: 44000,
        paid: 31000,
        unpaid: 13000,
      },
      {
        role: StaffRole.communication,
        label: 'Truyền thông',
        total: 15000,
        paid: 0,
        unpaid: 15000,
      },
    ]);
  });

  it('uses extra allowances instead of bonus work type for communication role summaries', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.communication],
      classTeachers: [],
    });
    mockEmptyTeacherIncome();
    mockPrisma.bonus.findMany
      .mockResolvedValueOnce([
        {
          workType: 'Truyền thông',
          amount: 7000,
          status: PaymentStatus.pending,
        },
      ])
      .mockResolvedValueOnce([
        {
          amount: 7000,
        },
      ]);
    mockPrisma.extraAllowance.findMany
      .mockResolvedValueOnce([
        {
          roleType: StaffRole.communication,
          status: PaymentStatus.paid,
          amount: 5000,
          taxDeductionRatePercent: 0,
        },
        {
          roleType: StaffRole.communication,
          status: PaymentStatus.pending,
          amount: 15000,
          taxDeductionRatePercent: 0,
        },
      ])
      .mockResolvedValueOnce([
        {
          roleType: StaffRole.communication,
          status: PaymentStatus.paid,
          amount: 5000,
          taxDeductionRatePercent: 0,
        },
        {
          roleType: StaffRole.communication,
          status: PaymentStatus.pending,
          amount: 15000,
          taxDeductionRatePercent: 0,
        },
      ]);

    mockOtherRoleUnpaidByRole([[StaffRole.communication, 15000]]);

    const result = await service.getIncomeSummary('staff-1', {
      month: '03',
      year: '2026',
      days: 14,
    });

    expect(result.bonusMonthlyTotals).toEqual({
      total: 7000,
      paid: 0,
      unpaid: 7000,
    });
    expect(result.monthlyIncomeTotals).toEqual({
      total: 27000,
      paid: 5000,
      unpaid: 22000,
    });
    expect(result.yearIncomeTotal).toBe(27000);
    expect(result.otherRoleSummaries).toEqual([
      {
        role: StaffRole.communication,
        label: 'Truyền thông',
        total: 20000,
        paid: 5000,
        unpaid: 15000,
      },
    ]);
  });

  it('aggregates extra allowances for accountant into other-role summaries', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.accountant],
      classTeachers: [],
    });
    mockEmptyTeacherIncome();
    mockPrisma.bonus.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockPrisma.extraAllowance.findMany
      .mockResolvedValueOnce([
        {
          roleType: StaffRole.accountant,
          status: PaymentStatus.paid,
          amount: 7000,
          taxDeductionRatePercent: 0,
        },
        {
          roleType: StaffRole.accountant,
          status: PaymentStatus.pending,
          amount: 3000,
          taxDeductionRatePercent: 0,
        },
      ])
      .mockResolvedValueOnce([
        {
          roleType: StaffRole.accountant,
          status: PaymentStatus.paid,
          amount: 7000,
          taxDeductionRatePercent: 0,
        },
        {
          roleType: StaffRole.accountant,
          status: PaymentStatus.pending,
          amount: 3000,
          taxDeductionRatePercent: 0,
        },
        {
          roleType: StaffRole.accountant,
          status: PaymentStatus.paid,
          amount: 2000,
          taxDeductionRatePercent: 0,
        },
      ]);

    mockOtherRoleUnpaidByRole([[StaffRole.accountant, 3000]]);

    const result = await service.getIncomeSummary('staff-1', {
      month: '03',
      year: '2026',
      days: 14,
    });

    expect(result.monthlyIncomeTotals).toEqual({
      total: 10000,
      paid: 7000,
      unpaid: 3000,
    });
    expect(result.yearIncomeTotal).toBe(12000);
    expect(result.otherRoleSummaries).toEqual([
      {
        role: StaffRole.accountant,
        label: 'Kế toán',
        total: 10000,
        paid: 7000,
        unpaid: 3000,
      },
    ]);
  });

  it('calculates tax on aggregated extra-allowance source totals instead of per item', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.accountant],
      classTeachers: [],
    });
    mockEmptyTeacherIncome();
    mockPrisma.bonus.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockPrisma.extraAllowance.findMany
      .mockResolvedValueOnce([
        {
          roleType: StaffRole.accountant,
          status: PaymentStatus.paid,
          amount: 5,
          taxDeductionRatePercent: 10,
        },
        {
          roleType: StaffRole.accountant,
          status: PaymentStatus.paid,
          amount: 5,
          taxDeductionRatePercent: 10,
        },
      ])
      .mockResolvedValueOnce([
        {
          roleType: StaffRole.accountant,
          status: PaymentStatus.paid,
          amount: 5,
          taxDeductionRatePercent: 10,
        },
        {
          roleType: StaffRole.accountant,
          status: PaymentStatus.paid,
          amount: 5,
          taxDeductionRatePercent: 10,
        },
      ]);

    const result = await service.getIncomeSummary('staff-1', {
      month: '03',
      year: '2026',
      days: 14,
    });

    expect(result.monthlyTaxTotals.total).toBe(1);
    expect(result.monthlyIncomeTotals).toEqual({
      total: 9,
      paid: 9,
      unpaid: 0,
    });
    expect(result.otherRoleSummaries).toEqual([
      {
        role: StaffRole.accountant,
        label: 'Kế toán',
        total: 9,
        paid: 9,
        unpaid: 0,
      },
    ]);
  });

  it('aggregates technical allowances as tax-only role without operating deductions and keeps communication on the same extra-allowance flow', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.technical, StaffRole.communication],
      classTeachers: [],
    });
    mockEmptyTeacherIncome();
    mockPrisma.bonus.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockPrisma.extraAllowance.findMany
      .mockResolvedValueOnce([
        {
          roleType: StaffRole.technical,
          status: PaymentStatus.paid,
          amount: 100,
          taxDeductionRatePercent: 10,
        },
        {
          roleType: StaffRole.technical,
          status: PaymentStatus.pending,
          amount: 50,
          taxDeductionRatePercent: 10,
        },
        {
          roleType: StaffRole.communication,
          status: PaymentStatus.pending,
          amount: 100,
          taxDeductionRatePercent: 5,
        },
      ])
      .mockResolvedValueOnce([
        {
          roleType: StaffRole.technical,
          status: PaymentStatus.paid,
          amount: 100,
          taxDeductionRatePercent: 10,
        },
        {
          roleType: StaffRole.technical,
          status: PaymentStatus.pending,
          amount: 50,
          taxDeductionRatePercent: 10,
        },
        {
          roleType: StaffRole.communication,
          status: PaymentStatus.pending,
          amount: 100,
          taxDeductionRatePercent: 5,
        },
        {
          roleType: StaffRole.technical,
          status: PaymentStatus.paid,
          amount: 20,
          taxDeductionRatePercent: 10,
        },
        {
          roleType: StaffRole.communication,
          status: PaymentStatus.paid,
          amount: 20,
          taxDeductionRatePercent: 5,
        },
      ]);

    mockOtherRoleUnpaidByRole([
      [StaffRole.technical, 45],
      [StaffRole.communication, 95],
    ]);

    const result = await service.getIncomeSummary('staff-1', {
      month: '03',
      year: '2026',
      days: 14,
    });

    expect(result.monthlyGrossTotals).toEqual({
      total: 250,
      paid: 100,
      unpaid: 150,
    });
    expect(result.monthlyTaxTotals).toEqual({
      total: 20,
      paid: 10,
      unpaid: 10,
    });
    expect(result.monthlyOperatingDeductionTotals).toEqual({
      total: 0,
      paid: 0,
      unpaid: 0,
    });
    expect(result.monthlyIncomeTotals).toEqual({
      total: 230,
      paid: 90,
      unpaid: 140,
    });
    expect(result.yearIncomeTotal).toBe(267);
    expect(result.otherRoleSummaries).toEqual([
      {
        role: StaffRole.technical,
        label: 'Kỹ thuật',
        total: 135,
        paid: 90,
        unpaid: 45,
      },
      {
        role: StaffRole.communication,
        label: 'Truyền thông',
        total: 95,
        paid: 0,
        unpaid: 95,
      },
    ]);
  });

  it('includes assistant 3% tuition share in income summary for assistant role', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.assistant],
      classTeachers: [],
    });
    mockPrisma.bonus.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockPrisma.extraAllowance.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockEmptyTeacherIncome();
    jest
      .spyOn(service as any, 'getAssistantTuitionShareRowsByStatus')
      .mockResolvedValueOnce([
        {
          paymentStatus: PaymentStatus.paid,
          grossAmount: 9000,
          taxRatePercent: 0,
          operatingAmount: 0,
        },
        {
          paymentStatus: PaymentStatus.pending,
          grossAmount: 6000,
          taxRatePercent: 0,
          operatingAmount: 0,
        },
      ])
      .mockResolvedValueOnce([
        {
          paymentStatus: PaymentStatus.paid,
          grossAmount: 36000,
          taxRatePercent: 0,
          operatingAmount: 0,
        },
        {
          paymentStatus: PaymentStatus.pending,
          grossAmount: 12000,
          taxRatePercent: 0,
          operatingAmount: 0,
        },
      ]);

    mockOtherRoleUnpaidByRole([[StaffRole.assistant, 6000]]);

    const result = await service.getIncomeSummary('staff-1', {
      month: '03',
      year: '2026',
      days: 14,
    });

    expect(result.monthlyIncomeTotals).toEqual({
      total: 15000,
      paid: 9000,
      unpaid: 6000,
    });
    expect(result.yearIncomeTotal).toBe(48000);
    expect(result.otherRoleSummaries).toEqual([
      {
        role: StaffRole.assistant,
        label: 'Trợ lí',
        total: 15000,
        paid: 9000,
        unpaid: 6000,
      },
    ]);
  });

  it('uses full-scope unpaid per role in other-role summaries while keeping monthly total and paid', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.communication],
      classTeachers: [],
    });
    mockEmptyTeacherIncome();
    mockPrisma.bonus.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockPrisma.extraAllowance.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        {
          id: 'allowance-old',
          roleType: StaffRole.communication,
          month: '2026-02',
          amount: 15000,
          status: PaymentStatus.pending,
          note: 'Pending tháng trước',
        },
      ]);
    jest
      .spyOn(service as any, 'getUnpaidTotalsByStaffIds')
      .mockResolvedValue(new Map([['staff-1', 0]]));
    jest
      .spyOn(service as any, 'computeSnapshotUnpaidNetTotal')
      .mockResolvedValue(15000);

    const result = await service.getIncomeSummary('staff-1', {
      month: '03',
      year: '2026',
      days: 14,
    });

    expect(result.otherRoleSummaries).toEqual([
      {
        role: StaffRole.communication,
        label: 'Truyền thông',
        total: 0,
        paid: 0,
        unpaid: 15000,
      },
    ]);
  });

  it('includes all pending bonus months in payment preview regardless of query month', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.communication],
    });
    jest
      .spyOn(service as any, 'loadAllPendingPaymentPreviewDraftRecords')
      .mockResolvedValue([
        {
          id: 'bonus-old',
          role: null,
          sourceType: 'bonus',
          sourceLabel: 'Thưởng',
          label: 'Truyền thông',
          secondaryLabel: '2026-02',
          date: null,
          currentStatus: PaymentStatus.pending,
          grossAmount: 7000,
          operatingAmount: 0,
        },
      ]);

    const result = await service.getPaymentPreview('staff-1', {
      month: '03',
      year: '2026',
    });

    expect(result.summary.itemCount).toBe(1);
    expect(result.sections).toEqual([
      expect.objectContaining({
        role: null,
        label: 'Thưởng',
        itemCount: 1,
        grossTotal: 7000,
      }),
    ]);
  });

  it('keeps teacher summary net-first and includes gross/tax breakdown fields', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.teacher],
      classTeachers: [
        {
          class: {
            id: 'class-1',
            name: 'Toán 10A',
          },
        },
      ],
    });
    mockPrisma.bonus.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockPrisma.extraAllowance.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    jest
      .spyOn(
        service as any,
        'getTeacherAllowanceSourceRowsByStatusAndTaxBucket',
      )
      .mockResolvedValueOnce([
        {
          paymentStatus: PaymentStatus.paid,
          grossAmount: 100000,
          taxRatePercent: 10,
          operatingAmount: 0,
        },
      ])
      .mockResolvedValueOnce([
        {
          paymentStatus: PaymentStatus.paid,
          grossAmount: 100000,
          taxRatePercent: 10,
          operatingAmount: 0,
        },
        {
          paymentStatus: 'deposit',
          grossAmount: 50000,
          taxRatePercent: 0,
          operatingAmount: 0,
        },
      ]);
    const classStatusRowsSpy = jest
      .spyOn(service as any, 'getTeacherAllowanceRowsByClassStatusAndTaxBucket')
      .mockResolvedValueOnce([
        {
          classId: 'class-1',
          className: 'Toán 10A',
          teacherPaymentStatus: PaymentStatus.paid,
          taxRatePercent: 10,
          grossAllowance: 100000,
          operatingAmount: 10000,
          taxableBaseAmount: 90000,
        },
      ])
      .mockResolvedValueOnce([
        {
          classId: 'class-1',
          className: 'Toán 10A',
          teacherPaymentStatus: 'unpaid',
          taxRatePercent: 10,
          grossAllowance: 50000,
          operatingAmount: 0,
          taxableBaseAmount: 50000,
        },
      ]);
    jest.spyOn(service as any, 'getDepositSessionRows').mockResolvedValue([
      {
        id: 'session-1',
        classId: 'class-1',
        className: 'Toán 10A',
        date: new Date('2026-03-12T00:00:00.000Z'),
        teacherPaymentStatus: 'deposit',
        teacherAllowanceTotal: 50000,
      },
    ]);
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([
        {
          staffId: 'staff-1',
          totalUnpaid: 50000,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'session-unpaid-1',
          classId: 'class-1',
          className: 'Toán 10A',
          date: new Date('2026-03-12T00:00:00.000Z'),
          paymentStatus: 'unpaid',
          grossAmount: 50000,
          operatingAmount: 0,
          taxableBaseAmount: 50000,
        },
      ]);
    const result = await service.getIncomeSummary('staff-1', {
      month: '03',
      year: '2026',
      days: 14,
    });

    expect(result.monthlyIncomeTotals).toEqual({
      total: 90000,
      paid: 90000,
      unpaid: 0,
    });
    expect(result.monthlyGrossTotals).toEqual({
      total: 100000,
      paid: 100000,
      unpaid: 0,
    });
    expect(result.monthlyTaxTotals).toEqual({
      total: 10000,
      paid: 10000,
      unpaid: 0,
    });
    expect(result.monthlyOperatingDeductionTotals).toEqual({
      total: 0,
      paid: 0,
      unpaid: 0,
    });
    expect(result.monthlyTotalDeductionTotals).toEqual({
      total: 10000,
      paid: 10000,
      unpaid: 0,
    });
    expect(result.sessionMonthlyTotals).toEqual({
      total: 90000,
      paid: 90000,
      unpaid: 0,
    });
    expect(result.sessionMonthlyGrossTotals).toEqual({
      total: 100000,
      paid: 100000,
      unpaid: 0,
    });
    expect(result.sessionMonthlyTaxTotals).toEqual({
      total: 10000,
      paid: 10000,
      unpaid: 0,
    });
    expect(result.sessionMonthlyOperatingDeductionTotals).toEqual({
      total: 0,
      paid: 0,
      unpaid: 0,
    });
    expect(result.sessionMonthlyTotalDeductionTotals).toEqual({
      total: 10000,
      paid: 10000,
      unpaid: 0,
    });
    expect(result.sessionYearTotal).toBe(140000);
    expect(result.yearIncomeTotal).toBe(140000);
    expect(result.yearGrossIncomeTotal).toBe(150000);
    expect(result.yearTaxTotal).toBe(10000);
    expect(result.yearOperatingDeductionTotal).toBe(0);
    expect(result.yearTotalDeductionTotal).toBe(10000);
    expect(result.depositYearTotal).toBe(50000);
    expect(result.classMonthlySummaries).toEqual([
      {
        classId: 'class-1',
        className: 'Toán 10A',
        isCurrentTeacherAssignment: true,
        total: 100000,
        paid: 100000,
        unpaid: 50000,
      },
    ]);
    expect(classStatusRowsSpy).toHaveBeenNthCalledWith(2, {
      teacherId: 'staff-1',
      teacherPaymentStatuses: ['unpaid', 'pending'],
    });
    expect(result.snapshotUnpaidTotal).toBe(50000);
    expect(result.snapshotUnpaidNetTotal).toBe(50000);
    expect(result.yearPaidNetTotal).toBe(90000);
    expect(result.totalReceivedNet).toBe(140000);
    expect(result.depositYearByClass).toEqual([
      {
        classId: 'class-1',
        className: 'Toán 10A',
        total: 50000,
        sessions: [
          {
            id: 'session-1',
            date: '2026-03-12T00:00:00.000Z',
            teacherPaymentStatus: 'deposit',
            teacherAllowanceTotal: 50000,
          },
        ],
      },
    ]);
  });

  it('calculates teacher tax from post-operating amount in income summary', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.teacher],
      classTeachers: [],
    });
    mockPrisma.bonus.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockPrisma.extraAllowance.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    jest
      .spyOn(
        service as any,
        'getTeacherAllowanceSourceRowsByStatusAndTaxBucket',
      )
      .mockResolvedValueOnce([
        {
          paymentStatus: PaymentStatus.paid,
          grossAmount: 100000,
          operatingAmount: 10000,
          taxableBaseAmount: 90000,
          taxRatePercent: 10,
        },
      ])
      .mockResolvedValueOnce([
        {
          paymentStatus: PaymentStatus.paid,
          grossAmount: 100000,
          operatingAmount: 10000,
          taxableBaseAmount: 90000,
          taxRatePercent: 10,
        },
      ]);
    jest
      .spyOn(service as any, 'getTeacherAllowanceRowsByClassStatusAndTaxBucket')
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    jest.spyOn(service as any, 'getDepositSessionRows').mockResolvedValue([]);

    const result = await service.getIncomeSummary('staff-1', {
      month: '03',
      year: '2026',
      days: 14,
    });

    expect(result.monthlyGrossTotals.total).toBe(100000);
    expect(result.monthlyOperatingDeductionTotals.total).toBe(10000);
    expect(result.monthlyTaxTotals.total).toBe(9000);
    expect(result.monthlyIncomeTotals.total).toBe(81000);
    expect(result.incomeStatsTotalNet).toBe(81000);
    expect(result.monthlyTotalDeductionTotals.total).toBe(19000);
    expect(result.sessionMonthlyTaxTotals.total).toBe(9000);
    expect(result.sessionMonthlyTotals.total).toBe(81000);
    expect(result.yearTaxTotal).toBe(9000);
    expect(result.yearOperatingDeductionTotal).toBe(10000);
    expect(result.yearIncomeTotal).toBe(81000);
    expect(result.yearTotalDeductionTotal).toBe(19000);
    expect(result.yearPaidNetTotal).toBe(81000);
    expect(result.snapshotUnpaidNetTotal).toBe(0);
    expect(result.totalReceivedNet).toBe(81000);
  });

  it('includes unpaid teaching sessions in monthly total using current net deductions', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.teacher],
      classTeachers: [],
    });
    mockPrisma.bonus.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockPrisma.extraAllowance.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockPrisma.staffTaxDeductionOverride.findFirst.mockResolvedValue({
      ratePercent: 10,
    });
    mockPrisma.classTeacher.findMany.mockResolvedValue([
      {
        classId: 'class-1',
        operatingDeductionRatePercent: 10,
      },
    ]);
    jest
      .spyOn(
        service as any,
        'getTeacherAllowanceSourceRowsByStatusAndTaxBucket',
      )
      .mockResolvedValueOnce([
        {
          paymentStatus: PaymentStatus.paid,
          grossAmount: 100000,
          operatingAmount: 10000,
          taxableBaseAmount: 90000,
          taxRatePercent: 10,
        },
        {
          paymentStatus: 'unpaid',
          grossAmount: 50000,
          operatingAmount: 0,
          taxableBaseAmount: 50000,
          taxRatePercent: 0,
        },
      ])
      .mockResolvedValueOnce([
        {
          paymentStatus: PaymentStatus.paid,
          grossAmount: 100000,
          operatingAmount: 10000,
          taxableBaseAmount: 90000,
          taxRatePercent: 10,
        },
      ]);
    jest
      .spyOn(service as any, 'getTeacherAllowanceRowsByClassStatusAndTaxBucket')
      .mockResolvedValueOnce([
        {
          classId: 'class-1',
          className: 'Toán 10A',
          teacherPaymentStatus: 'unpaid',
          taxRatePercent: 0,
          grossAllowance: 50000,
          operatingAmount: 0,
          taxableBaseAmount: 50000,
        },
      ])
      .mockResolvedValueOnce([]);
    jest.spyOn(service as any, 'getDepositSessionRows').mockResolvedValue([]);

    const result = await service.getIncomeSummary('staff-1', {
      month: '03',
      year: '2026',
      days: 14,
    });

    expect(result.monthlyIncomeTotals).toEqual({
      total: 121500,
      paid: 81000,
      unpaid: 40500,
    });
    expect(result.incomeStatsTotalNet).toBe(121500);
    expect(result.monthlyGrossTotals.total).toBe(150000);
    expect(result.monthlyOperatingDeductionTotals.total).toBe(15000);
    expect(result.monthlyTaxTotals.total).toBe(13500);
  });

  it('shows class unpaid sessions as gross allowance before operating and tax deductions', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.teacher],
      classTeachers: [
        {
          class: {
            id: 'class-1',
            name: 'Toán 10A',
          },
        },
      ],
    });
    mockPrisma.bonus.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockPrisma.extraAllowance.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    jest
      .spyOn(
        service as any,
        'getTeacherAllowanceSourceRowsByStatusAndTaxBucket',
      )
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    jest
      .spyOn(service as any, 'getTeacherAllowanceRowsByClassStatusAndTaxBucket')
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          classId: 'class-1',
          className: 'Toán 10A',
          teacherPaymentStatus: 'unpaid',
          taxRatePercent: 10,
          grossAllowance: 50000,
          operatingAmount: 10000,
          taxableBaseAmount: 40000,
        },
      ]);
    jest.spyOn(service as any, 'getDepositSessionRows').mockResolvedValue([]);

    const result = await service.getIncomeSummary('staff-1', {
      month: '03',
      year: '2026',
      days: 14,
    });

    expect(result.classMonthlySummaries).toEqual([
      {
        classId: 'class-1',
        className: 'Toán 10A',
        isCurrentTeacherAssignment: true,
        total: 0,
        paid: 0,
        unpaid: 50000,
      },
    ]);
  });

  it('marks classes without a current teacher assignment in income summary', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.teacher],
      classTeachers: [],
    });
    mockPrisma.bonus.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockPrisma.extraAllowance.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    jest
      .spyOn(
        service as any,
        'getTeacherAllowanceSourceRowsByStatusAndTaxBucket',
      )
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    jest
      .spyOn(service as any, 'getTeacherAllowanceRowsByClassStatusAndTaxBucket')
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          classId: 'class-retired',
          className: 'Toán nghỉ dạy',
          teacherPaymentStatus: 'unpaid',
          taxRatePercent: 10,
          grossAllowance: 50000,
          operatingAmount: 10000,
          taxableBaseAmount: 40000,
        },
      ]);
    jest.spyOn(service as any, 'getDepositSessionRows').mockResolvedValue([]);

    const result = await service.getIncomeSummary('staff-1', {
      month: '03',
      year: '2026',
      days: 14,
    });

    expect(result.classMonthlySummaries).toEqual([
      {
        classId: 'class-retired',
        className: 'Toán nghỉ dạy',
        isCurrentTeacherAssignment: false,
        total: 0,
        paid: 0,
        unpaid: 50000,
      },
    ]);
  });

  it('counts all unpaid teacher sessions in the current unpaid snapshot net', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.teacher],
      classTeachers: [],
    });
    mockPrisma.bonus.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockPrisma.extraAllowance.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockPrisma.staffTaxDeductionOverride.findFirst.mockResolvedValue({
      ratePercent: 10,
    });
    mockPrisma.classTeacher.findMany.mockResolvedValue([
      {
        classId: 'class-1',
        operatingDeductionRatePercent: 20,
      },
    ]);
    const testAccess = service as unknown as StaffServiceTestAccess;
    jest
      .spyOn(testAccess, 'getTeacherAllowanceSourceRowsByStatusAndTaxBucket')
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          paymentStatus: PaymentStatus.paid,
          grossAmount: 50000,
          operatingAmount: 0,
          taxableBaseAmount: 50000,
          taxRatePercent: 0,
        },
      ]);
    jest
      .spyOn(testAccess, 'getTeacherAllowanceRowsByClassStatusAndTaxBucket')
      .mockResolvedValue([]);
    jest.spyOn(testAccess, 'getDepositSessionRows').mockResolvedValue([]);
    jest
      .spyOn(testAccess, 'getUnpaidTotalsByStaffIds')
      .mockImplementation((_staffIds: string[], recentWindow?: unknown) =>
        Promise.resolve(new Map([['staff-1', recentWindow ? 0 : 100000]])),
      );
    jest
      .spyOn(testAccess, 'getTeacherSnapshotPaymentPreviewRows')
      .mockImplementation(
        (_db: unknown, params: { start?: Date; end?: Date }) => {
          if (params.start || params.end) {
            return Promise.resolve([]);
          }

          return Promise.resolve([
            {
              id: 'old-session-1',
              classId: 'class-1',
              className: 'Toán 10A',
              date: new Date('2025-01-05T00:00:00.000Z'),
              paymentStatus: 'unpaid',
              grossAmount: 100000,
              operatingAmount: 0,
              taxableBaseAmount: 100000,
            },
          ]);
        },
      );

    const result = await service.getIncomeSummary('staff-1', {
      month: '03',
      year: '2026',
      days: 14,
    });

    expect(result.snapshotUnpaidTotal).toBe(100000);
    expect(result.snapshotUnpaidNetTotal).toBe(72000);
    expect(result.yearPaidNetTotal).toBe(50000);
    expect(result.totalReceivedNet).toBe(122000);
  });

  it('applies tax but no operating deduction to non-teacher unpaid snapshot net', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.customer_care],
      classTeachers: [],
    });
    mockEmptyTeacherIncome();
    mockPrisma.staffTaxDeductionOverride.findFirst.mockResolvedValue({
      ratePercent: 10,
    });
    mockPrisma.bonus.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockPrisma.extraAllowance.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    jest
      .spyOn(service as any, 'getCustomerCareCommissionRowsByStatus')
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    jest
      .spyOn(service as any, 'getUnpaidTotalsByStaffIds')
      .mockResolvedValue(new Map([['staff-1', 100000]]));
    mockPrisma.attendance.findMany.mockResolvedValueOnce([
      {
        id: 'attendance-1',
        tuitionFee: 100000,
        customerCareCoef: 1,
        customerCarePaymentStatus: PaymentStatus.pending,
        student: {
          fullName: 'Học sinh A',
        },
        session: {
          date: new Date('2026-03-12T00:00:00.000Z'),
          class: {
            name: 'Toán 10A',
          },
        },
      },
    ]);

    const result = await service.getIncomeSummary('staff-1', {
      month: '03',
      year: '2026',
      days: 14,
    });

    expect(result.snapshotUnpaidTotal).toBe(100000);
    expect(result.snapshotUnpaidNetTotal).toBe(90000);
    expect(result.totalReceivedNet).toBe(90000);
  });

  it('applies bonus income tax from prioritized staff role in income summary', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.teacher],
      classTeachers: [],
    });
    mockEmptyTeacherIncome();
    mockPrisma.staffTaxDeductionOverride.findFirst.mockResolvedValue({
      ratePercent: 10,
    });
    mockPrisma.bonus.findMany
      .mockResolvedValueOnce([
        {
          workType: 'Hỗ trợ',
          amount: 100_000,
          status: PaymentStatus.paid,
        },
      ])
      .mockResolvedValueOnce([
        {
          amount: 100_000,
          status: PaymentStatus.paid,
        },
      ]);

    const result = await service.getIncomeSummary('staff-1', {
      month: '03',
      year: '2026',
      days: 14,
    });

    expect(result.bonusMonthlyTotals).toEqual({
      total: 90_000,
      paid: 90_000,
      unpaid: 0,
    });
    expect(result.monthlyGrossTotals.total).toBe(100_000);
    expect(result.monthlyTaxTotals.total).toBe(10_000);
    expect(result.monthlyIncomeTotals.total).toBe(90_000);
    expect(result.yearTaxTotal).toBe(10_000);
    expect(result.yearGrossIncomeTotal).toBe(100_000);
    expect(result.yearIncomeTotal).toBe(90_000);
  });

  it('uses the current staff tax override rate in payment preview items', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.teacher],
    });
    mockPrisma.staffTaxDeductionOverride.findFirst.mockResolvedValue({
      ratePercent: 10,
    });
    jest
      .spyOn(service as any, 'loadAllPendingPaymentPreviewDraftRecords')
      .mockResolvedValue([
        {
          id: 'session-1',
          role: StaffRole.teacher,
          sourceType: 'teacher_session',
          sourceLabel: 'Buổi dạy',
          label: 'Toán 10A',
          secondaryLabel: 'Mã lớp: class-1',
          classId: 'class-1',
          date: '2026-03-15T00:00:00.000Z',
          currentStatus: 'unpaid',
          grossAmount: 100,
          operatingAmount: 10,
          operatingRatePercent: 10,
          taxableBaseAmount: 90,
        },
      ]);

    const result = await service.getPaymentPreview('staff-1', {
      month: '03',
      year: '2026',
    });

    expect(result.taxAsOfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.sections).toEqual([
      expect.objectContaining({
        role: StaffRole.teacher,
        sources: [
          expect.objectContaining({
            items: [
              expect.objectContaining({
                id: 'session-1',
                taxRatePercent: 10,
                taxAmount: 9,
                netAmount: 81,
              }),
            ],
          }),
        ],
      }),
    ]);
  });

  it('keeps deposit payment preview untaxed and without operating deductions', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
    });
    jest
      .spyOn(service as any, 'getTeacherDepositPaymentPreviewRows')
      .mockResolvedValue([
        {
          id: 'session-1',
          classId: 'class-1',
          className: 'Toán 10A',
          date: '2026-03-15T00:00:00.000Z',
          paymentStatus: 'deposit',
          grossAmount: 60000,
          operatingAmount: 10000,
          taxableBaseAmount: 50000,
        },
      ]);

    const result = await service.getDepositPaymentPreview('staff-1', {
      year: '2026',
    });

    expect(result.taxAsOfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.summary).toEqual({
      preTaxTotal: 50000,
      taxTotal: 0,
      netTotal: 50000,
      itemCount: 1,
    });
    expect(result.classes).toEqual([
      {
        classId: 'class-1',
        className: 'Toán 10A',
        preTaxTotal: 50000,
        taxTotal: 0,
        netTotal: 50000,
        itemCount: 1,
        sessions: [
          {
            id: 'session-1',
            date: '2026-03-15T00:00:00.000Z',
            currentStatus: 'deposit',
            preTaxAmount: 50000,
            taxRatePercent: 0,
            taxAmount: 0,
            netAmount: 50000,
          },
        ],
      },
    ]);
  });

  it('refreshes tax snapshots to the current rate before paying all items', async () => {
    jest
      .spyOn(service as any, 'loadStaffPaymentPreviewRecords')
      .mockResolvedValue({
        monthKey: '2026-03',
        records: [
          {
            id: 'session-1',
            role: StaffRole.teacher,
            sourceType: 'teacher_session',
            sourceLabel: 'Buổi dạy',
            label: 'Toán 10A',
            secondaryLabel: null,
            date: '2026-03-15T00:00:00.000Z',
            currentStatus: 'unpaid',
            grossAmount: 100000,
            operatingAmount: 0,
            operatingRatePercent: 7,
            taxRatePercent: 12,
            taxAmount: 12000,
            netAmount: 88000,
          },
          {
            id: 'allowance-1',
            role: StaffRole.assistant,
            sourceType: 'extra_allowance',
            sourceLabel: 'Trợ cấp thêm',
            label: 'Phụ cấp trợ lí',
            secondaryLabel: '2026-03',
            date: null,
            currentStatus: PaymentStatus.pending,
            grossAmount: 50000,
            operatingAmount: 0,
            taxRatePercent: 8,
            taxAmount: 4000,
            netAmount: 46000,
          },
          {
            id: 'allowance-2',
            role: StaffRole.communication,
            sourceType: 'extra_allowance',
            sourceLabel: 'Trợ cấp thêm',
            label: 'Phụ cấp truyền thông',
            secondaryLabel: '2026-03',
            date: null,
            currentStatus: PaymentStatus.pending,
            grossAmount: 30000,
            operatingAmount: 0,
            taxRatePercent: 5,
            taxAmount: 1500,
            netAmount: 28500,
          },
        ],
      });
    jest
      .spyOn(service as any, 'getSessionPaymentSnapshots')
      .mockResolvedValue(new Map());
    jest
      .spyOn(service as any, 'getAttendancePaymentSnapshots')
      .mockResolvedValue(new Map());
    jest
      .spyOn(service as any, 'getLessonOutputSnapshots')
      .mockResolvedValue(new Map());
    jest
      .spyOn(service as any, 'getExtraAllowanceSnapshots')
      .mockResolvedValue(new Map());
    jest
      .spyOn(service as any, 'getBonusSnapshots')
      .mockResolvedValue(new Map());
    mockPrisma.session.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.extraAllowance.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });

    const result = await service.payAllPayments('staff-1', {
      month: '03',
      year: '2026',
    });

    expect(mockPrisma.session.updateMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ['session-1'],
        },
      },
      data: {
        teacherTaxDeductionRatePercent: 12,
        teacherOperatingDeductionRatePercent: 7,
        teacherPaymentStatus: 'paid',
      },
    });
    expect(mockPrisma.extraAllowance.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: {
          in: ['allowance-1'],
        },
      },
      data: {
        taxDeductionRatePercent: 8,
        status: PaymentStatus.paid,
      },
    });
    expect(mockPrisma.extraAllowance.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: {
          in: ['allowance-2'],
        },
      },
      data: {
        taxDeductionRatePercent: 5,
        status: PaymentStatus.paid,
      },
    });
    expect(result.updatedBySource).toEqual([
      {
        sourceType: 'teacher_session',
        sourceLabel: 'Buổi dạy',
        updatedCount: 1,
      },
      {
        sourceType: 'extra_allowance',
        sourceLabel: 'Trợ cấp thêm',
        updatedCount: 2,
      },
    ]);
  });

  it('pays only selected customer care preview items', async () => {
    jest
      .spyOn(service as any, 'loadStaffPaymentPreviewRecords')
      .mockResolvedValue({
        monthKey: '2026-03',
        records: [
          {
            id: 'attendance-1',
            role: StaffRole.customer_care,
            sourceType: 'customer_care',
            sourceLabel: 'Hoa hồng CSKH',
            label: 'Toán 10A',
            secondaryLabel: null,
            date: '2026-03-15T00:00:00.000Z',
            currentStatus: PaymentStatus.pending,
            grossAmount: 20000,
            operatingAmount: 0,
            operatingRatePercent: 0,
            taxRatePercent: 10,
            taxAmount: 2000,
            netAmount: 18000,
          },
          {
            id: 'attendance-2',
            role: StaffRole.customer_care,
            sourceType: 'customer_care',
            sourceLabel: 'Hoa hồng CSKH',
            label: 'Lý 11B',
            secondaryLabel: null,
            date: '2026-03-16T00:00:00.000Z',
            currentStatus: PaymentStatus.pending,
            grossAmount: 30000,
            operatingAmount: 0,
            operatingRatePercent: 0,
            taxRatePercent: 10,
            taxAmount: 3000,
            netAmount: 27000,
          },
        ],
      });
    jest
      .spyOn(service as any, 'getSessionPaymentSnapshots')
      .mockResolvedValue(new Map());
    jest
      .spyOn(service as any, 'getAttendancePaymentSnapshots')
      .mockResolvedValue(new Map());
    jest
      .spyOn(service as any, 'getLessonOutputSnapshots')
      .mockResolvedValue(new Map());
    jest
      .spyOn(service as any, 'getExtraAllowanceSnapshots')
      .mockResolvedValue(new Map());
    jest
      .spyOn(service as any, 'getBonusSnapshots')
      .mockResolvedValue(new Map());
    mockPrisma.attendance.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.paySelectedPayments('staff-1', {
      month: '03',
      year: '2026',
      items: [{ sourceType: 'customer_care', id: 'attendance-1' }],
    });

    expect(mockPrisma.attendance.updateMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ['attendance-1'],
        },
      },
      data: {
        customerCareTaxDeductionRatePercent: 10,
        customerCarePaymentStatus: PaymentStatus.paid,
      },
    });
    expect(result.requestedItemCount).toBe(1);
    expect(result.updatedCount).toBe(1);
    expect(result.updatedBySource).toEqual([
      {
        sourceType: 'customer_care',
        sourceLabel: 'Hoa hồng CSKH',
        updatedCount: 1,
      },
    ]);
  });

  it('rejects selected payment items that are no longer in preview', async () => {
    jest
      .spyOn(service as any, 'loadStaffPaymentPreviewRecords')
      .mockResolvedValue({
        monthKey: '2026-03',
        records: [],
      });

    await expect(
      service.paySelectedPayments('staff-1', {
        month: '03',
        year: '2026',
        items: [{ sourceType: 'customer_care', id: 'attendance-missing' }],
      }),
    ).rejects.toThrow(
      'Có khoản không còn trong danh sách cần thanh toán. Vui lòng tải lại popup rồi thử lại.',
    );
  });

  it('zeroes teacher deductions before paying selected deposit sessions', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
    });
    mockPrisma.session.findMany.mockResolvedValue([
      {
        id: 'session-1',
        teacherPaymentStatus: 'deposit',
      },
      {
        id: 'session-2',
        teacherPaymentStatus: 'deposit',
      },
    ]);
    jest
      .spyOn(service as any, 'getSessionPaymentSnapshots')
      .mockResolvedValue(new Map());
    mockPrisma.session.updateMany.mockResolvedValue({ count: 2 });

    const result = await service.payDepositSessions('staff-1', {
      sessionIds: ['session-1', 'session-2'],
    });

    expect(mockPrisma.session.updateMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ['session-1', 'session-2'],
        },
      },
      data: {
        teacherTaxDeductionRatePercent: 0,
        teacherOperatingDeductionRatePercent: 0,
        teacherPaymentStatus: 'paid',
      },
    });
    const expectedTaxAsOfDate = expect.stringMatching(
      /^\d{4}-\d{2}-\d{2}$/,
    ) as unknown as string;

    expect(result).toEqual({
      staffId: 'staff-1',
      taxAsOfDate: expectedTaxAsOfDate,
      teacherTaxRatePercent: 0,
      requestedItemCount: 2,
      updatedCount: 2,
      updatedSessionIds: ['session-1', 'session-2'],
    });
  });

  it('rejects selected sessions that are no longer in deposit state', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
    });
    mockPrisma.session.findMany.mockResolvedValue([
      {
        id: 'session-1',
        teacherPaymentStatus: 'paid',
      },
    ]);

    await expect(
      service.payDepositSessions('staff-1', {
        sessionIds: ['session-1'],
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'Có buổi cọc đã đổi trạng thái. Vui lòng tải lại danh sách rồi thử lại.',
      ),
    );
  });

  it('returns authoritative unpaid totals for staff list rows', async () => {
    mockPrisma.staffInfo.count.mockResolvedValue(1);
    mockPrisma.staffInfo.findMany.mockResolvedValue([
      {
        id: 'staff-1',
        fullName: 'Teacher A',
        status: 'active',
        roles: [StaffRole.teacher, StaffRole.customer_care],
        user: {
          first_name: 'Teacher',
          last_name: 'A',
          accountHandle: 'teacher-a',
          email: 'teacher@example.com',
          province: 'Hanoi',
          avatarPath: 'users/user-1/avatar',
        },
        classTeachers: [],
      },
    ]);
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        staffId: 'staff-1',
        totalUnpaid: 345000,
      },
    ]);

    const result = await service.getStaff({
      page: 1,
      limit: 20,
    });

    expect(mockPrisma.staffInfo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          user: {
            select: {
              province: true,
              first_name: true,
              last_name: true,
              accountHandle: true,
              email: true,
              avatarPath: true,
            },
          },
          classTeachers: {
            include: { class: { select: { id: true, name: true } } },
          },
        },
      }),
    );
    expect(result.data).toEqual([
      expect.objectContaining({
        id: 'staff-1',
        user: expect.objectContaining({
          avatarUrl: 'signed:users/user-1/avatar',
        }),
        unpaidAmountTotal: 345000,
      }),
    ]);
    expect(result.data[0].user).not.toHaveProperty('avatarPath');
  });

  it('attaches signed avatar URL to staff detail user without exposing storage path', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
      fullName: 'Teacher A',
      status: 'active',
      roles: [StaffRole.teacher],
      user: {
        first_name: 'A',
        last_name: 'Teacher',
        accountHandle: 'teacher-a',
        email: 'teacher@example.com',
        province: 'Hanoi',
        avatarPath: 'users/user-1/avatar',
      },
      classTeachers: [],
      monthlyStats: [],
      customerCareManagedBy: null,
    });
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);

    const result = await service.getStaffById('staff-1');

    expect(mockPrisma.staffInfo.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          user: expect.objectContaining({
            select: expect.objectContaining({
              avatarPath: true,
            }),
          }),
        }),
      }),
    );
    expect(result.user).toEqual(
      expect.objectContaining({
        fullName: 'Teacher A',
        avatarUrl: 'signed:users/user-1/avatar',
      }),
    );
    expect(result.user).not.toHaveProperty('avatarPath');
    expect(mockCreateSignedStorageUrl).toHaveBeenCalledWith({
      bucket: 'avatars',
      path: 'users/user-1/avatar',
      expiresIn: 3600,
    });
  });

  it('lets expense accountants update class operating deduction rates', async () => {
    mockPrisma.classTeacher.findUnique.mockResolvedValue({
      id: 'assignment-1',
      operatingDeductionRatePercent: 5,
    });
    jest
      .spyOn(service, 'getStaffById')
      .mockResolvedValue({ id: 'staff-1' } as never);

    await service.patchStaffClassTeacherOperatingDeduction(
      'staff-1',
      'class-1',
      { operating_deduction_rate_percent: 12.5 },
      {
        roleType: UserRole.staff,
        staffRoles: [StaffRole.accountant_expense],
        auditActor: {
          userId: 'admin-1',
          userEmail: 'admin@example.com',
          roleType: UserRole.admin,
        },
      },
    );

    expect(mockPrisma.classTeacher.update).toHaveBeenCalledWith({
      where: {
        classId_teacherId: {
          classId: 'class-1',
          teacherId: 'staff-1',
        },
      },
      data: {
        operatingDeductionRatePercent: 12.5,
      },
    });
    expect(actionHistoryService.recordUpdate).toHaveBeenCalledWith(mockPrisma, {
      actor: {
        userId: 'admin-1',
        userEmail: 'admin@example.com',
        roleType: UserRole.admin,
      },
      entityType: 'class_teacher',
      entityId: 'assignment-1',
      description: 'Cập nhật % khấu trừ vận hành gia sư-lớp',
      beforeValue: {
        staffId: 'staff-1',
        classId: 'class-1',
        operatingDeductionRatePercent: 5,
      },
      afterValue: {
        staffId: 'staff-1',
        classId: 'class-1',
        operatingDeductionRatePercent: 12.5,
      },
    });
  });

  it('returns sanitized staff landing profiles with default teacher/active filters', async () => {
    mockPrisma.staffInfo.count.mockResolvedValue(1);
    mockPrisma.staffInfo.findMany.mockResolvedValue([
      {
        id: 'teacher-1',
        university: 'HCMUS',
        specialization: 'Computer Science',
        user: {
          first_name: 'Nguyen',
          last_name: 'Van A',
          accountHandle: 'teacher-a',
          email: 'teacher@example.com',
          avatarPath: 'users/user-1/avatar',
        },
      },
    ]);

    await expect(service.getLandingProfiles({})).resolves.toEqual({
      total: 1,
      data: [
        {
          id: 'teacher-1',
          name: 'Van A Nguyen',
          avatarUrl: 'signed:users/user-1/avatar',
          avatarPath: 'users/user-1/avatar',
          university: 'HCMUS',
          specialization: 'Computer Science',
        },
      ],
    });

    expect(mockPrisma.staffInfo.count).toHaveBeenCalledWith({
      where: {
        status: StaffStatus.active,
        roles: { has: StaffRole.teacher },
      },
    });
    expect(mockPrisma.staffInfo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: StaffStatus.active,
          roles: { has: StaffRole.teacher },
        },
        take: 50,
      }),
    );
  });
});
