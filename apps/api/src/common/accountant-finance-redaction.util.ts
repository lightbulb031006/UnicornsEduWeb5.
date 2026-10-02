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
  'allowancePerBlockPerStudent',
  'maxAllowancePerSession',
  'maxAllowancePerBlock',
  'scaleAmount',
] as const;

const CLASS_EXPENSE_HIDDEN_FIELDS = [
  'studentTuitionPerSession',
  'studentTuitionPerBlock',
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
  'customTuitionPerBlock',
  'customTuitionPackageTotal',
  'customTuitionPackageSession',
  'effectiveTuitionPerSession',
  'effectiveTuitionPackageTotal',
  'effectiveTuitionPackageSession',
  'tuitionPackageSource',
] as const;

const STUDENT_WALLET_BALANCE_HIDDEN_FIELDS = [
  'accountBalance',
  'account_balance',
] as const;

export type ClassStudentWalletVisibility =
  | { mode: 'full' }
  | { mode: 'none' }
  | { mode: 'allowlist'; allowedStudentIds: ReadonlySet<string> };

/** Redact student wallet balances on class detail according to viewer policy. */
export function redactClassStudentWalletBalances<T>(
  classRecord: T,
  visibility: ClassStudentWalletVisibility,
): T {
  if (
    visibility.mode === 'full' ||
    !classRecord ||
    typeof classRecord !== 'object'
  ) {
    return classRecord;
  }

  const next = { ...(classRecord as Record<string, unknown>) };
  if (!Array.isArray(next.students)) {
    return next as T;
  }

  next.students = next.students.map((student) => {
    if (!student || typeof student !== 'object') {
      return student;
    }

    const row = student as Record<string, unknown>;
    if (visibility.mode === 'none') {
      return omitFields(row, STUDENT_WALLET_BALANCE_HIDDEN_FIELDS);
    }

    const studentId = typeof row.id === 'string' ? row.id : null;
    if (!studentId || !visibility.allowedStudentIds.has(studentId)) {
      return omitFields(row, STUDENT_WALLET_BALANCE_HIDDEN_FIELDS);
    }

    return student;
  });

  return next as T;
}

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

export function redactClassListForTrainingManagerView<
  T extends { data?: unknown[] },
>(response: T): T {
  if (!Array.isArray(response.data)) {
    return response;
  }

  return {
    ...response,
    data: response.data.map((item) => redactClassForTrainingManagerView(item)),
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

const CLASS_TRAINING_MANAGER_HIDDEN_FIELDS = [
  'allowancePerSessionPerStudent',
  'maxAllowancePerSession',
  'scaleAmount',
  'studentTuitionPerSession',
  'tuitionPackageTotal',
  'tuitionPackageSession',
  'sessionTuitionTotal',
] as const;

const SESSION_TRAINING_MANAGER_HIDDEN_FIELDS = [
  'allowanceAmount',
  'coefficient',
  'teacherPaymentStatus',
  'tuitionFee',
  'operatingDeductionAmount',
  'operatingDeductionRatePercent',
] as const;

const ATTENDANCE_TRAINING_MANAGER_HIDDEN_FIELDS = ['tuitionFee'] as const;

export function redactClassForTrainingManagerView<T>(classRecord: T): T {
  if (!classRecord || typeof classRecord !== 'object') {
    return classRecord;
  }

  const next = omitFields(
    classRecord as Record<string, unknown>,
    CLASS_TRAINING_MANAGER_HIDDEN_FIELDS,
  );

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

  if (Array.isArray(next.students)) {
    next.students = next.students.map((student) =>
      student && typeof student === 'object'
        ? omitFields(student as Record<string, unknown>, [
            ...STUDENT_EXPENSE_HIDDEN_FIELDS,
            ...STUDENT_WALLET_BALANCE_HIDDEN_FIELDS,
          ])
        : student,
    );
  }

  return next as T;
}

export function redactSessionForTrainingManagerView<T>(session: T): T {
  if (!session || typeof session !== 'object') {
    return session;
  }

  const next = omitFields(
    session as Record<string, unknown>,
    SESSION_TRAINING_MANAGER_HIDDEN_FIELDS,
  );

  if (Array.isArray(next.attendance)) {
    next.attendance = next.attendance.map((attendance) =>
      attendance && typeof attendance === 'object'
        ? omitFields(
            attendance as Record<string, unknown>,
            ATTENDANCE_TRAINING_MANAGER_HIDDEN_FIELDS,
          )
        : attendance,
    );
  }

  return next as T;
}

export function redactSessionsForTrainingManagerView<T>(sessions: T[]): T[] {
  return sessions.map((session) =>
    redactSessionForTrainingManagerView(session),
  );
}
