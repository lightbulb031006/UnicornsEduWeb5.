jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));
jest.mock('../../generated/client', () => ({
  Prisma: {},
}));

import { BadRequestException, Logger } from '@nestjs/common';
import {
  StaffRole,
  StudentWalletDirectTopUpRequestStatus,
  StudentStatus,
  UserRole,
  WalletTransactionType,
} from '../../generated/enums';
import { StudentService } from './student.service';

describe('StudentService', () => {
  const mockPrisma = {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    studentInfo: {
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    customerCareService: {
      findUnique: jest.fn(),
      delete: jest.fn(),
      upsert: jest.fn(),
    },
    walletTransactionsHistory: {
      findMany: jest.fn(),
      create: jest.fn(),
      groupBy: jest.fn(),
    },
    studentWalletSepayOrder: {
      create: jest.fn(),
    },
    studentWalletDirectTopUpRequest: {
      create: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    staffInfo: {
      findUnique: jest.fn(),
    },
    class: {
      findMany: jest.fn(),
    },
    studentClass: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const actionHistoryService = {
    recordCreate: jest.fn(),
    recordUpdate: jest.fn(),
    recordDelete: jest.fn(),
  };
  const googleCalendarService = {
    syncStudentExamScheduleEvents: jest.fn(),
  };
  const sePayService = {
    isWalletTopUpConfigured: jest.fn(),
    isStudentWalletStaticQrConfigured: jest.fn(),
    buildStudentWalletOrderCode: jest.fn(),
    createStudentWalletTopUpPayment: jest.fn(),
    createStudentWalletStaticQr: jest.fn(),
  };
  const configService = {
    get: jest.fn(),
  };
  const mailService = {
    sendStudentWalletDirectTopUpApprovalEmail: jest.fn(),
  };
  const notificationService = {
    createNotificationDraft: jest.fn(),
    pushNotification: jest.fn(),
  };
  const authIdentityCacheService = {
    invalidateUser: jest.fn(),
  };

  let service: StudentService;

  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.SEPAY_TOPUP_MODE;
    delete process.env.SEPAY_API_ACCESS_TOKEN;
    delete process.env.SEPAY_BANK_ACCOUNT_XID;
    delete process.env.SEPAY_TRANSFER_BANK_BIN;
    delete process.env.SEPAY_TRANSFER_ACCOUNT_NUMBER;
    mockPrisma.$transaction.mockImplementation(
      (callback: (db: typeof mockPrisma) => unknown) => callback(mockPrisma),
    );
    mockPrisma.walletTransactionsHistory.groupBy.mockResolvedValue([]);
    notificationService.createNotificationDraft.mockResolvedValue({
      id: 'notification-1',
    });
    notificationService.pushNotification.mockResolvedValue({
      id: 'notification-1',
    });
    configService.get.mockImplementation((key: string) =>
      key === 'ADMIN_EMAIL' ? 'admin@unicornsedu.com' : undefined,
    );
    service = new StudentService(
      mockPrisma as never,
      actionHistoryService as never,
      googleCalendarService as never,
      sePayService as never,
      configService as never,
      mailService as never,
      notificationService as never,
      authIdentityCacheService as never,
    );
  });

  it('returns student list rows with 21-day top-up totals', async () => {
    mockPrisma.studentInfo.count.mockResolvedValue(1);
    mockPrisma.studentInfo.findMany.mockResolvedValue([
      {
        id: 'student-1',
        fullName: 'Nguyen Van A',
        email: 'student@example.com',
        parentEmail: 'parent@example.com',
        accountBalance: 250000,
        school: 'THPT Nguyen Du',
        province: 'Hanoi',
        status: StudentStatus.active,
        gender: 'male',
        createdAt: new Date('2026-03-20T10:00:00.000Z'),
        updatedAt: new Date('2026-03-21T10:00:00.000Z'),
        studentClasses: [],
      },
    ]);
    mockPrisma.walletTransactionsHistory.groupBy.mockResolvedValue([
      {
        studentId: 'student-1',
        _sum: { amount: 299_000 },
      },
    ]);

    await expect(service.getStudents({ page: 1, limit: 20 })).resolves.toEqual({
      data: [
        expect.objectContaining({
          id: 'student-1',
          recentTopUpTotalLast21Days: 299_000,
          recentTopUpMeetsThreshold: false,
        }),
      ],
      meta: { total: 1, page: 1, limit: 20 },
    });
  });

  it('records action history after creating a student', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'student@example.com',
      province: 'Hanoi',
      roleType: UserRole.guest,
      studentInfo: null,
      staffInfo: null,
    });
    mockPrisma.user.update.mockResolvedValue({
      id: 'user-1',
      roleType: UserRole.student,
    });
    mockPrisma.studentInfo.create.mockResolvedValue({
      id: 'student-1',
      fullName: 'Nguyen Van A',
      email: 'student@example.com',
      school: 'THPT Nguyen Du',
      province: 'Hanoi',
      birthYear: 2010,
      parentName: 'Parent A',
      parentPhone: '0900000000',
      parentEmail: 'parent@example.com',
      status: StudentStatus.active,
      gender: 'male',
      goal: 'Top 1',
      userId: 'user-1',
      accountBalance: 0,
      createdAt: new Date('2026-03-20T10:00:00.000Z'),
      updatedAt: new Date('2026-03-20T10:00:00.000Z'),
      dropOutDate: null,
      studentClasses: [],
      customerCareServices: null,
    });
    mockPrisma.studentInfo.findUnique.mockResolvedValue({
      id: 'student-1',
      fullName: 'Nguyen Van A',
      email: 'student@example.com',
      school: 'THPT Nguyen Du',
      province: 'Hanoi',
      birthYear: 2010,
      parentName: 'Parent A',
      parentPhone: '0900000000',
      parentEmail: 'parent@example.com',
      status: StudentStatus.active,
      gender: 'male',
      goal: 'Top 1',
      userId: 'user-1',
      accountBalance: 0,
      createdAt: new Date('2026-03-20T10:00:00.000Z'),
      updatedAt: new Date('2026-03-20T10:00:00.000Z'),
      dropOutDate: null,
      studentClasses: [],
      customerCareServices: null,
    });

    await service.createStudent(
      {
        full_name: 'Nguyen Van A',
        email: 'student@example.com',
        school: 'THPT Nguyen Du',
        province: 'Hanoi',
        birth_year: 2010,
        parent_name: 'Parent A',
        parent_phone: '0900000000',
        status: StudentStatus.active,
        gender: 'male',
        goal: 'Top 1',
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
        entityType: 'student',
        entityId: 'student-1',
      }),
    );
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: {
        id: 'user-1',
      },
      data: {
        roleType: UserRole.student,
      },
    });
  });

  it('rejects creating a student for a user that already has a staff profile', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'student@example.com',
      province: 'Hanoi',
      roleType: UserRole.guest,
      studentInfo: null,
      staffInfo: {
        id: 'staff-1',
      },
    });

    await expect(
      service.createStudent({
        full_name: 'Nguyen Van A',
        user_id: 'user-1',
      }),
    ).rejects.toThrow(
      'User này đang có hồ sơ nhân sự nên không thể gán làm học sinh.',
    );

    expect(mockPrisma.studentInfo.create).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('returns self detail with read-only tuition fields', async () => {
    mockPrisma.studentInfo.findUnique.mockResolvedValue({
      id: 'student-1',
      fullName: 'Nguyen Van A',
      email: 'student@example.com',
      school: 'THPT Nguyen Du',
      province: 'Hanoi',
      birthYear: 2010,
      parentName: 'Parent A',
      parentPhone: '0900000000',
      parentEmail: 'parent@example.com',
      parentReceiptEmailEnabled: true,
      status: StudentStatus.active,
      gender: 'male',
      goal: 'Top 1',
      accountBalance: 250000,
      createdAt: new Date('2026-03-20T10:00:00.000Z'),
      updatedAt: new Date('2026-03-21T10:00:00.000Z'),
      dropOutDate: null,
      customerCareServices: {
        staff: {
          id: 'staff-1',
          fullName: 'CSKH A',
          roles: ['customer_care'],
          status: 'active',
        },
        profitPercent: 0.2,
      },
      studentClasses: [
        {
          totalAttendedSession: 6,
          customStudentTuitionPerSession: 100000,
          customTuitionPackageTotal: 900000,
          customTuitionPackageSession: 9,
          class: {
            id: 'class-1',
            name: 'Toan 8A',
            status: 'running',
            tuitionPackageTotal: 1200000,
            tuitionPackageSession: 12,
            studentTuitionPerSession: 100000,
          },
        },
      ],
    });

    const result = await service.getStudentSelfDetail('student-1');

    expect(result).toEqual({
      id: 'student-1',
      fullName: 'Nguyen Van A',
      email: 'student@example.com',
      accountBalance: 250000,
      school: 'THPT Nguyen Du',
      province: 'Hanoi',
      status: StudentStatus.active,
      gender: 'male',
      createdAt: new Date('2026-03-20T10:00:00.000Z'),
      updatedAt: new Date('2026-03-21T10:00:00.000Z'),
      birthYear: 2010,
      parentName: 'Parent A',
      parentPhone: '0900000000',
      parentEmail: 'parent@example.com',
      parentReceiptEmailEnabled: true,
      goal: 'Top 1',
      studentClasses: [
        {
          class: {
            id: 'class-1',
            name: 'Toan 8A',
            status: 'running',
          },
          customTuitionPerSession: 100000,
          customTuitionPackageTotal: 900000,
          customTuitionPackageSession: 9,
          effectiveTuitionPerSession: 100000,
          effectiveTuitionPackageTotal: 900000,
          effectiveTuitionPackageSession: 9,
          tuitionPackageSource: 'custom',
          totalAttendedSession: 6,
        },
      ],
    });
    expect(result).not.toHaveProperty('customerCare');
    expect(result.parentEmail).toBe('parent@example.com');
    expect(result.studentClasses[0]).toMatchObject({
      effectiveTuitionPerSession: 100000,
      effectiveTuitionPackageTotal: 900000,
      effectiveTuitionPackageSession: 9,
      tuitionPackageSource: 'custom',
    });
  });

  it('blocks self-service negative wallet deltas so students cannot directly withdraw', async () => {
    await expect(
      service.updateMyStudentAccountBalance('student-1', {
        amount: -50000,
      }),
    ).rejects.toThrow('Use SePay');

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.walletTransactionsHistory.create).not.toHaveBeenCalled();
    expect(mockPrisma.studentInfo.update).not.toHaveBeenCalled();
  });

  it('blocks self-service positive wallet deltas so self top-ups always use SePay QR', async () => {
    await expect(
      service.updateMyStudentAccountBalance('student-1', {
        amount: 150000,
      }),
    ).rejects.toThrow('Use SePay');

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.walletTransactionsHistory.create).not.toHaveBeenCalled();
  });

  it('blocks self-service positive wallet deltas when SePay bank-transfer top-up is configured', async () => {
    process.env.SEPAY_TOPUP_MODE = 'bank_transfer';
    process.env.SEPAY_TRANSFER_BANK_BIN = '970422';
    process.env.SEPAY_TRANSFER_ACCOUNT_NUMBER = '722732006';

    await expect(
      service.updateMyStudentAccountBalance('student-1', {
        amount: 150000,
      }),
    ).rejects.toThrow('Use SePay');

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.walletTransactionsHistory.create).not.toHaveBeenCalled();
  });

  it('requires a reason for admin manual balance adjustments', async () => {
    await expect(
      service.updateStudentAccountBalance(
        {
          student_id: 'student-1',
          amount: 150000,
          reason: ' ',
        },
        {
          userId: 'admin-user-1',
          userEmail: 'admin@example.com',
          roleType: UserRole.admin,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.walletTransactionsHistory.create).not.toHaveBeenCalled();
  });

  it('adds the admin manual reason to wallet history notes', async () => {
    mockPrisma.studentInfo.findUnique.mockResolvedValueOnce({
      id: 'student-1',
      accountBalance: 100000,
    });
    mockPrisma.studentInfo.update.mockResolvedValue({
      id: 'student-1',
      fullName: 'Nguyen Van A',
      email: 'student@example.com',
      school: 'THPT Nguyen Du',
      province: 'Hanoi',
      birthYear: 2010,
      parentName: 'Parent A',
      parentPhone: '0900000000',
      parentEmail: 'parent@example.com',
      status: StudentStatus.active,
      gender: 'male',
      goal: 'Top 1',
      accountBalance: 250000,
      createdAt: new Date('2026-03-20T10:00:00.000Z'),
      updatedAt: new Date('2026-03-21T10:00:00.000Z'),
      dropOutDate: null,
      customerCareServices: null,
      studentClasses: [],
      examSchedules: [],
    });

    await service.updateStudentAccountBalance({
      student_id: 'student-1',
      amount: 150000,
      reason: 'Phụ huynh chuyển khoản ngoài SePay',
    });

    const walletCreateMock = mockPrisma.walletTransactionsHistory
      .create as jest.MockedFunction<
      (args: { data: { note?: string | null } }) => unknown
    >;
    const walletCreateArg = walletCreateMock.mock.calls[0]?.[0];
    expect(walletCreateArg?.data.note).toContain(
      'Lý do: Phụ huynh chuyển khoản ngoài SePay',
    );
  });

  it('creates a SePay top-up order for assistant staff and stores creator metadata', async () => {
    sePayService.isWalletTopUpConfigured.mockReturnValue(true);
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.assistant],
    });
    mockPrisma.studentInfo.findUnique
      .mockResolvedValueOnce({
        id: 'student-1',
        fullName: 'Nguyen Van A',
        email: 'student@example.com',
        school: 'THPT Nguyen Du',
        province: 'Hanoi',
        birthYear: 2010,
        parentName: 'Parent A',
        parentPhone: '0900000000',
        parentEmail: 'parent@example.com',
        status: StudentStatus.inactive,
        gender: 'male',
        goal: 'Top 1',
        accountBalance: 250000,
        createdAt: new Date('2026-03-20T10:00:00.000Z'),
        updatedAt: new Date('2026-03-21T10:00:00.000Z'),
        dropOutDate: null,
        customerCareServices: null,
        studentClasses: [],
        examSchedules: [],
      })
      .mockResolvedValueOnce({
        id: 'student-1',
        parentEmail: 'parent@example.com',
      });
    sePayService.buildStudentWalletOrderCode.mockReturnValue('ABC123');
    sePayService.createStudentWalletTopUpPayment.mockResolvedValue({
      orderId: 'sepay-order-1',
      sepayStatus: 'Pending',
      vaNumber: '963NQDABC123',
      vaHolderName: 'UNICORNS EDU',
      bankName: 'BIDV',
      accountNumber: '1234567890',
      accountHolderName: 'UNICORNS EDU',
      expiredAt: null,
      qrCode: 'data:image/png;base64,abc',
      qrCodeUrl: 'https://qr.sepay.vn/img?template=compact',
      transferNote: 'Phụ huynh gia hạn tiền học phí ABC123',
    });
    mockPrisma.studentWalletSepayOrder.create.mockResolvedValue({
      id: 'order-row-1',
      studentId: 'student-1',
      orderCode: 'ABC123',
      status: 'pending',
      amountRequested: 500000,
      amountReceived: null,
      transferNote: 'Phụ huynh gia hạn tiền học phí ABC123',
      parentEmail: 'parent@example.com',
      sepayOrderId: 'sepay-order-1',
      sepayOrderStatus: 'Pending',
      sepayVaNumber: '963NQDABC123',
      sepayVaHolderName: 'UNICORNS EDU',
      sepayBankName: 'BIDV',
      sepayAccountNumber: '1234567890',
      sepayAccountHolderName: 'UNICORNS EDU',
      sepayQrCode: 'data:image/png;base64,abc',
      sepayQrCodeUrl: 'https://qr.sepay.vn/img?template=compact',
      sepayExpiredAt: null,
      createdByUserId: 'staff-user-1',
      createdByUserEmail: 'assistant@example.com',
      createdByRoleType: UserRole.staff,
      createdByStaffRoles: [StaffRole.assistant],
      createdAt: new Date('2026-05-11T09:15:00.000Z'),
      updatedAt: new Date('2026-05-11T09:15:00.000Z'),
    });

    await expect(
      service.createStudentSePayTopUpOrder(
        'student-1',
        { amount: 500000 },
        {
          userId: 'staff-user-1',
          userEmail: 'assistant@example.com',
          roleType: UserRole.staff,
        },
      ),
    ).resolves.toMatchObject({
      id: 'order-row-1',
      amount: 500000,
      orderCode: 'ABC123',
      qrCode: 'data:image/png;base64,abc',
    });

    const orderCreateMock = mockPrisma.studentWalletSepayOrder
      .create as jest.MockedFunction<
      (args: {
        data: {
          studentId: string;
          createdByUserId: string | null;
          createdByUserEmail: string | null;
          createdByRoleType: UserRole | null;
          createdByStaffRoles: StaffRole[];
        };
      }) => unknown
    >;
    const orderCreateArg = orderCreateMock.mock.calls[0]?.[0];
    expect(orderCreateArg?.data.studentId).toBe('student-1');
    expect(orderCreateArg?.data.createdByUserId).toBe('staff-user-1');
    expect(orderCreateArg?.data.createdByUserEmail).toBe(
      'assistant@example.com',
    );
    expect(orderCreateArg?.data.createdByRoleType).toBe(UserRole.staff);
    expect(orderCreateArg?.data.createdByStaffRoles).toEqual([
      StaffRole.assistant,
    ]);
  });

  it('creates a static QR with active class ids in the transfer note context', async () => {
    sePayService.isStudentWalletStaticQrConfigured.mockReturnValue(true);
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.customer_care],
    });
    mockPrisma.customerCareService.findUnique.mockResolvedValue({
      staffId: 'staff-1',
    });
    mockPrisma.studentInfo.findUnique.mockResolvedValue({
      id: 'student-1',
      studentClasses: [
        {
          status: 'active',
          class: { id: 'class-active-1', name: 'Toan 8A' },
        },
        {
          status: 'inactive',
          class: { id: 'class-inactive-1', name: 'Van 8A' },
        },
      ],
    });
    sePayService.createStudentWalletStaticQr.mockReturnValue({
      studentId: 'student-1',
      classIds: ['class-active-1'],
      transferNote: 'student-1',
      accountNumber: '722732006',
      qrCodeUrl: 'https://img.vietqr.io/image/qr.png',
    });

    await expect(
      service.getStudentSePayStaticQr('student-1', {
        userId: 'staff-user-1',
        userEmail: 'care@example.com',
        roleType: UserRole.staff,
      }),
    ).resolves.toMatchObject({
      studentId: 'student-1',
      classIds: ['class-active-1'],
      transferNote: 'student-1',
    });

    expect(sePayService.createStudentWalletStaticQr).toHaveBeenCalledWith({
      studentId: 'student-1',
      classIds: ['class-active-1'],
      classNames: ['Toan 8A'],
    });
  });

  it('creates a direct top-up request with a 14-day approval token expiry', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-16T03:00:00.000Z'));
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.customer_care],
    });
    mockPrisma.customerCareService.findUnique.mockResolvedValue({
      staffId: 'staff-1',
    });
    mockPrisma.studentInfo.findUnique.mockResolvedValue({
      id: 'student-1',
      fullName: 'Nguyen Van A',
      accountBalance: 100000,
    });
    mockPrisma.studentWalletDirectTopUpRequest.create.mockImplementation(
      (args: {
        data: {
          studentId: string;
          amount: number;
          reason: string;
          tokenHash: string;
          expiresAt: Date;
          requestedByUserEmail: string | null;
        };
      }) =>
        Promise.resolve({
          id: 'direct-request-1',
          ...args.data,
          status: StudentWalletDirectTopUpRequestStatus.pending,
          approvedAt: null,
          walletTransactionId: null,
          requestedByUserId: 'staff-user-1',
          requestedByRoleType: UserRole.staff,
          requestedByStaffRoles: [StaffRole.customer_care],
          createdAt: new Date('2026-05-16T03:00:00.000Z'),
          updatedAt: new Date('2026-05-16T03:00:00.000Z'),
          student: {
            id: 'student-1',
            fullName: 'Nguyen Van A',
            accountBalance: 100000,
          },
        }),
    );

    await expect(
      service.createStudentWalletDirectTopUpRequest(
        'student-1',
        {
          amount: 500000,
          reason: 'Phụ huynh chuyển khoản ngoài SePay',
        },
        {
          userId: 'staff-user-1',
          userEmail: 'care@example.com',
          roleType: UserRole.staff,
        },
      ),
    ).resolves.toMatchObject({
      id: 'direct-request-1',
      status: StudentWalletDirectTopUpRequestStatus.pending,
      expiresAt: '2026-05-30T03:00:00.000Z',
    });

    const createMock = mockPrisma.studentWalletDirectTopUpRequest
      .create as jest.MockedFunction<
      (args: {
        data: {
          tokenHash: string;
          expiresAt: Date;
        };
      }) => unknown
    >;
    const createArg = createMock.mock.calls[0]?.[0];
    expect(createArg?.data.tokenHash).toHaveLength(64);
    expect(createArg?.data).not.toHaveProperty('token');
    expect(createArg?.data.expiresAt.toISOString()).toBe(
      '2026-05-30T03:00:00.000Z',
    );
    expect(
      mailService.sendStudentWalletDirectTopUpApprovalEmail,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'admin@unicornsedu.com',
        studentId: 'student-1',
        amount: 500000,
        requestedByEmail: 'care@example.com',
        expiresAt: new Date('2026-05-30T03:00:00.000Z'),
      }),
    );
    const expectedNotificationDraft = expect.objectContaining({
      title: expect.stringContaining('Yêu cầu nạp thẳng ví mới') as unknown,
      message: expect.stringContaining('Nguyen Van A') as unknown,
      targetAll: false,
      targetRoleTypes: [UserRole.admin],
      targetStaffRoles: [StaffRole.admin],
    }) as unknown;
    expect(notificationService.createNotificationDraft).toHaveBeenCalledWith(
      expectedNotificationDraft,
      {
        userId: 'staff-user-1',
        userEmail: 'care@example.com',
        roleType: UserRole.staff,
      },
    );
    expect(notificationService.pushNotification).toHaveBeenCalledWith(
      'notification-1',
      {},
      {
        userId: 'staff-user-1',
        userEmail: 'care@example.com',
        roleType: UserRole.staff,
      },
    );
    jest.useRealTimers();
  });

  it('does not create a direct top-up request when ADMIN_EMAIL is missing', async () => {
    configService.get.mockReturnValue(undefined);
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.assistant],
    });

    await expect(
      service.createStudentWalletDirectTopUpRequest(
        'student-1',
        {
          amount: 500000,
          reason: 'Phụ huynh chuyển khoản ngoài SePay',
        },
        {
          userId: 'staff-user-1',
          userEmail: 'assistant@example.com',
          roleType: UserRole.staff,
        },
      ),
    ).rejects.toThrow('ADMIN_EMAIL');

    expect(
      mockPrisma.studentWalletDirectTopUpRequest.create,
    ).not.toHaveBeenCalled();
    expect(
      mailService.sendStudentWalletDirectTopUpApprovalEmail,
    ).not.toHaveBeenCalled();
  });

  it('does not create a direct top-up request when ADMIN_EMAIL is a placeholder address', async () => {
    configService.get.mockImplementation((key: string) =>
      key === 'ADMIN_EMAIL' ? 'admin@example.com' : undefined,
    );
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.assistant],
    });
    mockPrisma.studentInfo.findUnique.mockResolvedValue({
      id: 'student-1',
      fullName: 'Nguyen Van A',
      accountBalance: 100000,
    });
    mockPrisma.studentWalletDirectTopUpRequest.create.mockResolvedValue({
      id: 'direct-request-1',
      studentId: 'student-1',
      amount: 500000,
      reason: 'Phụ huynh chuyển khoản ngoài SePay',
      status: StudentWalletDirectTopUpRequestStatus.pending,
      tokenHash: 'hashed-token',
      expiresAt: new Date('2026-05-30T03:00:00.000Z'),
      approvedAt: null,
      walletTransactionId: null,
      requestedByUserId: 'staff-user-1',
      requestedByUserEmail: 'assistant@example.com',
      requestedByRoleType: UserRole.staff,
      requestedByStaffRoles: [StaffRole.assistant],
      createdAt: new Date('2026-05-16T03:00:00.000Z'),
      updatedAt: new Date('2026-05-16T03:00:00.000Z'),
      student: {
        id: 'student-1',
        fullName: 'Nguyen Van A',
        accountBalance: 100000,
      },
    });

    await expect(
      service.createStudentWalletDirectTopUpRequest(
        'student-1',
        {
          amount: 500000,
          reason: 'Phụ huynh chuyển khoản ngoài SePay',
        },
        {
          userId: 'staff-user-1',
          userEmail: 'assistant@example.com',
          roleType: UserRole.staff,
        },
      ),
    ).rejects.toThrow('ADMIN_EMAIL');

    expect(
      mockPrisma.studentWalletDirectTopUpRequest.create,
    ).not.toHaveBeenCalled();
    expect(
      mailService.sendStudentWalletDirectTopUpApprovalEmail,
    ).not.toHaveBeenCalled();
  });

  it('cleans up a direct top-up request when approval email sending fails', async () => {
    const loggerWarnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation();
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.assistant],
    });
    mockPrisma.studentInfo.findUnique.mockResolvedValue({
      id: 'student-1',
      fullName: 'Nguyen Van A',
      accountBalance: 100000,
    });
    mockPrisma.studentWalletDirectTopUpRequest.create.mockResolvedValue({
      id: 'direct-request-1',
      studentId: 'student-1',
      amount: 500000,
      reason: 'Phụ huynh chuyển khoản ngoài SePay',
      tokenHash: 'hash',
      expiresAt: new Date('2026-05-30T03:00:00.000Z'),
      status: StudentWalletDirectTopUpRequestStatus.pending,
      approvedAt: null,
      walletTransactionId: null,
      requestedByUserId: 'staff-user-1',
      requestedByUserEmail: 'assistant@example.com',
      requestedByRoleType: UserRole.staff,
      requestedByStaffRoles: [StaffRole.assistant],
      createdAt: new Date('2026-05-16T03:00:00.000Z'),
      updatedAt: new Date('2026-05-16T03:00:00.000Z'),
      student: {
        id: 'student-1',
        fullName: 'Nguyen Van A',
        accountBalance: 100000,
      },
    });
    mailService.sendStudentWalletDirectTopUpApprovalEmail.mockRejectedValue(
      new Error('smtp failed'),
    );

    await expect(
      service.createStudentWalletDirectTopUpRequest(
        'student-1',
        {
          amount: 500000,
          reason: 'Phụ huynh chuyển khoản ngoài SePay',
        },
        {
          userId: 'staff-user-1',
          userEmail: 'assistant@example.com',
          roleType: UserRole.staff,
        },
      ),
    ).rejects.toThrow('smtp failed');

    expect(
      mockPrisma.studentWalletDirectTopUpRequest.delete,
    ).toHaveBeenCalledWith({
      where: { id: 'direct-request-1' },
    });
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Direct top-up approval email failed: requestId=direct-request-1 studentId=student-1',
      ),
    );
    loggerWarnSpy.mockRestore();
  });

  it('lists pending direct top-up requests without expired pending rows', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-16T03:00:00.000Z'));
    mockPrisma.studentWalletDirectTopUpRequest.count.mockResolvedValue(1);
    mockPrisma.studentWalletDirectTopUpRequest.findMany.mockResolvedValue([
      {
        id: 'direct-request-1',
        studentId: 'student-1',
        amount: 500000,
        reason: 'Phụ huynh chuyển khoản ngoài SePay',
        status: StudentWalletDirectTopUpRequestStatus.pending,
        tokenHash: 'hash',
        expiresAt: new Date('2026-05-17T03:00:00.000Z'),
        approvedAt: null,
        walletTransactionId: null,
        requestedByUserId: 'staff-user-1',
        requestedByUserEmail: 'accountant@example.com',
        requestedByRoleType: UserRole.staff,
        requestedByStaffRoles: [StaffRole.accountant],
        createdAt: new Date('2026-05-16T02:00:00.000Z'),
        updatedAt: new Date('2026-05-16T02:00:00.000Z'),
        student: {
          id: 'student-1',
          fullName: 'Nguyen Van A',
          accountBalance: 100000,
        },
      },
    ]);

    await expect(
      service.listStudentWalletDirectTopUpRequests({
        status: StudentWalletDirectTopUpRequestStatus.pending,
        page: 1,
        limit: 20,
      }),
    ).resolves.toMatchObject({
      data: [
        {
          id: 'direct-request-1',
          status: StudentWalletDirectTopUpRequestStatus.pending,
        },
      ],
      meta: {
        total: 1,
        page: 1,
        limit: 20,
      },
    });

    expect(
      mockPrisma.studentWalletDirectTopUpRequest.findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: StudentWalletDirectTopUpRequestStatus.pending,
          expiresAt: { gt: new Date('2026-05-16T03:00:00.000Z') },
        },
        orderBy: [{ createdAt: 'desc' }],
        skip: 0,
        take: 20,
      }),
    );
    jest.useRealTimers();
  });

  it('lists expired direct top-up history including pending rows past expiry', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-16T03:00:00.000Z'));
    mockPrisma.studentWalletDirectTopUpRequest.count.mockResolvedValue(1);
    mockPrisma.studentWalletDirectTopUpRequest.findMany.mockResolvedValue([
      {
        id: 'direct-request-expired',
        studentId: 'student-1',
        amount: 500000,
        reason: 'Quá hạn duyệt',
        status: StudentWalletDirectTopUpRequestStatus.pending,
        tokenHash: 'hash',
        expiresAt: new Date('2026-05-15T03:00:00.000Z'),
        approvedAt: null,
        walletTransactionId: null,
        requestedByUserId: 'staff-user-1',
        requestedByUserEmail: 'accountant@example.com',
        requestedByRoleType: UserRole.staff,
        requestedByStaffRoles: [StaffRole.accountant],
        createdAt: new Date('2026-05-01T03:00:00.000Z'),
        updatedAt: new Date('2026-05-01T03:00:00.000Z'),
        student: {
          id: 'student-1',
          fullName: 'Nguyen Van A',
          accountBalance: 100000,
        },
      },
    ]);

    await expect(
      service.listStudentWalletDirectTopUpRequests({
        status: StudentWalletDirectTopUpRequestStatus.expired,
        page: 2,
        limit: 10,
      }),
    ).resolves.toMatchObject({
      data: [
        {
          id: 'direct-request-expired',
          status: StudentWalletDirectTopUpRequestStatus.expired,
        },
      ],
      meta: {
        total: 1,
        page: 2,
        limit: 10,
      },
    });

    expect(
      mockPrisma.studentWalletDirectTopUpRequest.count,
    ).toHaveBeenCalledWith({
      where: {
        OR: [
          { status: StudentWalletDirectTopUpRequestStatus.expired },
          {
            status: StudentWalletDirectTopUpRequestStatus.pending,
            expiresAt: { lte: new Date('2026-05-16T03:00:00.000Z') },
          },
        ],
      },
    });
    jest.useRealTimers();
  });

  it('gets one direct top-up request by id for the admin approval popup', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-16T03:00:00.000Z'));
    mockPrisma.studentWalletDirectTopUpRequest.findUnique.mockResolvedValue({
      id: 'direct-request-1',
      studentId: 'student-1',
      amount: 500000,
      reason: 'Phụ huynh chuyển khoản ngoài SePay',
      status: StudentWalletDirectTopUpRequestStatus.pending,
      tokenHash: 'hash',
      expiresAt: new Date('2026-05-17T03:00:00.000Z'),
      approvedAt: null,
      walletTransactionId: null,
      requestedByUserId: 'staff-user-1',
      requestedByUserEmail: 'accountant@example.com',
      requestedByRoleType: UserRole.staff,
      requestedByStaffRoles: [StaffRole.accountant],
      createdAt: new Date('2026-05-16T02:00:00.000Z'),
      updatedAt: new Date('2026-05-16T02:00:00.000Z'),
      student: {
        id: 'student-1',
        fullName: 'Nguyen Van A',
        accountBalance: 100000,
      },
    });

    await expect(
      service.getStudentWalletDirectTopUpRequestById('direct-request-1'),
    ).resolves.toMatchObject({
      id: 'direct-request-1',
      studentId: 'student-1',
      studentName: 'Nguyen Van A',
      amount: 500000,
      status: StudentWalletDirectTopUpRequestStatus.pending,
    });
    expect(
      mockPrisma.studentWalletDirectTopUpRequest.findUnique,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'direct-request-1' },
      }),
    );
    jest.useRealTimers();
  });

  it('approves a direct top-up request by request id for admin queue', async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    const studentSnapshot = {
      id: 'student-1',
      fullName: 'Nguyen Van A',
      email: 'student@example.com',
      school: 'THPT Nguyen Du',
      province: 'Hanoi',
      birthYear: 2010,
      parentName: 'Parent A',
      parentPhone: '0900000000',
      parentEmail: 'parent@example.com',
      status: StudentStatus.active,
      gender: 'male',
      goal: 'Top 1',
      accountBalance: 100000,
      createdAt: new Date('2026-03-20T10:00:00.000Z'),
      updatedAt: new Date('2026-03-21T10:00:00.000Z'),
      dropOutDate: null,
      customerCareServices: null,
      studentClasses: [],
      examSchedules: [],
    };
    mockPrisma.studentWalletDirectTopUpRequest.findUnique.mockResolvedValue({
      id: 'direct-request-1',
      studentId: 'student-1',
      amount: 500000,
      reason: 'Phụ huynh chuyển khoản ngoài SePay',
      tokenHash: 'hash',
      expiresAt,
      status: StudentWalletDirectTopUpRequestStatus.pending,
      approvedAt: null,
      walletTransactionId: null,
      requestedByUserEmail: 'accountant@example.com',
      student: {
        id: 'student-1',
        fullName: 'Nguyen Van A',
        accountBalance: 100000,
      },
    });
    mockPrisma.studentWalletDirectTopUpRequest.updateMany.mockResolvedValue({
      count: 1,
    });
    mockPrisma.studentInfo.findUnique.mockResolvedValue(studentSnapshot);
    mockPrisma.walletTransactionsHistory.create.mockResolvedValue({
      id: 'wallet-history-1',
    });
    mockPrisma.studentInfo.update.mockResolvedValue({
      ...studentSnapshot,
      accountBalance: 600000,
    });

    await expect(
      service.approveStudentWalletDirectTopUpRequestById('direct-request-1'),
    ).resolves.toMatchObject({
      status: StudentWalletDirectTopUpRequestStatus.approved,
      balanceAfter: 600000,
    });

    expect(
      mockPrisma.studentWalletDirectTopUpRequest.findUnique,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'direct-request-1' },
      }),
    );
  });

  it('approves a direct top-up request and credits the student wallet once', async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    const studentSnapshot = {
      id: 'student-1',
      fullName: 'Nguyen Van A',
      email: 'student@example.com',
      school: 'THPT Nguyen Du',
      province: 'Hanoi',
      birthYear: 2010,
      parentName: 'Parent A',
      parentPhone: '0900000000',
      parentEmail: 'parent@example.com',
      status: StudentStatus.active,
      gender: 'male',
      goal: 'Top 1',
      accountBalance: 100000,
      createdAt: new Date('2026-03-20T10:00:00.000Z'),
      updatedAt: new Date('2026-03-21T10:00:00.000Z'),
      dropOutDate: null,
      customerCareServices: null,
      studentClasses: [],
      examSchedules: [],
    };
    mockPrisma.studentWalletDirectTopUpRequest.findUnique.mockResolvedValue({
      id: 'direct-request-1',
      studentId: 'student-1',
      amount: 500000,
      reason: 'Phụ huynh chuyển khoản ngoài SePay',
      tokenHash: 'hash',
      expiresAt,
      status: StudentWalletDirectTopUpRequestStatus.pending,
      approvedAt: null,
      walletTransactionId: null,
      requestedByUserEmail: 'accountant@example.com',
      student: {
        id: 'student-1',
        fullName: 'Nguyen Van A',
        accountBalance: 100000,
      },
    });
    mockPrisma.studentWalletDirectTopUpRequest.updateMany.mockResolvedValue({
      count: 1,
    });
    mockPrisma.studentInfo.findUnique.mockResolvedValue(studentSnapshot);
    mockPrisma.walletTransactionsHistory.create.mockResolvedValue({
      id: 'wallet-history-1',
    });
    mockPrisma.studentInfo.update.mockResolvedValue({
      ...studentSnapshot,
      accountBalance: 600000,
    });

    await expect(
      service.approveStudentWalletDirectTopUpRequest(
        'valid-approval-token-value',
      ),
    ).resolves.toMatchObject({
      status: StudentWalletDirectTopUpRequestStatus.approved,
      balanceAfter: 600000,
    });

    const walletCreateMock = mockPrisma.walletTransactionsHistory
      .create as jest.MockedFunction<
      (args: {
        data: {
          studentId: string;
          type: WalletTransactionType;
          amount: number;
        };
      }) => unknown
    >;
    const walletCreateArg = walletCreateMock.mock.calls[0]?.[0];
    expect(walletCreateArg?.data).toMatchObject({
      studentId: 'student-1',
      type: WalletTransactionType.topup,
      amount: 500000,
    });

    const studentUpdateMock = mockPrisma.studentInfo
      .update as jest.MockedFunction<
      (args: {
        where: { id: string };
        data: { accountBalance: { increment: number } };
      }) => unknown
    >;
    const studentUpdateArg = studentUpdateMock.mock.calls[0]?.[0];
    expect(studentUpdateArg).toMatchObject({
      where: { id: 'student-1' },
      data: { accountBalance: { increment: 500000 } },
    });
    expect(actionHistoryService.recordUpdate).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({
        entityType: 'student',
        entityId: 'student-1',
      }),
    );
  });

  it('blocks customer care staff from creating QR orders for unassigned students', async () => {
    sePayService.isWalletTopUpConfigured.mockReturnValue(true);
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.customer_care],
    });
    mockPrisma.customerCareService.findUnique.mockResolvedValue({
      staffId: 'staff-2',
    });

    await expect(
      service.createStudentSePayTopUpOrder(
        'student-1',
        { amount: 500000 },
        {
          userId: 'staff-user-1',
          userEmail: 'care@example.com',
          roleType: UserRole.staff,
        },
      ),
    ).rejects.toThrow('Student not found');

    expect(sePayService.buildStudentWalletOrderCode).not.toHaveBeenCalled();
    expect(mockPrisma.studentWalletSepayOrder.create).not.toHaveBeenCalled();
  });

  it('allows customer care staff to read the detail of their assigned student', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.customer_care],
    });
    mockPrisma.customerCareService.findUnique.mockResolvedValue({
      staffId: 'staff-1',
    });
    mockPrisma.studentInfo.findUnique.mockResolvedValue({
      id: 'student-1',
      fullName: 'Nguyen Van A',
      email: 'student@example.com',
      school: 'THPT Nguyen Du',
      province: 'Hanoi',
      birthYear: 2010,
      parentName: 'Parent A',
      parentPhone: '0900000000',
      parentEmail: 'parent@example.com',
      status: StudentStatus.active,
      gender: 'male',
      goal: 'Top 1',
      accountBalance: 250000,
      createdAt: new Date('2026-03-20T10:00:00.000Z'),
      updatedAt: new Date('2026-03-21T10:00:00.000Z'),
      dropOutDate: null,
      customerCareServices: null,
      studentClasses: [],
    });

    await expect(
      service.getStudentById('student-1', {
        userId: 'user-1',
        roleType: UserRole.staff,
      }),
    ).resolves.toMatchObject({
      id: 'student-1',
      fullName: 'Nguyen Van A',
      parentEmail: 'parent@example.com',
    });
  });

  it('allows income accountant staff to read any student detail without customer care assignment', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.accountant_income],
    });
    mockPrisma.studentInfo.findUnique.mockResolvedValue({
      id: 'student-1',
      fullName: 'Nguyen Van A',
      email: 'student@example.com',
      school: 'THPT Nguyen Du',
      province: 'Hanoi',
      birthYear: 2010,
      parentName: 'Parent A',
      parentPhone: '0900000000',
      parentEmail: 'parent@example.com',
      status: StudentStatus.active,
      gender: 'male',
      goal: 'Top 1',
      accountBalance: 250000,
      createdAt: new Date('2026-03-20T10:00:00.000Z'),
      updatedAt: new Date('2026-03-21T10:00:00.000Z'),
      dropOutDate: null,
      customerCareServices: null,
      studentClasses: [],
    });

    await expect(
      service.getStudentById('student-1', {
        userId: 'user-1',
        roleType: UserRole.staff,
      }),
    ).resolves.toMatchObject({
      id: 'student-1',
      fullName: 'Nguyen Van A',
      parentEmail: 'parent@example.com',
    });

    expect(mockPrisma.customerCareService.findUnique).not.toHaveBeenCalled();
  });

  it('rejects customer care staff when the student is not assigned to them', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.customer_care],
    });
    mockPrisma.customerCareService.findUnique.mockResolvedValue({
      staffId: 'staff-2',
    });

    await expect(
      service.getStudentById('student-1', {
        userId: 'user-1',
        roleType: UserRole.staff,
      }),
    ).rejects.toThrow('Student not found');

    expect(mockPrisma.studentInfo.findUnique).not.toHaveBeenCalled();
  });

  it('allows customer care staff to read wallet history for their assigned student', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.customer_care],
    });
    mockPrisma.customerCareService.findUnique.mockResolvedValue({
      staffId: 'staff-1',
    });
    mockPrisma.studentInfo.findUnique.mockResolvedValue({
      id: 'student-1',
    });
    mockPrisma.walletTransactionsHistory.findMany.mockResolvedValue([
      {
        id: 'wallet-history-1',
        type: WalletTransactionType.topup,
        amount: 500000,
        note: 'NAPVI student-1 class-1',
        date: new Date('2026-03-21T09:00:00.000Z'),
        createdAt: new Date('2026-03-21T09:00:00.000Z'),
      },
    ]);

    await expect(
      service.getStudentWalletHistory(
        'student-1',
        { limit: 20 },
        {
          userId: 'user-1',
          roleType: UserRole.staff,
        },
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'wallet-history-1',
        type: WalletTransactionType.topup,
        amount: 500000,
      }),
    ]);

    expect(mockPrisma.customerCareService.findUnique).toHaveBeenCalledWith({
      where: { studentId: 'student-1' },
      select: { staffId: true },
    });
  });

  it('rejects customer care staff wallet history access for unassigned students', async () => {
    mockPrisma.staffInfo.findUnique.mockResolvedValue({
      id: 'staff-1',
      roles: [StaffRole.customer_care],
    });
    mockPrisma.customerCareService.findUnique.mockResolvedValue({
      staffId: 'staff-2',
    });

    await expect(
      service.getStudentWalletHistory(
        'student-1',
        { limit: 20 },
        {
          userId: 'user-1',
          roleType: UserRole.staff,
        },
      ),
    ).rejects.toThrow('Student not found');

    expect(
      mockPrisma.walletTransactionsHistory.findMany,
    ).not.toHaveBeenCalled();
  });

  it('marks a student inactive and closes active class memberships', async () => {
    mockPrisma.studentInfo.findUnique.mockResolvedValueOnce({
      id: 'student-1',
      status: StudentStatus.active,
      userId: 'user-1',
    });
    mockPrisma.studentInfo.findUnique.mockResolvedValueOnce({
      id: 'student-1',
      fullName: 'Nguyen Van A',
      email: 'student@example.com',
      parentEmail: 'parent@example.com',
      accountBalance: 0,
      school: null,
      province: null,
      status: StudentStatus.inactive,
      gender: 'male',
      birthYear: 2010,
      parentName: null,
      parentPhone: null,
      goal: null,
      dropOutDate: null,
      createdAt: new Date('2026-03-20T10:00:00.000Z'),
      updatedAt: new Date('2026-03-21T10:00:00.000Z'),
      studentClasses: [],
      examSchedules: [],
      customerCareServices: null,
    });
    mockPrisma.studentInfo.findUnique.mockResolvedValueOnce({
      id: 'student-1',
      fullName: 'Nguyen Van A',
      email: 'student@example.com',
      parentEmail: 'parent@example.com',
      accountBalance: 0,
      school: null,
      province: null,
      status: StudentStatus.inactive,
      gender: 'male',
      birthYear: 2010,
      parentName: null,
      parentPhone: null,
      goal: null,
      dropOutDate: null,
      createdAt: new Date('2026-03-20T10:00:00.000Z'),
      updatedAt: new Date('2026-03-21T10:00:00.000Z'),
      studentClasses: [],
      examSchedules: [],
      customerCareServices: null,
    });
    mockPrisma.studentInfo.update.mockResolvedValue({
      id: 'student-1',
      status: StudentStatus.inactive,
    });
    mockPrisma.studentClass.updateMany.mockResolvedValue({ count: 2 });

    await expect(
      service.updateStudentStatus(
        'student-1',
        {
          status: StudentStatus.inactive,
          reason: 'Gia đình báo nghỉ',
        },
        {
          userId: 'assistant-1',
          roleType: UserRole.staff,
        },
      ),
    ).resolves.toMatchObject({
      id: 'student-1',
      status: StudentStatus.inactive,
    });

    expect(mockPrisma.studentClass.updateMany).toHaveBeenCalledWith({
      where: {
        studentId: 'student-1',
        status: 'active',
      },
      data: {
        status: 'inactive',
      },
    });
    expect(authIdentityCacheService.invalidateUser).toHaveBeenCalledWith(
      'user-1',
    );
    expect(actionHistoryService.recordUpdate).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({
        description: 'Chuyển học sinh sang nghỉ học - Lý do: Gia đình báo nghỉ',
      }),
    );
  });

  it('returns sanitized student landing profiles with default active filter', async () => {
    mockPrisma.studentInfo.count.mockResolvedValue(1);
    mockPrisma.studentInfo.findMany.mockResolvedValue([
      {
        id: 'student-1',
        fullName: 'Nguyen Van A',
        school: 'THPT Nguyen Du',
        province: 'Ha Noi',
      },
    ]);

    await expect(service.getLandingProfiles({})).resolves.toEqual({
      total: 1,
      data: [
        {
          id: 'student-1',
          name: 'Nguyen Van A',
          school: 'THPT Nguyen Du',
          province: 'Ha Noi',
        },
      ],
    });

    expect(mockPrisma.studentInfo.count).toHaveBeenCalledWith({
      where: { status: StudentStatus.active },
    });
    expect(mockPrisma.studentInfo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: StudentStatus.active },
        take: 100,
        select: {
          id: true,
          fullName: true,
          school: true,
          province: true,
        },
      }),
    );
  });
});
