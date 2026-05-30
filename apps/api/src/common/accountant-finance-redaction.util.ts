import { StaffRole, UserRole } from 'generated/enums';

export type AccountantFinanceView = 'full' | 'income' | 'expense';

function hasAnyRole(
  roles: readonly StaffRole[],
  allowed: readonly StaffRole[],
) {
  return roles.some((role) => allowed.includes(role));
}

export function resolveAccountantFinanceView(
  roleType: UserRole,
  staffRoles: readonly StaffRole[],
): AccountantFinanceView {
  if (
    roleType === UserRole.admin ||
    hasAnyRole(staffRoles, [StaffRole.admin, StaffRole.assistant])
  ) {
    return 'full';
  }

  const hasIncomeRole = hasAnyRole(staffRoles, [
    StaffRole.accountant,
    StaffRole.accountant_income,
  ]);
  const hasExpenseRole = staffRoles.includes(StaffRole.accountant_expense);

  if (hasIncomeRole && !hasExpenseRole) {
    return 'income';
  }

  if (hasExpenseRole && !hasIncomeRole) {
    return 'expense';
  }

  return 'full';
}

function omitFields<T extends Record<string, unknown>>(
  value: T,
  fields: readonly string[],
) {
  const next = { ...value };
  for (const field of fields) {
    delete next[field];
  }
  return next;
}

const CLASS_INCOME_HIDDEN_FIELDS = [
  'allowancePerSessionPerStudent',
  'maxAllowancePerSession',
  'scaleAmount',
] as const;

const CLASS_EXPENSE_HIDDEN_FIELDS = [
  'studentTuitionPerSession',
  'tuitionPackageTotal',
  'tuitionPackageSession',
  'sessionTuitionTotal',
] as const;

const TEACHER_INCOME_HIDDEN_FIELDS = [
  'customAllowance',
  'operatingDeductionRatePercent',
  'taxRatePercent',
] as const;

const STUDENT_EXPENSE_HIDDEN_FIELDS = [
  'customTuitionPerSession',
  'customStudentTuitionPerSession',
  'customTuitionPackageTotal',
  'customTuitionPackageSession',
  'effectiveTuitionPerSession',
  'effectiveTuitionPackageTotal',
  'effectiveTuitionPackageSession',
  'tuitionPackageSource',
] as const;

export function redactClassForAccountantView<T>(
  classRecord: T,
  financeView: AccountantFinanceView,
): T {
  if (
    financeView === 'full' ||
    !classRecord ||
    typeof classRecord !== 'object'
  ) {
    return classRecord;
  }

  let next = classRecord as Record<string, unknown>;

  if (financeView === 'income') {
    next = omitFields(next, CLASS_INCOME_HIDDEN_FIELDS);
    if (Array.isArray(next.teachers)) {
      next.teachers = next.teachers.map((teacher) =>
        teacher && typeof teacher === 'object'
          ? omitFields(
              teacher as Record<string, unknown>,
              TEACHER_INCOME_HIDDEN_FIELDS,
            )
          : teacher,
      );
    }
  }

  if (financeView === 'expense') {
    next = omitFields(next, CLASS_EXPENSE_HIDDEN_FIELDS);
    if (Array.isArray(next.students)) {
      next.students = next.students.map((student) =>
        student && typeof student === 'object'
          ? omitFields(
              student as Record<string, unknown>,
              STUDENT_EXPENSE_HIDDEN_FIELDS,
            )
          : student,
      );
    }
  }

  return next as T;
}

export function redactClassListForAccountantView<
  T extends { data?: unknown[] },
>(response: T, financeView: AccountantFinanceView): T {
  if (financeView === 'full' || !Array.isArray(response.data)) {
    return response;
  }

  return {
    ...response,
    data: response.data.map((item) =>
      redactClassForAccountantView(item, financeView),
    ),
  };
}

export function redactStudentClassRowsForAccountantView<T>(
  rows: T[],
  financeView: AccountantFinanceView,
): T[] {
  if (financeView !== 'expense') {
    return rows;
  }

  return rows.map((row) =>
    row && typeof row === 'object'
      ? (omitFields(
          row as Record<string, unknown>,
          STUDENT_EXPENSE_HIDDEN_FIELDS,
        ) as T)
      : row,
  );
}

const SESSION_INCOME_HIDDEN_FIELDS = [
  'allowanceAmount',
  'teacherPaymentStatus',
] as const;

const SESSION_EXPENSE_HIDDEN_FIELDS = ['tuitionFee'] as const;

const ATTENDANCE_EXPENSE_HIDDEN_FIELDS = ['tuitionFee'] as const;

export function redactSessionForAccountantView<T>(
  session: T,
  financeView: AccountantFinanceView,
): T {
  if (financeView === 'full' || !session || typeof session !== 'object') {
    return session;
  }

  let next = session as Record<string, unknown>;

  if (financeView === 'income') {
    next = omitFields(next, SESSION_INCOME_HIDDEN_FIELDS);
  }

  if (financeView === 'expense') {
    next = omitFields(next, SESSION_EXPENSE_HIDDEN_FIELDS);
    if (Array.isArray(next.attendance)) {
      next.attendance = next.attendance.map((attendance) =>
        attendance && typeof attendance === 'object'
          ? omitFields(
              attendance as Record<string, unknown>,
              ATTENDANCE_EXPENSE_HIDDEN_FIELDS,
            )
          : attendance,
      );
    }
  }

  return next as T;
}

export function redactSessionsForAccountantView<T>(
  sessions: T[],
  financeView: AccountantFinanceView,
): T[] {
  if (financeView === 'full') {
    return sessions;
  }

  return sessions.map((session) =>
    redactSessionForAccountantView(session, financeView),
  );
}
