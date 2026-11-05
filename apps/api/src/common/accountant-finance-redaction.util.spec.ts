import { StaffRole, UserRole } from 'generated/enums';
import {
  redactClassForTrainingManagerView,
  redactClassStudentWalletBalances,
  redactOtherTeachersIncome,
  resolveAccountantFinanceView,
} from './accountant-finance-redaction.util';

describe('resolveAccountantFinanceView', () => {
  it('treats legacy accountant as income finance view', () => {
    expect(
      resolveAccountantFinanceView(UserRole.staff, [StaffRole.accountant]),
    ).toBe('income');
  });

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
      resolveAccountantFinanceView(UserRole.staff, [StaffRole.assistant]),
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
