import { StaffRole, UserRole } from 'generated/enums';
import {
  canSeeClassStudentContactsOnAdminRoutes,
  canSeeClassStudentWalletOnAdminRoutes,
  redactClassForAccountantView,
  redactClassForTrainingManagerView,
  redactClassStudentContacts,
  redactClassStudentWalletBalances,
  redactOtherTeachersIncome,
  redactOtherTeachersSessions,
  redactSessionForTrainingHeadView,
  redactSessionForTrainingManagerView,
  redactSessionsForAccountantView,
  redactStudentClassRowsContacts,
  redactStudentClassRowsWalletBalance,
  resolveAccountantFinanceView,
  resolveAdminClassFinanceView,
} from './accountant-finance-redaction.util';

describe('resolveAccountantFinanceView', () => {
  it('resolves split accountant roles independently', () => {
    expect(
      resolveAccountantFinanceView(UserRole.staff, [
        StaffRole.accountant_income,
      ]),
    ).toBe('income');
    expect(
      resolveAccountantFinanceView(UserRole.staff, [
        StaffRole.accountant_expense,
      ]),
    ).toBe('expense');
  });

  it('gives combined income and expense accountants full finance view', () => {
    expect(
      resolveAccountantFinanceView(UserRole.staff, [
        StaffRole.accountant_income,
        StaffRole.accountant_expense,
      ]),
    ).toBe('full');
  });

  it('keeps admin and assistant on full finance view', () => {
    expect(resolveAccountantFinanceView(UserRole.admin, [])).toBe('full');
    expect(
      resolveAccountantFinanceView(UserRole.staff, [
        StaffRole.sale_customer_care_head,
      ]),
    ).toBe('full');
  });
});

describe('redactClassStudentWalletBalances', () => {
  const classDetail = {
    id: 'UNICL-1',
    students: [
      { id: 'UNIST-a', fullName: 'A', accountBalance: 100_000 },
      { id: 'UNIST-b', fullName: 'B', accountBalance: -50_000 },
    ],
  };

  it('keeps all balances in full mode', () => {
    expect(
      redactClassStudentWalletBalances(classDetail, { mode: 'full' }),
    ).toEqual(classDetail);
  });

  it('strips all balances in none mode', () => {
    const redacted = redactClassStudentWalletBalances(classDetail, {
      mode: 'none',
    });
    expect(redacted.students[0]).not.toHaveProperty('accountBalance');
    expect(redacted.students[1]).not.toHaveProperty('accountBalance');
    expect(redacted.students[0].fullName).toBe('A');
  });

  it('keeps only allowlisted student balances', () => {
    const redacted = redactClassStudentWalletBalances(classDetail, {
      mode: 'allowlist',
      allowedStudentIds: new Set(['UNIST-a']),
    });
    expect(redacted.students[0].accountBalance).toBe(100_000);
    expect(redacted.students[1]).not.toHaveProperty('accountBalance');
  });
});

describe('redactOtherTeachersIncome', () => {
  const classRecord = {
    id: 'class-1',
    allowancePerSessionPerStudent: 200_000,
    teachers: [
      {
        id: 'teacher-self',
        fullName: 'Self',
        customAllowance: 250_000,
        customScaleAmount: 0,
        operatingDeductionRatePercent: 5,
        taxRatePercent: 10,
      },
      {
        id: 'teacher-other',
        fullName: 'Other',
        customAllowance: 300_000,
        customScaleAmount: 50_000,
        operatingDeductionRatePercent: 7,
        taxRatePercent: 10,
      },
    ],
  };

  it('keeps the viewer income fields and strips other teachers', () => {
    const redacted = redactOtherTeachersIncome(classRecord, 'teacher-self');

    expect(redacted.teachers[0]).toEqual(classRecord.teachers[0]);
    expect(redacted.teachers[1]).toEqual({
      id: 'teacher-other',
      fullName: 'Other',
    });
    expect(redacted.allowancePerSessionPerStudent).toBe(200_000);
  });

  it('does not mutate the input record', () => {
    redactOtherTeachersIncome(classRecord, 'teacher-self');

    expect(classRecord.teachers[1].customAllowance).toBe(300_000);
  });
});

