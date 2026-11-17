jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));
jest.mock('./session-student-balance.service', () => ({
  SessionStudentBalanceService: class SessionStudentBalanceServiceMock {},
}));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  AttendanceStatus,
  SessionPaymentStatus,
  StaffRole,
  UserRole,
} from '../../generated/enums';
import { SessionValidationService } from './session-validation.service';
import { SessionUpdateService } from './session-update.service';

describe('SessionUpdateService', () => {
  const mockPrisma = {
    user: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(),
    session: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    classTeacher: {
      findUnique: jest.fn(),
    },
    roleTaxDeductionRate: {
      findFirst: jest.fn(),
    },
    staffTaxDeductionOverride: {
      findFirst: jest.fn(),
    },
    studentInfo: {
      findMany: jest.fn(),
    },
    attendance: {
      findMany: jest.fn(),
    },
    staffInfo: {
      findMany: jest.fn(),
    },
  };

  const accessService = {
    resolveClassWorkAccess: jest.fn(),
    resolveClassViewAccessMode: jest.fn().mockResolvedValue('teacher'),
  };
  const workAccess = (
    overrides: Partial<{
      staffId: string | null;
      isAdmin: boolean;
      isClassTeacher: boolean;
      isClassManager: boolean;
    }>,
  ) => ({
    staffId: 'teacher-1',
    isAdmin: false,
    isClassTeacher: false,
    isClassManager: false,
    ...overrides,
  });

  const rosterService = {
    assertAttendanceStudentsBelongToClass: jest.fn(),
  };

  const balanceService = {
    applyBalanceChanges: jest.fn(),
  };

  const ledgerService = {
    getAttendanceChargeAmount: jest.fn(),
    buildChargeNote: jest.fn(),
    buildRefundNote: jest.fn(),
  };

  const snapshotService = {
    getSessionAuditSnapshot: jest.fn(),
    getSessionAuditSnapshots: jest.fn(),
  };

  const actionHistoryService = {
    recordUpdate: jest.fn(),
  };

  let service: SessionUpdateService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mockPrisma) => Promise<unknown>) =>
        callback(mockPrisma),
    );
    mockPrisma.session.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.session.update.mockResolvedValue({ id: 'session-1' });
    mockPrisma.classTeacher.findUnique.mockResolvedValue(null);
    mockPrisma.roleTaxDeductionRate.findFirst.mockResolvedValue(null);
    mockPrisma.staffTaxDeductionOverride.findFirst.mockResolvedValue(null);
    mockPrisma.studentInfo.findMany.mockResolvedValue([]);
    mockPrisma.attendance.findMany.mockResolvedValue([]);
    mockPrisma.staffInfo.findMany.mockResolvedValue([]);
    service = new SessionUpdateService(
      mockPrisma as never,
      accessService as never,
      rosterService as never,
      new SessionValidationService(),
      balanceService as never,
      ledgerService as never,
      snapshotService as never,
      actionHistoryService as never,
      {
        assertTrialAttendanceAllowed: jest.fn(),
        releaseBeforeDelete: jest.fn(),
        reconcile: jest.fn(),
      } as never,
    );
  });

  it('keeps existing tuition for current students and falls back to class tuition for new students', async () => {
    mockPrisma.session.findUnique.mockResolvedValue({
      id: 'session-1',
      classId: 'class-1',
      teacherId: 'teacher-1',
      attendance: [
        {
          studentId: 'student-1',
          tuitionFee: 250000,
        },
      ],
    });
    accessService.resolveClassWorkAccess.mockResolvedValue(
      workAccess({ isClassTeacher: true }),
    );
    rosterService.assertAttendanceStudentsBelongToClass.mockResolvedValue(
      new Map([
        ['student-1', 180000],
        ['student-2', 150000],
      ]),
    );

    const updateSessionSpy = jest
      .spyOn(service, 'updateSession')
      .mockResolvedValue({ id: 'session-1' } as never);

    await service.updateSessionForStaff('user-1', UserRole.staff, 'session-1', {
      coefficient: 0,
      attendance: [
        {
          studentId: 'student-1',
          status: AttendanceStatus.present,
        },
        {
          studentId: 'student-2',
          status: AttendanceStatus.present,
          notes: 'Đi học bù',
        },
      ],
    });

    expect(accessService.resolveClassWorkAccess).toHaveBeenCalledWith(
      'user-1',
      UserRole.staff,
      'class-1',
    );
    expect(updateSessionSpy).toHaveBeenCalledWith(
      {
        id: 'session-1',
        date: undefined,
        startTime: undefined,
        endTime: undefined,
        notes: undefined,
        coefficient: 0,
        attendance: [
          {
            studentId: 'student-1',
            status: AttendanceStatus.present,
            notes: null,
            tuitionFee: 250000,
          },
          {
            studentId: 'student-2',
            status: AttendanceStatus.present,
            notes: 'Đi học bù',
            tuitionFee: 150000,
          },
        ],
      },
      undefined,
    );
  });

  it('rejects a staff-ops Dạy thử change on a paid session', async () => {
    mockPrisma.session.findUnique.mockResolvedValue({
      id: 'session-1',
      classId: 'class-1',
      coefficient: 1,
      teacherPaymentStatus: 'paid',
      attendance: [],
    });
    accessService.resolveClassWorkAccess.mockResolvedValue(
      workAccess({ staffId: null, isAdmin: true }),
    );
    const updateSessionSpy = jest.spyOn(service, 'updateSession');

    await expect(
      service.updateSessionForStaff('user-1', UserRole.staff, 'session-1', {
        coefficient: 0,
      }),
    ).rejects.toThrow(
      'Không thể đổi Dạy thử của buổi đã thanh toán hoặc ghi cọc.',
    );
    expect(updateSessionSpy).not.toHaveBeenCalled();
  });

  it('accepts an unchanged Dạy thử coefficient on a deposit session', async () => {
    mockPrisma.session.findUnique.mockResolvedValue({
      id: 'session-1',
      classId: 'class-1',
      teacherId: 'teacher-1',
      coefficient: 0,
      teacherPaymentStatus: 'deposit',
      attendance: [],
    });
    accessService.resolveClassWorkAccess.mockResolvedValue(
      workAccess({ isClassTeacher: true }),
    );
    const updateSessionSpy = jest
      .spyOn(service, 'updateSession')
      .mockResolvedValue({ id: 'session-1' } as never);

    await service.updateSessionForStaff('user-1', UserRole.staff, 'session-1', {
      coefficient: 0,
    });

    expect(updateSessionSpy).toHaveBeenCalledWith(
      expect.objectContaining({ coefficient: 0 }),
      undefined,
    );
  });

  it('updates only sessions whose payment status actually changes', async () => {
    mockPrisma.session.findMany.mockResolvedValue([
      {
        id: 'session-1',
        classId: 'class-1',
        teacherId: 'teacher-1',
        teacherPaymentStatus: SessionPaymentStatus.unpaid,
      },
      {
        id: 'session-2',
        classId: 'class-1',
        teacherId: 'teacher-1',
        teacherPaymentStatus: SessionPaymentStatus.paid,
      },
    ]);
    mockPrisma.classTeacher.findUnique.mockResolvedValue({
      operatingDeductionRatePercent: 7,
    });
    mockPrisma.roleTaxDeductionRate.findFirst.mockResolvedValue({
      ratePercent: 12,
    });
    mockPrisma.session.updateMany.mockResolvedValue({ count: 1 });
    snapshotService.getSessionAuditSnapshots
      .mockResolvedValueOnce(
        new Map([
          [
            'session-1',
            {
              id: 'session-1',
              teacherPaymentStatus: 'unpaid',
            },
          ],
        ]),
      )
      .mockResolvedValueOnce(
        new Map([
          [
            'session-1',
            {
              id: 'session-1',
              teacherPaymentStatus: 'paid',
            },
          ],
        ]),
      );

    const result = await service.updateSessionPaymentStatuses(
      ['session-1', 'session-2'],
      SessionPaymentStatus.paid,
      {
        userId: 'admin-1',
        userEmail: 'admin@example.com',
        roleType: UserRole.admin,
      },
    );

    expect(mockPrisma.session.updateMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ['session-1'],
        },
      },
      data: {
        teacherPaymentStatus: SessionPaymentStatus.paid,
        teacherOperatingDeductionRatePercent: 7,
        teacherTaxDeductionRatePercent: 12,
      },
    });
    expect(actionHistoryService.recordUpdate).toHaveBeenCalledTimes(1);
    expect(actionHistoryService.recordUpdate).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({
        entityType: 'session',
        entityId: 'session-1',
        description: 'Cập nhật trạng thái thanh toán buổi học',
      }),
    );
    expect(snapshotService.getSessionAuditSnapshots).toHaveBeenNthCalledWith(
      1,
      mockPrisma,
      ['session-1'],
    );
    expect(snapshotService.getSessionAuditSnapshots).toHaveBeenNthCalledWith(
      2,
      mockPrisma,
      ['session-1'],
    );
    expect(result).toEqual({
      requestedCount: 2,
      updatedCount: 1,
    });
  });

  it('snapshots zero deductions when bulk-paying deposit sessions', async () => {
    mockPrisma.session.findMany.mockResolvedValue([
      {
        id: 'session-1',
        classId: 'class-1',
        teacherId: 'teacher-1',
        teacherPaymentStatus: SessionPaymentStatus.deposit,
      },
    ]);
    mockPrisma.session.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.updateSessionPaymentStatuses(
      ['session-1'],
      SessionPaymentStatus.paid,
    );

    expect(mockPrisma.session.updateMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ['session-1'],
        },
      },
      data: {
        teacherPaymentStatus: SessionPaymentStatus.paid,
        teacherOperatingDeductionRatePercent: 0,
        teacherTaxDeductionRatePercent: 0,
      },
    });
    expect(result).toEqual({
      requestedCount: 1,
      updatedCount: 1,
    });
  });

  it('resets deduction snapshots when bulk-moving paid sessions back to unpaid', async () => {
    mockPrisma.session.findMany.mockResolvedValue([
      {
        id: 'session-1',
        classId: 'class-1',
        teacherId: 'teacher-1',
        teacherPaymentStatus: SessionPaymentStatus.paid,
      },
    ]);
    mockPrisma.session.updateMany.mockResolvedValue({ count: 1 });

    await service.updateSessionPaymentStatuses(
      ['session-1'],
      SessionPaymentStatus.unpaid,
    );

    expect(mockPrisma.session.updateMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ['session-1'],
        },
      },
      data: {
        teacherPaymentStatus: SessionPaymentStatus.unpaid,
        teacherOperatingDeductionRatePercent: 0,
        teacherTaxDeductionRatePercent: 0,
      },
    });
  });

  it('snapshots current deduction rates when updating a session payment status to paid', async () => {
    mockPrisma.session.findUnique
      .mockResolvedValueOnce({
        id: 'session-1',
        classId: 'class-1',
        teacherId: 'teacher-1',
        date: new Date('2026-03-15T00:00:00.000Z'),
        teacherPaymentStatus: SessionPaymentStatus.unpaid,
        class: {
          name: 'Toán 10A',
        },
        attendance: [],
      })
      .mockResolvedValueOnce({
        id: 'session-1',
        attendance: [],
      });
    mockPrisma.classTeacher.findUnique.mockResolvedValue({
      operatingDeductionRatePercent: 6,
    });
    mockPrisma.roleTaxDeductionRate.findFirst.mockResolvedValue({
      ratePercent: 11,
    });

    await service.updateSession({
      id: 'session-1',
      teacherPaymentStatus: SessionPaymentStatus.paid,
    });

    expect(mockPrisma.session.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: expect.objectContaining({
        teacherPaymentStatus: SessionPaymentStatus.paid,
        teacherOperatingDeductionRatePercent: 6,
        teacherTaxDeductionRatePercent: 11,
      }),
    });
  });

  it('does not overwrite paid deduction snapshots when paid status is unchanged', async () => {
    mockPrisma.session.findUnique
      .mockResolvedValueOnce({
        id: 'session-1',
        classId: 'class-1',
        teacherId: 'teacher-1',
        date: new Date('2026-03-15T00:00:00.000Z'),
        teacherPaymentStatus: SessionPaymentStatus.paid,
        class: {
          name: 'Toán 10A',
        },
        attendance: [],
      })
      .mockResolvedValueOnce({
        id: 'session-1',
        attendance: [],
      });

    await service.updateSession({
      id: 'session-1',
      teacherPaymentStatus: SessionPaymentStatus.paid,
    });

    const updateArgs = mockPrisma.session.update.mock.calls[0][0];
    expect(updateArgs).toMatchObject({
      where: { id: 'session-1' },
      data: {
        teacherPaymentStatus: SessionPaymentStatus.paid,
      },
    });
    expect(updateArgs.data).not.toHaveProperty(
      'teacherOperatingDeductionRatePercent',
    );
    expect(updateArgs.data).not.toHaveProperty(
      'teacherTaxDeductionRatePercent',
    );
  });

  it('allows updating session with >= 2 students without recordingUrl (recording is optional)', async () => {
    mockPrisma.session.findUnique
      .mockResolvedValueOnce({
        id: 'session-1',
        classId: 'class-1',
        teacherId: 'teacher-1',
        date: new Date('2026-03-15T00:00:00.000Z'),
        teacherPaymentStatus: SessionPaymentStatus.unpaid,
        recordingUrl: null,
        class: { name: 'Toán 10A' },
        attendance: [
          { id: 'att-1', studentId: 'student-1' },
          { id: 'att-2', studentId: 'student-2' },
        ],
      })
      .mockResolvedValueOnce({
        id: 'session-1',
        attendance: [
          { id: 'att-1', studentId: 'student-1' },
          { id: 'att-2', studentId: 'student-2' },
        ],
      });

    await service.updateSession({
      id: 'session-1',
      recordingUrl: '',
    });

    const updateArgs = mockPrisma.session.update.mock.calls[0][0];
    expect(updateArgs).toMatchObject({
      where: { id: 'session-1' },
      data: { recordingUrl: null },
    });
  });

  it('rejects update when payload has startTime but endTime is missing on the session', async () => {
    mockPrisma.session.findUnique.mockResolvedValue({
      id: 'session-1',
      classId: 'class-1',
      teacherId: 'teacher-1',
      date: new Date('2026-03-15T00:00:00.000Z'),
      startTime: null,
      endTime: null,
      teacherPaymentStatus: SessionPaymentStatus.unpaid,
      class: { name: 'Toán 10A' },
      attendance: [],
    });

    await expect(
      service.updateSession({
        id: 'session-1',
        startTime: '19:00:00',
      }),
    ).rejects.toThrow(new BadRequestException('Giờ kết thúc là bắt buộc.'));
  });

  it('rejects update when endTime is not after startTime', async () => {
    mockPrisma.session.findUnique.mockResolvedValue({
      id: 'session-1',
      classId: 'class-1',
      teacherId: 'teacher-1',
      date: new Date('2026-03-15T00:00:00.000Z'),
      startTime: new Date('1970-01-01T19:00:00.000Z'),
      endTime: new Date('1970-01-01T20:30:00.000Z'),
      teacherPaymentStatus: SessionPaymentStatus.unpaid,
      class: { name: 'Toán 10A' },
      attendance: [],
    });

    await expect(
      service.updateSession({
        id: 'session-1',
        startTime: '19:00:00',
        endTime: '18:00:00',
      }),
    ).rejects.toThrow(
      new BadRequestException('Giờ kết thúc phải sau giờ bắt đầu.'),
    );
  });

  it('rejects changing times on a paid session', async () => {
    mockPrisma.session.findUnique.mockResolvedValue({
      id: 'session-1',
      classId: 'class-1',
      teacherId: 'teacher-1',
      date: new Date('2026-03-15T00:00:00.000Z'),
      startTime: new Date('1970-01-01T19:00:00.000Z'),
      endTime: new Date('1970-01-01T20:30:00.000Z'),
      teacherPaymentStatus: SessionPaymentStatus.paid,
      class: { name: 'Toán 10A' },
      attendance: [],
    });

    await expect(
      service.updateSession({
        id: 'session-1',
        startTime: '18:00:00',
        endTime: '19:30:00',
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'Không thể sửa giờ buổi đã thanh toán hoặc ghi cọc.',
      ),
    );
  });

  it('rejects changing times on a deposit session', async () => {
    mockPrisma.session.findUnique.mockResolvedValue({
      id: 'session-1',
      classId: 'class-1',
      teacherId: 'teacher-1',
      date: new Date('2026-03-15T00:00:00.000Z'),
      startTime: new Date('1970-01-01T19:00:00.000Z'),
      endTime: new Date('1970-01-01T20:30:00.000Z'),
      teacherPaymentStatus: SessionPaymentStatus.deposit,
      class: { name: 'Toán 10A' },
      attendance: [],
    });

    await expect(
      service.updateSession({
        id: 'session-1',
        startTime: '18:00:00',
        endTime: '19:30:00',
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'Không thể sửa giờ buổi đã thanh toán hoặc ghi cọc.',
      ),
    );
  });

  it('forbids a teacher from updating a session taught by another teacher', async () => {
    mockPrisma.session.findUnique.mockResolvedValue({
      id: 'session-2',
      classId: 'class-1',
      teacherId: 'teacher-other',
      attendance: [],
    });
    accessService.resolveClassWorkAccess.mockResolvedValue(
      workAccess({ isClassTeacher: true }),
    );
    const updateSessionSpy = jest.spyOn(service, 'updateSession');

    await expect(
      service.updateSessionForStaff('user-1', UserRole.staff, 'session-2', {
        lessonContent: 'Sửa trộm',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(updateSessionSpy).not.toHaveBeenCalled();
  });

  describe('#275 Quản lý lớp trên staff-ops', () => {
    const otherTeacherSession = {
      id: 'session-2',
      classId: 'class-1',
      teacherId: 'teacher-other',
      coefficient: 1,
      teacherPaymentStatus: 'unpaid',
      attendance: [],
    };

    it('lets Quản lý lớp edit content and attendance of another teacher session', async () => {
      mockPrisma.session.findUnique.mockResolvedValue(otherTeacherSession);
      accessService.resolveClassWorkAccess.mockResolvedValue(
        workAccess({ staffId: 'manager-1', isClassManager: true }),
      );
      rosterService.assertAttendanceStudentsBelongToClass.mockResolvedValue(
        new Map([['student-1', 150000]]),
      );
      const updateSessionSpy = jest
        .spyOn(service, 'updateSession')
        .mockResolvedValue({ id: 'session-2' } as never);

      await service.updateSessionForStaff(
        'user-9',
        UserRole.staff,
        'session-2',
        {
          lessonContent: '<p>Nội dung</p>',
          attendance: [
            { studentId: 'student-1', status: AttendanceStatus.present },
          ],
        },
      );

      expect(updateSessionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'session-2',
          lessonContent: '<p>Nội dung</p>',
        }),
        undefined,
      );
    });

    it('lets a teacher who is also Quản lý lớp edit another teacher session (hợp quyền)', async () => {
      mockPrisma.session.findUnique.mockResolvedValue(otherTeacherSession);
      accessService.resolveClassWorkAccess.mockResolvedValue(
        workAccess({ isClassTeacher: true, isClassManager: true }),
      );
      const updateSessionSpy = jest
        .spyOn(service, 'updateSession')
        .mockResolvedValue({ id: 'session-2' } as never);

      await service.updateSessionForStaff(
        'user-1',
        UserRole.staff,
        'session-2',
        { notes: 'Ghi chú' },
      );

      expect(updateSessionSpy).toHaveBeenCalled();
    });

    it.each([
      ['đánh dấu Dạy thử', 0],
      ['đổi hệ số', 0.5],
    ])(
      'forbids Quản lý lớp to %s on another teacher session',
      async (_label, coefficient) => {
        mockPrisma.session.findUnique.mockResolvedValue(otherTeacherSession);
        accessService.resolveClassWorkAccess.mockResolvedValue(
          workAccess({ staffId: 'manager-1', isClassManager: true }),
        );
        const updateSessionSpy = jest.spyOn(service, 'updateSession');

        await expect(
          service.updateSessionForStaff('user-9', UserRole.staff, 'session-2', {
            coefficient,
          }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(updateSessionSpy).not.toHaveBeenCalled();
      },
    );

    it('accepts an unchanged coefficient sent back by Quản lý lớp', async () => {
      mockPrisma.session.findUnique.mockResolvedValue(otherTeacherSession);
      accessService.resolveClassWorkAccess.mockResolvedValue(
        workAccess({ staffId: 'manager-1', isClassManager: true }),
      );
      const updateSessionSpy = jest
        .spyOn(service, 'updateSession')
        .mockResolvedValue({ id: 'session-2' } as never);

      await service.updateSessionForStaff(
        'user-9',
        UserRole.staff,
        'session-2',
        { coefficient: 1, notes: 'x' },
      );

      expect(updateSessionSpy).toHaveBeenCalled();
    });

    it('rejects staff not assigned to the class (403 from resolveClassWorkAccess)', async () => {
      mockPrisma.session.findUnique.mockResolvedValue(otherTeacherSession);
      accessService.resolveClassWorkAccess.mockRejectedValue(
        new ForbiddenException(
          'Chỉ Admin, gia sư của lớp hoặc Quản lý lớp mới được thao tác trên lớp này.',
        ),
      );
      const updateSessionSpy = jest.spyOn(service, 'updateSession');

      await expect(
        service.updateSessionForStaff('user-9', UserRole.staff, 'session-2', {
          notes: 'x',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(updateSessionSpy).not.toHaveBeenCalled();
    });
  });

  describe('assertAdminRouteUpdateAllowed (#265 trên PUT /sessions/:id)', () => {
    it('forbids Kế toán chi editing compensation of their own session', async () => {
      mockPrisma.session.findUnique.mockResolvedValue({
        teacherId: 'staff-acc',
      });
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        roleType: UserRole.staff,
        staffInfo: { id: 'staff-acc', roles: [StaffRole.accountant_expense] },
      });

      await expect(
        service.assertAdminRouteUpdateAllowed(
          { id: 'session-1', allowanceAmount: 1 } as never,
          { userId: 'user-acc', roleType: UserRole.staff } as never,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows Kế toán chi editing compensation of another teacher session', async () => {
      mockPrisma.session.findUnique.mockResolvedValue({
        teacherId: 'teacher-1',
      });
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        roleType: UserRole.staff,
        staffInfo: { id: 'staff-acc', roles: [StaffRole.accountant_expense] },
      });

      await expect(
        service.assertAdminRouteUpdateAllowed(
          { id: 'session-1', allowanceAmount: 1 } as never,
          { userId: 'user-acc', roleType: UserRole.staff } as never,
        ),
      ).resolves.toBeUndefined();
    });

    it('skips the lookup when the payload does not touch compensation', async () => {
      await service.assertAdminRouteUpdateAllowed(
        { id: 'session-1', notes: 'x' } as never,
        { userId: 'user-acc', roleType: UserRole.staff } as never,
      );
      expect(mockPrisma.session.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('snapshot người chăm sóc khi sửa điểm danh', () => {
    const extraTx = () => {
      const upsert = jest.fn().mockResolvedValue({});
      Object.assign(mockPrisma, {
        attendance: {
          findMany: jest.fn().mockResolvedValue([]),
          upsert,
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        class: { findUnique: jest.fn().mockResolvedValue(null) },
        classScheduleEntry: { findMany: jest.fn().mockResolvedValue([]) },
        customerCareService: {
          findMany: jest.fn().mockResolvedValue([
            { studentId: 'student-1', profitPercent: 0.2, staffId: 'care-new' },
            { studentId: 'student-2', profitPercent: 0.3, staffId: 'care-new' },
          ]),
        },
        studentClass: {
          findMany: jest.fn(
            ({ where }: { where: { studentId: { in: string[] } } }) =>
              Promise.resolve(
                where.studentId.in.map((studentId) => ({
                  studentId,
                  customStudentTuitionPerSession: 200000,
                  class: {
                    pricingMode: null,
                    studentTuitionPerSession: 200000,
                  },
                })),
              ),
          ),
        },
        walletTransactionsHistory: {
          createMany: jest.fn().mockResolvedValue({ count: 0 }),
          createManyAndReturn: jest.fn().mockResolvedValue([]),
        },
      });
      mockPrisma.session.findMany.mockResolvedValue([]);
      ledgerService.getAttendanceChargeAmount.mockReturnValue(0);
      snapshotService.getSessionAuditSnapshot.mockResolvedValue(null);
      return upsert;
    };

    it('giữ CSKH đã chụp của dòng cũ, chỉ chụp CSKH hiện hành cho dòng mới', async () => {
      const upsert = extraTx();
      const existingSession = {
        id: 'session-1',
        classId: 'class-1',
        teacherId: 'teacher-1',
        date: new Date('2026-03-15T00:00:00.000Z'),
        teacherPaymentStatus: SessionPaymentStatus.unpaid,
        class: { name: 'Toán 10A' },
        attendance: [
          {
            id: 'att-1',
            studentId: 'student-1',
            status: AttendanceStatus.excused,
            tuitionFee: 200000,
            customerCareStaffId: 'care-old',
            customerCareCoef: 0.1,
            customerCarePaymentStatus: 'pending',
            saleCsHeadStaffId: null,
            saleCsHeadPaymentStatus: null,
            transactionId: null,
          },
        ],
      };
      mockPrisma.session.findUnique.mockResolvedValue(existingSession);
      rosterService.assertAttendanceStudentsBelongToClass.mockResolvedValue(
        new Map([
          ['student-1', 200000],
          ['student-2', 200000],
        ]),
      );

      await service.updateSession({
        id: 'session-1',
        attendance: [
          {
            studentId: 'student-1',
            status: AttendanceStatus.excused,
            notes: 'Ốm',
          },
          {
            studentId: 'student-2',
            status: AttendanceStatus.excused,
            notes: 'Ốm',
          },
        ],
      });

      const byStudent = new Map(
        upsert.mock.calls.map(([args]) => [args.create.studentId, args]),
      );
      const oldRow = byStudent.get('student-1');
      expect(oldRow.update.customerCareStaffId).toBeUndefined();
      expect(oldRow.update.customerCareCoef).toBeUndefined();
      expect(oldRow.update.customerCarePaymentStatus).toBeUndefined();
      const newRow = byStudent.get('student-2');
      expect(newRow.create.customerCareStaffId).toBe('care-new');
    });

    it('chụp lại CSKH khi dòng cũ đổi từ vắng (không tính phí) sang vắng có phép (tính phí)', async () => {
      const upsert = extraTx();
      mockPrisma.session.findUnique.mockResolvedValue({
        id: 'session-1',
        classId: 'class-1',
        teacherId: 'teacher-1',
        date: new Date('2026-03-15T00:00:00.000Z'),
        teacherPaymentStatus: SessionPaymentStatus.unpaid,
        class: { name: 'Toán 10A' },
        attendance: [
          {
            id: 'att-1',
            studentId: 'student-1',
            status: AttendanceStatus.absent,
            tuitionFee: null,
            customerCareStaffId: null,
            customerCareCoef: null,
            customerCarePaymentStatus: null,
            saleCsHeadStaffId: null,
            saleCsHeadPaymentStatus: null,
            transactionId: null,
          },
        ],
      });
      rosterService.assertAttendanceStudentsBelongToClass.mockResolvedValue(
        new Map([['student-1', 200000]]),
      );

      await service.updateSession({
        id: 'session-1',
        attendance: [
          {
            studentId: 'student-1',
            status: AttendanceStatus.excused,
            notes: 'Ốm',
          },
        ],
      });

      const [[args]] = upsert.mock.calls;
      expect(args.update.customerCareStaffId).toBe('care-new');
    });
  });

  describe('Trưởng ban Đào tạo chỉnh tay trợ cấp / Dạy thử / Học thử (14/11)', () => {
    const headUser = {
      roleType: UserRole.staff,
      staffInfo: { id: 'head-1', roles: [StaffRole.training_head] },
    };
    const baseSession = {
      id: 'session-1',
      classId: 'class-1',
      teacherId: 'teacher-1',
      snapshotNoAttendance: false,
      snapshotBlockCount: null,
      coefficient: 1,
      allowanceAmount: 100000,
      teacherPaymentStatus: SessionPaymentStatus.unpaid,
      attendance: [
        {
          studentId: 'st1',
          status: AttendanceStatus.present,
          notes: 'Ghi chú',
          tuitionFee: 200000,
          testCorrectCount: 8,
          testComment: null,
          strengths: 'Tốt',
          improvements: null,
          homeworkQuality: null,
          homeworkComment: null,
        },
        {
          studentId: 'st2',
          status: AttendanceStatus.trial,
          notes: null,
          tuitionFee: null,
          testCorrectCount: null,
          testComment: null,
          strengths: null,
          improvements: null,
          homeworkQuality: null,
          homeworkComment: null,
        },
      ],
    };

    it('sửa trợ cấp + Dạy thử, response ẩn học phí', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(headUser);
      mockPrisma.session.findUnique.mockResolvedValueOnce(baseSession);
      const updateSessionSpy = jest
        .spyOn(service, 'updateSession')
        .mockResolvedValue({
          id: 'session-1',
          allowanceAmount: 150000,
          coefficient: 0,
          tuitionFee: 400000,
        } as never);

      const result = (await service.updateSessionAsTrainingHead(
        'user-head',
        UserRole.staff,
        'session-1',
        { allowanceAmount: 150000, coefficient: 0 },
      )) as Record<string, unknown>;

      expect(updateSessionSpy).toHaveBeenCalledWith(
        {
          id: 'session-1',
          coefficient: 0,
          allowanceAmount: 150000,
          attendance: undefined,
        },
        undefined,
        { skipRequired: true },
      );
      expect(result.allowanceAmount).toBe(150000);
      expect(result).not.toHaveProperty('tuitionFee');
    });

    it('tick Học thử: gửi lại đủ học sinh, giữ ghi chú + nhận xét, học phí theo trạng thái mới', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(headUser);
      mockPrisma.session.findUnique.mockResolvedValueOnce(baseSession);
      rosterService.assertAttendanceStudentsBelongToClass.mockResolvedValue(
        new Map([
          ['st1', 180000],
          ['st2', 180000],
        ]),
      );
      const updateSessionSpy = jest
        .spyOn(service, 'updateSession')
        .mockResolvedValue({ id: 'session-1' } as never);

      await service.updateSessionAsTrainingHead(
        'user-head',
        UserRole.staff,
        'session-1',
        {
          attendance: [
            { studentId: 'st1', status: AttendanceStatus.trial },
            { studentId: 'st2', status: AttendanceStatus.present },
          ],
        },
      );

      const payload = updateSessionSpy.mock.calls[0][0];
      expect(payload).not.toHaveProperty('allowanceAmount');
      expect(payload).not.toHaveProperty('coefficient');
      expect(payload.attendance).toEqual([
        expect.objectContaining({
          studentId: 'st1',
          status: AttendanceStatus.trial,
          notes: 'Ghi chú',
          testCorrectCount: 8,
          strengths: 'Tốt',
          tuitionFee: null,
        }),
        expect.objectContaining({
          studentId: 'st2',
          status: AttendanceStatus.present,
          tuitionFee: 180000,
        }),
      ]);
    });

    it('chặn đổi có mặt → vắng', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(headUser);
      mockPrisma.session.findUnique.mockResolvedValueOnce(baseSession);
      const updateSessionSpy = jest.spyOn(service, 'updateSession');

      await expect(
        service.updateSessionAsTrainingHead(
          'user-head',
          UserRole.staff,
          'session-1',
          {
            attendance: [{ studentId: 'st1', status: AttendanceStatus.absent }],
          },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(updateSessionSpy).not.toHaveBeenCalled();
    });

    it('chặn sửa buổi do chính mình dạy (#265)', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(headUser);
      mockPrisma.session.findUnique.mockResolvedValueOnce({
        ...baseSession,
        teacherId: 'head-1',
      });

      await expect(
        service.updateSessionAsTrainingHead(
          'user-head',
          UserRole.staff,
          'session-1',
          {
            allowanceAmount: 999999,
          },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('chặn đổi trợ cấp buổi đã thanh toán', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(headUser);
      mockPrisma.session.findUnique.mockResolvedValueOnce({
        ...baseSession,
        teacherPaymentStatus: SessionPaymentStatus.paid,
      });

      await expect(
        service.updateSessionAsTrainingHead(
          'user-head',
          UserRole.staff,
          'session-1',
          {
            allowanceAmount: 120000,
          },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('Quản lý lớp thường (không phải Trưởng ban) bị 403', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        roleType: UserRole.staff,
        staffInfo: { id: 'tm-1', roles: [StaffRole.training] },
      });

      await expect(
        service.updateSessionAsTrainingHead(
          'user-tm',
          UserRole.staff,
          'session-1',
          {
            allowanceAmount: 120000,
          },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.session.findUnique).not.toHaveBeenCalled();
    });

    it('không có thay đổi → 400', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(headUser);
      mockPrisma.session.findUnique.mockResolvedValueOnce(baseSession);

      await expect(
        service.updateSessionAsTrainingHead(
          'user-head',
          UserRole.staff,
          'session-1',
          {
            allowanceAmount: 100000,
            coefficient: 1,
            attendance: [{ studentId: 'st2', status: AttendanceStatus.trial }],
          },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
