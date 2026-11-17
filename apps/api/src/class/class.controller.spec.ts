jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

import { ForbiddenException } from '@nestjs/common';
import { StaffRole, UserRole } from 'generated/enums';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { ClassController } from './class.controller';

/**
 * #272: response route admin của lớp bỏ lương gia sư với Trưởng phòng Sale &
 * CSKH (giữ Học phí lớp), Admin thấy đủ.
 */
describe('ClassController #272 redaction', () => {
  const classDetail = () => ({
    id: 'class-1',
    name: 'Toán 9',
    studentTuitionPerSession: 180000,
    tuitionPackageTotal: 2000000,
    allowancePerSessionPerStudent: 90000,
    scaleAmount: 10000,
    trainingManagerRatePercent: 5,
    teachers: [
      {
        id: 'teacher-1',
        customAllowance: 100000,
        operatingDeductionRatePercent: 10,
      },
    ],
    students: [
      {
        id: 'student-1',
        customTuitionPerSession: 150000,
        accountBalance: 500000,
      },
    ],
  });

  const classService = {
    getClassById: jest.fn(),
    getStudentsByClassId: jest.fn(),
    updateClassTuition: jest.fn(),
    updateClassStudentTuition: jest.fn(),
    updateClassBasicInfo: jest.fn(),
    updateClassTeacherCompensation: jest.fn(),
  };
  const staffOperationsAccess = {
    resolveClassTeacherManagerScope: jest.fn(),
  };
  const controller = new ClassController(
    classService as never,
    {} as never,
    {} as never,
    staffOperationsAccess as never,
  );

  const user = (roleType: UserRole): JwtPayload => ({
    id: 'user-1',
    email: 'user@example.com',
    accountHandle: 'user',
    roleType,
  });
  const req = (staffRoles: StaffRole[]) =>
    ({ resolvedStaffRoles: staffRoles }) as never;

  const headUser = user(UserRole.staff);
  const headReq = req([StaffRole.sale_customer_care_head]);

  beforeEach(() => {
    jest.clearAllMocks();
    classService.getClassById.mockResolvedValue(classDetail());
    classService.updateClassTuition.mockResolvedValue(classDetail());
    classService.updateClassStudentTuition.mockResolvedValue(classDetail());
    classService.updateClassBasicInfo.mockResolvedValue(classDetail());
    classService.updateClassTeacherCompensation.mockResolvedValue(
      classDetail(),
    );
    classService.getStudentsByClassId.mockResolvedValue([
      {
        studentId: 'student-1',
        customStudentTuitionPerSession: 150000,
        student: { id: 'student-1', fullName: 'HS 1', accountBalance: 500000 },
      },
    ]);
  });

  const expectNoTeacherPay = (result: Record<string, unknown>) => {
    expect(result).not.toHaveProperty('allowancePerSessionPerStudent');
    expect(result).not.toHaveProperty('scaleAmount');
    expect(result).not.toHaveProperty('trainingManagerRatePercent');
    expect(result.teachers).toEqual([{ id: 'teacher-1' }]);
    expect(result).toHaveProperty('studentTuitionPerSession', 180000);
    expect(result).toHaveProperty('tuitionPackageTotal', 2000000);
  };

  it('Trưởng phòng xem chi tiết lớp không có lương gia sư', async () => {
    const result = await controller.getClassById(headUser, headReq, 'class-1');
    expectNoTeacherPay(result as Record<string, unknown>);
  });

  it('Trưởng phòng sửa Học phí lớp: response không có lương gia sư', async () => {
    const result = await controller.updateClassTuition(
      headUser,
      headReq,
      'class-1',
      { tuition_package_total: 2000000 },
    );
    expect(classService.updateClassTuition).toHaveBeenCalledWith(
      'class-1',
      { tuition_package_total: 2000000 },
      expect.objectContaining({ userId: 'user-1' }),
    );
    expectNoTeacherPay(result as Record<string, unknown>);
  });

  it('Kế toán thu sửa học phí riêng: response không có lương gia sư', async () => {
    const result = await controller.updateClassStudentTuition(
      user(UserRole.staff),
      req([StaffRole.accountant_income]),
      'class-1',
      { student_id: 'student-1', custom_tuition_per_session: 150000 },
    );
    expectNoTeacherPay(result as Record<string, unknown>);
  });

  it('Admin thấy đủ lương gia sư', async () => {
    const result = await controller.getClassById(
      user(UserRole.admin),
      req([]),
      'class-1',
    );
    expect(result).toEqual(classDetail());
  });

  // #277: Trưởng ban Đào tạo không thấy học phí → cũng không thấy số dư ví.
  it('Trưởng ban Đào tạo xem chi tiết lớp: không học phí, không số dư ví', async () => {
    const result = (await controller.getClassById(
      user(UserRole.staff),
      req([StaffRole.training_head]),
      'class-1',
    )) as unknown as Record<string, unknown> & {
      students: Record<string, unknown>[];
    };
    expect(result).not.toHaveProperty('studentTuitionPerSession');
    expect(result.students[0]).not.toHaveProperty('accountBalance');
    expect(result).toHaveProperty('allowancePerSessionPerStudent', 90000);
  });

  it('Kế toán chi vẫn giữ số dư ví (ngoài phạm vi #277)', async () => {
    const result = (await controller.getClassById(
      user(UserRole.staff),
      req([StaffRole.accountant_expense]),
      'class-1',
    )) as unknown as { students: Record<string, unknown>[] };
    expect(result.students[0]).toHaveProperty('accountBalance', 500000);
  });

  describe('follow-up grill 13/11 — số dư ví trên danh sách học sinh', () => {
    type StudentRow = { student: Record<string, unknown> } & Record<
      string,
      unknown
    >;

    it('Trưởng ban Đào tạo gọi GET /class/:id/students: không có số dư ví', async () => {
      const rows = (await controller.getStudentsByClassId(
        user(UserRole.staff),
        req([StaffRole.training_head]),
        'class-1',
      )) as unknown as StudentRow[];
      expect(rows[0].student).not.toHaveProperty('accountBalance');
      expect(rows[0].student).toHaveProperty('fullName', 'HS 1');
    });

    it.each([
      ['Kế toán chi', [StaffRole.accountant_expense]],
      ['Kế toán thu', [StaffRole.accountant_income]],
      ['Trưởng phòng Sale & CSKH', [StaffRole.sale_customer_care_head]],
    ])(
      '%s gọi GET /class/:id/students: giữ số dư ví',
      async (_label, roles) => {
        const rows = (await controller.getStudentsByClassId(
          user(UserRole.staff),
          req(roles),
          'class-1',
        )) as unknown as StudentRow[];
        expect(rows[0].student).toHaveProperty('accountBalance', 500000);
      },
    );

    it('Admin gọi GET /class/:id/students: giữ số dư ví', async () => {
      const rows = (await controller.getStudentsByClassId(
        user(UserRole.admin),
        req([]),
        'class-1',
      )) as unknown as StudentRow[];
      expect(rows[0].student).toHaveProperty('accountBalance', 500000);
    });

    it('Trưởng ban Đào tạo kiêm Kế toán chi: hợp quyền → thấy số dư ví', async () => {
      const result = (await controller.getClassById(
        user(UserRole.staff),
        req([StaffRole.training_head, StaffRole.accountant_expense]),
        'class-1',
      )) as unknown as { students: Record<string, unknown>[] };
      expect(result.students[0]).toHaveProperty('accountBalance', 500000);
    });

    it('Trưởng ban Đào tạo sửa Thông tin lớp: response không có số dư ví', async () => {
      const result = (await controller.updateClassBasicInfo(
        user(UserRole.staff),
        req([StaffRole.training_head]),
        'class-1',
        { name: 'Toán 9A' },
      )) as unknown as { students: Record<string, unknown>[] };
      expect(result.students[0]).not.toHaveProperty('accountBalance');
    });
  });

  describe('follow-up grill 13/11 — Kế toán chi chỉ xem lương gia sư theo lớp', () => {
    const dto = {
      teachers: [{ teacher_id: 'teacher-1', custom_allowance: 120000 }],
    };

    it('Kế toán chi thuần sửa teacher-compensation → 403, không ghi', async () => {
      staffOperationsAccess.resolveClassTeacherManagerScope.mockRejectedValue(
        new ForbiddenException(
          'Chỉ Admin, Trưởng ban Đào tạo hoặc Quản lý lớp',
        ),
      );
      await expect(
        controller.updateClassTeacherCompensation(
          user(UserRole.staff),
          req([StaffRole.accountant_expense]),
          'class-1',
          dto as never,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(
        staffOperationsAccess.resolveClassTeacherManagerScope,
      ).toHaveBeenCalledWith('user-1', UserRole.staff, 'class-1');
      expect(
        classService.updateClassTeacherCompensation,
      ).not.toHaveBeenCalled();
    });

    it('Kế toán chi kiêm Trưởng ban Đào tạo: hợp quyền → được sửa', async () => {
      staffOperationsAccess.resolveClassTeacherManagerScope.mockResolvedValue({
        lockedTeacherId: 'staff-1',
        isAdmin: false,
        isClassManager: false,
        isTrainingHead: true,
      });
      const result = (await controller.updateClassTeacherCompensation(
        user(UserRole.staff),
        req([StaffRole.accountant_expense, StaffRole.training_head]),
        'class-1',
        dto as never,
      )) as unknown as Record<string, unknown>;
      expect(classService.updateClassTeacherCompensation).toHaveBeenCalledWith(
        'class-1',
        dto,
        expect.objectContaining({ userId: 'user-1' }),
      );
      // Hợp quyền expense + training_head: vẫn không thấy học phí.
      expect(result).not.toHaveProperty('studentTuitionPerSession');
    });

    it('Admin sửa teacher-compensation được', async () => {
      staffOperationsAccess.resolveClassTeacherManagerScope.mockResolvedValue({
        lockedTeacherId: null,
        isAdmin: true,
        isClassManager: false,
        isTrainingHead: false,
      });
      await controller.updateClassTeacherCompensation(
        user(UserRole.admin),
        req([]),
        'class-1',
        dto as never,
      );
      expect(classService.updateClassTeacherCompensation).toHaveBeenCalled();
    });
  });
});