describe('redactClassForTrainingManagerView', () => {
  const classRecord = {
    id: 'class-1',
    allowancePerSessionPerStudent: 100_000,
    maxAllowancePerSession: 500_000,
    scaleAmount: 20_000,
    studentTuitionPerSession: 250_000,
    studentTuitionPerBlock: 250_000,
    tuitionPackageTotal: 3_000_000,
    teachers: [
      {
        id: 'teacher-1',
        customAllowance: 120_000,
        customScaleAmount: 10_000,
        operatingDeductionRatePercent: 5,
      },
    ],
    students: [
      {
        id: 'student-1',
        customTuitionPerSession: 200_000,
        accountBalance: 1_000_000,
      },
    ],
  };

  it('keeps teacher pay but strips tuition and student wallets', () => {
    const result = redactClassForTrainingManagerView(classRecord);

    expect(result).toMatchObject({
      allowancePerSessionPerStudent: 100_000,
      maxAllowancePerSession: 500_000,
      scaleAmount: 20_000,
      teachers: [
        {
          customAllowance: 120_000,
          customScaleAmount: 10_000,
          operatingDeductionRatePercent: 5,
        },
      ],
    });
    expect(result).not.toHaveProperty('studentTuitionPerSession');
    expect(result).not.toHaveProperty('studentTuitionPerBlock');
    expect(result).not.toHaveProperty('tuitionPackageTotal');
    expect(result.students[0]).toEqual({ id: 'student-1' });
  });
});

describe('redactOtherTeachersSessions', () => {
  const buildSession = (teacherId: string) => ({
    id: `session-${teacherId}`,
    classId: 'class-1',
    teacherId,
    date: '2026-11-01',
    lessonContent: 'Hàm số',
    homework: 'Bài 1-5',
    progressStatus: 'on_track',
    ordinal: 3,
    allowanceAmount: 200000,
    coefficient: 1,
    tuitionFee: 150000,
    teacherPaymentStatus: 'paid',
    snapshotPerStudentAllowance: 50000,
    trainingManagerAllowanceAmount: 10000,
    teacher: {
      id: teacherId,
      fullName: 'Gia sư',
      bankAccount: '0123',
      cccdNumber: '0010',
    },
    attendance: [
      {
        id: 'att-1',
        studentId: 'student-1',
        status: 'present',
        testComment: 'Tốt',
        strengths: 'Chăm',
        tuitionFee: 150000,
        payrollBasisTuitionFee: 150000,
        transactionId: 'tx-1',
        customerCareCoef: 0.1,
        student: { id: 'student-1', fullName: 'Học sinh A' },
      },
    ],
  });

  it('keeps the viewer own sessions untouched', () => {
    const own = buildSession('teacher-me');
    const [result] = redactOtherTeachersSessions([own], 'teacher-me');
    expect(result).toBe(own);
  });

  it('keeps only review content for sessions of other teachers', () => {
    const [result] = redactOtherTeachersSessions(
      [buildSession('teacher-other')],
      'teacher-me',
    ) as unknown as Array<Record<string, unknown>>;

    expect(result).toMatchObject({
      id: 'session-teacher-other',
      teacherId: 'teacher-other',
      lessonContent: 'Hàm số',
      homework: 'Bài 1-5',
      progressStatus: 'on_track',
      ordinal: 3,
      teacher: { id: 'teacher-other', fullName: 'Gia sư' },
    });
    for (const field of [
      'allowanceAmount',
      'coefficient',
      'tuitionFee',
      'teacherPaymentStatus',
      'snapshotPerStudentAllowance',
      'trainingManagerAllowanceAmount',
    ]) {
      expect(result).not.toHaveProperty(field);
    }
    expect(result.attendance).toEqual([
      {
        id: 'att-1',
        studentId: 'student-1',
        status: 'present',
        testComment: 'Tốt',
        strengths: 'Chăm',
        student: { id: 'student-1', fullName: 'Học sinh A' },
      },
    ]);
  });
});

describe('#272 resolveAdminClassFinanceView (route admin của lớp)', () => {
  const head = StaffRole.sale_customer_care_head;

  it.each([
    [UserRole.admin, [] as StaffRole[], 'full'],
    [UserRole.staff, [StaffRole.admin], 'full'],
    [UserRole.staff, [head], 'income'],
    [UserRole.staff, [head, StaffRole.accountant_income], 'income'],
    [UserRole.staff, [head, StaffRole.accountant_expense], 'full'],
    [UserRole.staff, [StaffRole.accountant_income], 'income'],
    [UserRole.staff, [StaffRole.accountant_expense], 'expense'],
    [
      UserRole.staff,
      [StaffRole.accountant_income, StaffRole.accountant_expense],
      'full',
    ],
    // #274: Trưởng ban Đào tạo thấy lương gia sư, không thấy học phí.
    [UserRole.staff, [StaffRole.training_head], 'expense'],
    [UserRole.staff, [StaffRole.training_head, head], 'full'],
    [
      UserRole.staff,
      [StaffRole.training_head, StaffRole.accountant_income],
      'full',
    ],
    [
      UserRole.staff,
      [StaffRole.training_head, StaffRole.accountant_expense],
      'expense',
    ],
  ])('%s %j → %s', (roleType, staffRoles, expected) => {
    expect(resolveAdminClassFinanceView(roleType, staffRoles)).toBe(expected);
  });

  it('không đổi góc nhìn staff-ops: Trưởng phòng vẫn full ở resolver cũ', () => {
    expect(resolveAccountantFinanceView(UserRole.staff, [head])).toBe('full');
  });

  it('Trưởng phòng xem chi tiết lớp: còn Học phí lớp, mất lương gia sư', () => {
    const classDetail = {
      id: 'class-1',
      name: 'Toán 9',
      studentTuitionPerSession: 180000,
      studentTuitionPerBlock: 60000,
      tuitionPackageTotal: 2000000,
      tuitionPackageSession: 10,
      allowancePerSessionPerStudent: 90000,
      allowancePerBlockPerStudent: 30000,
      maxAllowancePerSession: 300000,
      maxAllowancePerBlock: 100000,
      scaleAmount: 10000,
      trainingManagerRatePercent: 5,
      teachers: [
        {
          id: 'teacher-1',
          fullName: 'Gia sư A',
          customAllowance: 100000,
          customAllowancePerSession: 100000,
          customScaleAmount: 5000,
          operatingDeductionRatePercent: 10,
          taxRatePercent: 10,
        },
      ],
      students: [
        {
          id: 'student-1',
          customTuitionPerSession: 150000,
          effectiveTuitionPerSession: 150000,
        },
      ],
    };

    const view = resolveAdminClassFinanceView(UserRole.staff, [head]);
    const redacted = redactClassForAccountantView(classDetail, view);

    expect(redacted).toEqual({
      id: 'class-1',
      name: 'Toán 9',
      studentTuitionPerSession: 180000,
      studentTuitionPerBlock: 60000,
      tuitionPackageTotal: 2000000,
      tuitionPackageSession: 10,
      teachers: [{ id: 'teacher-1', fullName: 'Gia sư A' }],
      students: classDetail.students,
    });
  });
});

describe('số dư ví trên route admin của lớp (follow-up grill 13/11)', () => {
  it('Admin, Trưởng phòng Sale & CSKH, Kế toán thu/chi xem được', () => {
    expect(canSeeClassStudentWalletOnAdminRoutes(UserRole.admin, [])).toBe(
      true,
    );
    for (const role of [
      StaffRole.admin,
      StaffRole.sale_customer_care_head,
      StaffRole.accountant_income,
      StaffRole.accountant_expense,
    ]) {
      expect(
        canSeeClassStudentWalletOnAdminRoutes(UserRole.staff, [role]),
      ).toBe(true);
    }
  });

  it('Trưởng ban Đào tạo / Ban Đào tạo / gia sư không xem; kiêm role xem được thì xem', () => {
    for (const roles of [
      [StaffRole.training_head],
      [StaffRole.training],
      [StaffRole.teacher],
    ]) {
      expect(canSeeClassStudentWalletOnAdminRoutes(UserRole.staff, roles)).toBe(
        false,
      );
    }
    expect(
      canSeeClassStudentWalletOnAdminRoutes(UserRole.staff, [
        StaffRole.training_head,
        StaffRole.accountant_expense,
      ]),
    ).toBe(true);
  });

  it('bỏ accountBalance cả phẳng lẫn lồng trong student', () => {
    const rows = [
      {
        studentId: 's-1',
        accountBalance: 1,
        student: { id: 's-1', fullName: 'HS', accountBalance: 500000 },
      },
    ];
    expect(redactStudentClassRowsWalletBalance(rows, false)).toEqual([
      { studentId: 's-1', student: { id: 's-1', fullName: 'HS' } },
    ]);
    expect(redactStudentClassRowsWalletBalance(rows, true)).toBe(rows);
  });
});

describe('liên hệ / hồ sơ học sinh theo người xem lớp (quyết định 13/11)', () => {
  const fullStudent = {
    id: 's-1',
    fullName: 'Học sinh A',
    status: 'active',
    email: 'hs@example.com',
    parentName: 'Phụ huynh A',
    parentPhone: '0900000000',
    parentEmail: 'ph@example.com',
    parentReceiptEmailEnabled: true,
    school: 'THPT X',
    province: 'Hà Nội',
    birthYear: 2010,
    gender: 'male',
    goal: 'Thi chuyên',
    customerSource: 'facebook',
    dropOutReason: null,
    userId: 'user-1',
    customerCareStaff: { id: 'cs-1', fullName: 'CSKH' },
    totalAttendedSession: 7,
    customTuitionPerSession: 200_000,
    accountBalance: 1_000_000,
  };

  it('Quản lý lớp / Trưởng ban / gia sư qua staff-ops: chỉ còn danh tính tối thiểu', () => {
    const result = redactClassForTrainingManagerView({
      id: 'class-1',
      students: [fullStudent],
    });
    expect(result.students[0]).toEqual({
      id: 's-1',
      fullName: 'Học sinh A',
      status: 'active',
      customerCareStaff: { id: 'cs-1', fullName: 'CSKH' },
      totalAttendedSession: 7,
    });
  });

  it('whitelist: cột mới không khai báo cũng bị ẩn; học phí / ví để redaction riêng quyết', () => {
    const result = redactClassStudentContacts({
      students: [{ ...fullStudent, zaloPhone: '0911111111' }],
    });
    expect(result.students[0]).not.toHaveProperty('zaloPhone');
    expect(result.students[0]).not.toHaveProperty('parentPhone');
    expect(result.students[0]).toMatchObject({
      customTuitionPerSession: 200_000,
      accountBalance: 1_000_000,
    });
  });

  it('route admin: chỉ Admin, Trưởng phòng, Kế toán thu/chi xem liên hệ', () => {
    expect(canSeeClassStudentContactsOnAdminRoutes(UserRole.admin, [])).toBe(
      true,
    );
    for (const role of [
      StaffRole.admin,
      StaffRole.sale_customer_care_head,
      StaffRole.accountant_income,
      StaffRole.accountant_expense,
    ]) {
      expect(
        canSeeClassStudentContactsOnAdminRoutes(UserRole.staff, [role]),
      ).toBe(true);
    }
    expect(
      canSeeClassStudentContactsOnAdminRoutes(UserRole.staff, [
        StaffRole.training_head,
      ]),
    ).toBe(false);
    expect(
      canSeeClassStudentContactsOnAdminRoutes(UserRole.staff, [
        StaffRole.training_head,
        StaffRole.sale_customer_care_head,
      ]),
    ).toBe(true);
  });

  it('GET /class/:id/students: student lồng chỉ còn id, tên, trạng thái', () => {
    const rows = [{ studentId: 's-1', status: 'active', student: fullStudent }];
    expect(redactStudentClassRowsContacts(rows, false)).toEqual([
      {
        studentId: 's-1',
        status: 'active',
        student: {
          id: 's-1',
          fullName: 'Học sinh A',
          status: 'active',
          accountBalance: 1_000_000,
        },
      },
    ]);
    expect(redactStudentClassRowsContacts(rows, true)).toBe(rows);
  });
});

describe('học phí trong attendance của buổi (kiểm thử role 13/11)', () => {
  const session = {
    id: 's1',
    allowanceAmount: 200000,
    tuitionFee: 300000,
    attendance: [
      {
        studentId: 'st1',
        tuitionFee: 150000,
        payrollBasisTuitionFee: 150000,
        trialCatchUpFee: 50000,
      },
    ],
  };

  it('Kế toán chi không thấy học phí, học phí chốt hoa hồng, phần thu bù học thử', () => {
    const [redacted] = redactSessionsForAccountantView([session], 'expense');
    expect(redacted.allowanceAmount).toBe(200000);
    expect(redacted).not.toHaveProperty('tuitionFee');
    expect(redacted.attendance[0]).toEqual({ studentId: 'st1' });
  });

  it('Quản lý lớp cũng không thấy các trường học phí đó', () => {
    const redacted = redactSessionForTrainingManagerView(session);
    expect(redacted.attendance[0]).toEqual({ studentId: 'st1' });
  });
});

describe('hoa hồng CSKH/trưởng phòng trên dòng điểm danh (kiểm thử role 13/11)', () => {
  const session = {
    id: 's1',
    allowanceAmount: 200000,
    attendance: [
      {
        studentId: 'st1',
        customerCareStaffId: 'cc-1',
        customerCareCoef: 0.1,
        customerCarePaymentStatus: 'unpaid',
        customerCareTaxDeductionRatePercent: 10,
        saleCsHeadStaffId: 'head-1',
        saleCsHeadPaymentStatus: 'unpaid',
        saleCsHeadTaxDeductionRatePercent: 10,
      },
    ],
  };
  const withoutCommission = {
    studentId: 'st1',
    customerCareStaffId: 'cc-1',
    saleCsHeadStaffId: 'head-1',
  };

  it('Kế toán thu không thấy hoa hồng trên dòng điểm danh', () => {
    const [redacted] = redactSessionsForAccountantView([session], 'income');
    expect(redacted.attendance[0]).toEqual(withoutCommission);
  });

  it('Quản lý lớp / Trưởng ban Đào tạo không thấy hoa hồng trên dòng điểm danh', () => {
    const redacted = redactSessionForTrainingManagerView(session);
    expect(redacted.attendance[0]).toEqual(withoutCommission);
  });

  it('Kế toán chi vẫn thấy để trả hoa hồng', () => {
    const [redacted] = redactSessionsForAccountantView([session], 'expense');
    expect(redacted.attendance[0]).toEqual(session.attendance[0]);
  });
});

describe('Kế toán thu không thấy khoản chi nhân sự trên buổi (kiểm thử role 13/11)', () => {
  it('bỏ trợ cấp gia sư, snapshot, vận hành, thuế, trợ cấp Quản lý lớp; giữ học phí', () => {
    const session = {
      id: 's1',
      tuitionFee: 300000,
      allowanceAmount: 200000,
      teacherPaymentStatus: 'unpaid',
      snapshotPerStudentAllowance: 50000,
      snapshotScaleAmount: 0,
      teacherOperatingDeductionRatePercent: 10,
      teacherTaxDeductionRatePercent: 10,
      trainingManagerStaffId: 'tm-1',
      trainingManagerRatePercent: 3,
      trainingManagerAllowanceAmount: 6000,
      trainingManagerPaymentStatus: 'unpaid',
      trainingManagerTaxDeductionRatePercent: 10,
    };
    const [redacted] = redactSessionsForAccountantView([session], 'income');
    expect(redacted).toEqual({
      id: 's1',
      tuitionFee: 300000,
      trainingManagerStaffId: 'tm-1',
    });
  });
});

describe('Trưởng ban Đào tạo chỉnh tay trợ cấp buổi (14/11)', () => {
  const session = {
    id: 's1',
    allowanceAmount: 200000,
    coefficient: 1,
    teacherPaymentStatus: 'unpaid',
    tuitionFee: 300000,
    operatingDeductionAmount: 20000,
    operatingDeductionRatePercent: 10,
    trainingManagerAllowanceAmount: 6000,
    attendance: [{ studentId: 'st1', tuitionFee: 150000 }],
  };

  it('giữ trợ cấp, hệ số, trạng thái thanh toán; vẫn ẩn học phí, vận hành, trợ cấp QLL', () => {
    const redacted = redactSessionForTrainingHeadView(session) as Record<
      string,
      unknown
    >;
    expect(redacted.allowanceAmount).toBe(200000);
    expect(redacted.coefficient).toBe(1);
    expect(redacted.teacherPaymentStatus).toBe('unpaid');
    expect(redacted).not.toHaveProperty('tuitionFee');
    expect(redacted).not.toHaveProperty('operatingDeductionAmount');
    expect(redacted).not.toHaveProperty('operatingDeductionRatePercent');
    expect(redacted).not.toHaveProperty('trainingManagerAllowanceAmount');
    expect(redacted.attendance).toEqual([{ studentId: 'st1' }]);
  });

  it('Quản lý lớp thường vẫn không thấy trợ cấp buổi', () => {
    const redacted = redactSessionForTrainingManagerView(session) as Record<
      string,
      unknown
    >;
    expect(redacted).not.toHaveProperty('allowanceAmount');
    expect(redacted).not.toHaveProperty('coefficient');
    expect(redacted).not.toHaveProperty('teacherPaymentStatus');
  });
});
