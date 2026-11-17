import { SALE_CS_HEAD_ROLE } from 'src/common/sale-cs-head-access';
import { StaffRole, UserRole } from 'generated/enums';
import { hasAnyStaffRole } from './staff-role-policy';

export type AccountantFinanceView = 'full' | 'income' | 'expense';

export function resolveAccountantFinanceView(
  roleType: UserRole,
  staffRoles: readonly StaffRole[],
): AccountantFinanceView {
  if (
    roleType === UserRole.admin ||
    hasAnyStaffRole(staffRoles, [StaffRole.admin, SALE_CS_HEAD_ROLE])
  ) {
    return 'full';
  }

  const hasIncomeRole = staffRoles.includes(StaffRole.accountant_income);
  const hasExpenseRole = staffRoles.includes(StaffRole.accountant_expense);

  if (hasIncomeRole && !hasExpenseRole) {
    return 'income';
  }

  if (hasExpenseRole && !hasIncomeRole) {
    return 'expense';
  }

  return 'full';
}

/**
 * #272: góc nhìn tài chính trên **route admin của lớp** (`/class/*`).
 *
 * Khác `resolveAccountantFinanceView` ở chỗ role trưởng chỉ thấy phần tài
 * chính thuộc mảng mình:
 * - Trưởng phòng Sale & CSKH thấy **Học phí lớp** nhưng **không** thấy lương
 *   gia sư (trợ cấp mỗi học sinh, scale, % vận hành, % trợ cấp quản lý lớp) —
 *   giống góc nhìn Kế toán thu (`income`).
 * - #274: Trưởng ban Đào tạo thấy lương gia sư nhưng **không** thấy học phí —
 *   giống góc nhìn Kế toán chi (`expense`).
 * - Hợp quyền: thấy được cả học phí (TP Sale & CSKH / Kế toán thu) lẫn lương
 *   (TB Đào tạo / Kế toán chi) → `full`.
 *
 * Chỉ dùng ở route admin của lớp; góc nhìn gia sư / quản lý lớp ở staff-ops
 * giữ `resolveAccountantFinanceView` để người kiêm Trưởng phòng vẫn thấy lương
 * của chính mình ở lớp mình dạy.
 */
export function resolveAdminClassFinanceView(
  roleType: UserRole,
  staffRoles: readonly StaffRole[],
): AccountantFinanceView {
  if (roleType === UserRole.admin || staffRoles.includes(StaffRole.admin)) {
    return 'full';
  }

  const seesTuition = hasAnyStaffRole(staffRoles, [
    SALE_CS_HEAD_ROLE,
    StaffRole.accountant_income,
  ]);
  const seesTeacherPay = hasAnyStaffRole(staffRoles, [
    StaffRole.training_head,
    StaffRole.accountant_expense,
  ]);

  if (seesTuition && !seesTeacherPay) {
    return 'income';
  }
  if (seesTeacherPay && !seesTuition) {
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
  // #272: % trợ cấp quản lý lớp cũng là lương nhân sự theo lớp.
  'trainingManagerRatePercent',
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
  'customAllowancePerSession',
  'customScaleAmount',
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

/**
 * Quyết định 13/11: Ban Đào Tạo (Trưởng ban, Quản lý lớp) và gia sư không liên
 * hệ phụ huynh (việc của CSKH) → học sinh trong response lớp chỉ còn danh tính
 * tối thiểu. Whitelist (không phải blacklist) để cột mới của `student_info`
 * (liên hệ, hồ sơ) mặc định bị ẩn. Học phí / ví giữ trong whitelist vì đã có
 * redaction riêng quyết định theo người xem.
 */
const CLASS_STUDENT_ROSTER_FIELDS = [
  'id',
  'fullName',
  'status',
  'customerCareStaff',
  'totalAttendedSession',
  ...STUDENT_EXPENSE_HIDDEN_FIELDS,
  ...STUDENT_WALLET_BALANCE_HIDDEN_FIELDS,
] as const;

/** `student` lồng trong dòng `student_classes` (`GET /class/:id/students`). */
const STUDENT_CLASS_ROW_STUDENT_FIELDS = [
  'id',
  'fullName',
  'status',
  ...STUDENT_WALLET_BALANCE_HIDDEN_FIELDS,
] as const;

/**
 * Role xem được liên hệ / hồ sơ học sinh trên route admin của lớp: Admin,
 * Trưởng phòng Sale & CSKH, Kế toán thu/chi (hợp quyền). Trưởng ban Đào tạo
 * thuần → không (quyết định 13/11).
 */
export function canSeeClassStudentContactsOnAdminRoutes(
  roleType: UserRole,
  staffRoles: readonly StaffRole[],
): boolean {
  if (roleType === UserRole.admin) {
    return true;
  }
  return hasAnyStaffRole(staffRoles, [
    StaffRole.admin,
    SALE_CS_HEAD_ROLE,
    StaffRole.accountant_income,
    StaffRole.accountant_expense,
  ]);
}

/** Bỏ liên hệ / hồ sơ của học sinh trong `students[]` của chi tiết lớp. */
export function redactClassStudentContacts<T>(classRecord: T): T {
  if (!classRecord || typeof classRecord !== 'object') {
    return classRecord;
  }
  const next = { ...(classRecord as Record<string, unknown>) };
  if (Array.isArray(next.students)) {
    next.students = (next.students as unknown[]).map((student) =>
      student && typeof student === 'object'
        ? pickFields(
            student as Record<string, unknown>,
            CLASS_STUDENT_ROSTER_FIELDS,
          )
        : student,
    );
  }
  return next as T;
}

/** Như trên cho dòng `student_classes` có `include: { student }`. */
export function redactStudentClassRowsContacts<T>(
  rows: T[],
  canSeeContacts: boolean,
): T[] {
  if (canSeeContacts) {
    return rows;
  }
  return rows.map((row) => {
    if (!row || typeof row !== 'object') {
      return row;
    }
    const next = { ...(row as Record<string, unknown>) };
    if (next.student && typeof next.student === 'object') {
      next.student = pickFields(
        next.student as Record<string, unknown>,
        STUDENT_CLASS_ROW_STUDENT_FIELDS,
      );
    }
    return next as T;
  });
}

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

/**
 * Follow-up grill 13/11 — glossary «Số dư ví trên danh sách học sinh trong
 * lớp» trên **route admin của lớp** (`/class/*`): Admin, Trưởng phòng Sale &
 * CSKH, Kế toán thu, Kế toán chi xem được. Trưởng ban Đào tạo (và mọi role
 * khác lọt vào route) không xem. Hợp quyền: mang một role xem được là xem.
 */
export function canSeeClassStudentWalletOnAdminRoutes(
  roleType: UserRole,
  staffRoles: readonly StaffRole[],
): boolean {
  if (roleType === UserRole.admin) {
    return true;
  }
  return hasAnyStaffRole(staffRoles, [
    StaffRole.admin,
    SALE_CS_HEAD_ROLE,
    StaffRole.accountant_income,
    StaffRole.accountant_expense,
  ]);
}

/**
 * Bỏ số dư ví khỏi dòng `student_classes` có `include: { student }` (route
 * `GET /class/:id/students`) — cả trường phẳng lẫn `student.accountBalance`.
 */
export function redactStudentClassRowsWalletBalance<T>(
  rows: T[],
  canSeeWallet: boolean,
): T[] {
  if (canSeeWallet) {
    return rows;
  }

  return rows.map((row) => {
    if (!row || typeof row !== 'object') {
      return row;
    }
    const next = omitFields(
      row as Record<string, unknown>,
      STUDENT_WALLET_BALANCE_HIDDEN_FIELDS,
    );
    if (next.student && typeof next.student === 'object') {
      next.student = omitFields(
        next.student as Record<string, unknown>,
        STUDENT_WALLET_BALANCE_HIDDEN_FIELDS,
      );
    }
    return next as T;
  });
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

// Kế toán thu không thấy khoản chi nào cho nhân sự: trợ cấp gia sư (kể cả
// snapshot để tính lại), % vận hành, thuế, và trợ cấp Quản lý lớp từng buổi.
const SESSION_INCOME_HIDDEN_FIELDS = [
  'allowanceAmount',
  'teacherPaymentStatus',
  'snapshotPerStudentAllowance',
  'snapshotScaleAmount',
  'teacherOperatingDeductionRatePercent',
  'teacherTaxDeductionRatePercent',
  'operatingDeductionAmount',
  'operatingDeductionRatePercent',
  'trainingManagerRatePercent',
  'trainingManagerAllowanceAmount',
  'trainingManagerPaymentStatus',
  'trainingManagerTaxDeductionRatePercent',
] as const;

const SESSION_EXPENSE_HIDDEN_FIELDS = ['tuitionFee'] as const;

// `payrollBasisTuitionFee` (học phí chốt để tính hoa hồng) và `trialCatchUpFee`
// (phần thu bù học thử) cũng là học phí của học sinh.
const ATTENDANCE_TUITION_FIELDS = [
  'tuitionFee',
  'payrollBasisTuitionFee',
  'trialCatchUpFee',
] as const;

const ATTENDANCE_EXPENSE_HIDDEN_FIELDS = ATTENDANCE_TUITION_FIELDS;

// Hoa hồng CSKH và hoa hồng trưởng phòng ghi trên từng dòng điểm danh (hệ số,
// thuế, trạng thái thanh toán) là khoản chi cho nhân sự khác.
const ATTENDANCE_COMMISSION_FIELDS = [
  'customerCareCoef',
  'customerCarePaymentStatus',
  'customerCareTaxDeductionRatePercent',
  'saleCsHeadPaymentStatus',
  'saleCsHeadTaxDeductionRatePercent',
] as const;

// Kế toán thu không thấy khoản chi nào cho nhân sự (biên bản 2026-11-12 mục 3).
const ATTENDANCE_INCOME_HIDDEN_FIELDS = ATTENDANCE_COMMISSION_FIELDS;

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
    if (Array.isArray(next.attendance)) {
      next.attendance = next.attendance.map((attendance: unknown) =>
        attendance && typeof attendance === 'object'
          ? omitFields(
              attendance as Record<string, unknown>,
              ATTENDANCE_INCOME_HIDDEN_FIELDS,
            )
          : attendance,
      );
    }
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

/**
 * Quản lý lớp (Ban Đào Tạo) chỉnh được lương gia sư nên thấy trợ cấp/scale
 * của lớp và của từng gia sư; chỉ ẩn học phí.
 */
const CLASS_TRAINING_MANAGER_HIDDEN_FIELDS = [
  'studentTuitionPerSession',
  'studentTuitionPerBlock',
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

const ATTENDANCE_TRAINING_MANAGER_HIDDEN_FIELDS = [
  ...ATTENDANCE_TUITION_FIELDS,
  ...ATTENDANCE_COMMISSION_FIELDS,
] as const;

export function redactClassForTrainingManagerView<T>(classRecord: T): T {
  if (!classRecord || typeof classRecord !== 'object') {
    return classRecord;
  }

  const next = omitFields(
    classRecord as Record<string, unknown>,
    CLASS_TRAINING_MANAGER_HIDDEN_FIELDS,
  );

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

  // Quyết định 13/11: Ban Đào Tạo / gia sư không thấy liên hệ phụ huynh.
  return redactClassStudentContacts(next) as T;
}

/**
 * CSKH xem lớp (quyết định 13/11): không thấy học phí lớp; học phí từng học
 * sinh chỉ giữ ở học sinh mình đang chăm sóc. Lương gia sư che riêng bằng
 * `redactOtherTeachersIncome`.
 */
export function redactClassForCustomerCareView<T>(
  classRecord: T,
  assignedStudentIds: ReadonlySet<string>,
): T {
  if (!classRecord || typeof classRecord !== 'object') {
    return classRecord;
  }

  const next = omitFields(
    classRecord as Record<string, unknown>,
    CLASS_TRAINING_MANAGER_HIDDEN_FIELDS,
  );

  if (Array.isArray(next.students)) {
    next.students = next.students.map((student) => {
      if (!student || typeof student !== 'object') {
        return student;
      }
      const row = student as Record<string, unknown>;
      const studentId = typeof row.id === 'string' ? row.id : null;
      return studentId && assignedStudentIds.has(studentId)
        ? row
        : omitFields(row, STUDENT_EXPENSE_HIDDEN_FIELDS);
    });
  }

  return next as T;
}

/**
 * Gia sư xem lớp: chỉ giữ cấu hình trợ cấp / scale / vận hành của chính mình,
 * che số của các gia sư khác trong `teachers[]`.
 */
export function redactOtherTeachersIncome<T>(
  classRecord: T,
  viewerTeacherId: string,
): T {
  if (!classRecord || typeof classRecord !== 'object') {
    return classRecord;
  }

  const next = { ...(classRecord as Record<string, unknown>) };
  if (Array.isArray(next.teachers)) {
    next.teachers = next.teachers.map((teacher) =>
      teacher &&
      typeof teacher === 'object' &&
      (teacher as { id?: unknown }).id !== viewerTeacherId
        ? omitFields(
            teacher as Record<string, unknown>,
            TEACHER_INCOME_HIDDEN_FIELDS,
          )
        : teacher,
    );
  }

  return next as T;
}

/**
 * 14/11: Trưởng ban Đào tạo chỉnh tay trợ cấp + tick Dạy thử của buổi (mọi
 * lớp, trừ buổi mình dạy) → cần thấy trợ cấp, hệ số và trạng thái thanh toán
 * trợ cấp gia sư. Học phí / vận hành vẫn ẩn.
 */
const SESSION_TRAINING_HEAD_VISIBLE_COMPENSATION_FIELDS: readonly string[] = [
  'allowanceAmount',
  'coefficient',
  'teacherPaymentStatus',
];

export function redactSessionForTrainingManagerView<T>(
  session: T,
  options: { keepTeacherCompensation?: boolean } = {},
): T {
  if (!session || typeof session !== 'object') {
    return session;
  }

  const next = omitFields(
    session as Record<string, unknown>,
    options.keepTeacherCompensation
      ? SESSION_TRAINING_MANAGER_HIDDEN_FIELDS.filter(
          (field) =>
            !SESSION_TRAINING_HEAD_VISIBLE_COMPENSATION_FIELDS.includes(field),
        )
      : SESSION_TRAINING_MANAGER_HIDDEN_FIELDS,
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

export function redactSessionsForTrainingManagerView<T>(
  sessions: T[],
  options: { keepTeacherCompensation?: boolean } = {},
): T[] {
  return sessions.map((session) =>
    redactSessionForTrainingManagerView(session, options),
  );
}

/**
 * #277: Trưởng ban Đào tạo xem buổi của lớp mình **không** quản lý — ngoài
 * phần ẩn như Quản lý lớp, bỏ cả trợ cấp quản lý lớp từng buổi (tiền của
 * người quản lý khác). 14/11: giữ trợ cấp / hệ số / trạng thái thanh toán
 * trợ cấp gia sư để chỉnh tay.
 */
const SESSION_TRAINING_HEAD_EXTRA_HIDDEN_FIELDS = [
  'trainingManagerAllowanceAmount',
  'trainingManagerPaymentStatus',
  'trainingManagerRatePercent',
  'trainingManagerTaxDeductionRatePercent',
] as const;

export function redactSessionForTrainingHeadView<T>(session: T): T {
  const redacted = redactSessionForTrainingManagerView(session, {
    keepTeacherCompensation: true,
  });
  if (!redacted || typeof redacted !== 'object') {
    return redacted;
  }
  return omitFields(
    redacted as Record<string, unknown>,
    SESSION_TRAINING_HEAD_EXTRA_HIDDEN_FIELDS,
  ) as T;
}

/**
 * Gia sư xem lịch sử buổi của lớp: buổi do gia sư KHÁC dạy chỉ giữ nội dung
 * nhận xét (allowlist), bỏ mọi thông tin tiền (trợ cấp, hệ số, học phí, trạng
 * thái thanh toán, hoa hồng CSKH/trợ lí/QLL) và hồ sơ nhân sự của gia sư đó.
 * Dùng allowlist để field tiền thêm sau này không tự lộ ra.
 */
const OTHER_TEACHER_SESSION_VISIBLE_FIELDS = [
  'id',
  'classId',
  'teacherId',
  'date',
  'startTime',
  'endTime',
  'snapshotNoAttendance',
  'notes',
  'lessonContent',
  'homework',
  'tutorial',
  'progressStatus',
  'progressDone',
  'progressRemaining',
  'hasInClassTest',
  'inClassTestContent',
  'inClassTestTotal',
  'homeworkDueAt',
  'nextSessionPlan',
  'hasRetest',
  'retestContent',
  'recordingUrl',
  'createdAt',
  'updatedAt',
  'ordinal',
  'makeupScheduleEvent',
] as const;

const OTHER_TEACHER_ATTENDANCE_VISIBLE_FIELDS = [
  'id',
  'sessionId',
  'studentId',
  'status',
  'notes',
  'testCorrectCount',
  'testComment',
  'strengths',
  'improvements',
  'homeworkQuality',
  'homeworkComment',
  'createdAt',
  'student',
] as const;

function pickFields(
  value: Record<string, unknown>,
  fields: readonly string[],
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const field of fields) {
    if (field in value) {
      next[field] = value[field];
    }
  }
  return next;
}

export function redactSessionForOtherTeacherView<T>(session: T): T {
  if (!session || typeof session !== 'object') {
    return session;
  }

  const source = session as Record<string, unknown>;
  const next = pickFields(source, OTHER_TEACHER_SESSION_VISIBLE_FIELDS);

  const teacher = source.teacher as
    | { id?: unknown; fullName?: unknown }
    | null
    | undefined;
  next.teacher = teacher
    ? { id: teacher.id ?? null, fullName: teacher.fullName ?? '' }
    : null;

  next.attendance = Array.isArray(source.attendance)
    ? (source.attendance as unknown[]).map((attendance) =>
        attendance && typeof attendance === 'object'
          ? pickFields(
              attendance as Record<string, unknown>,
              OTHER_TEACHER_ATTENDANCE_VISIBLE_FIELDS,
            )
          : attendance,
      )
    : [];

  return next as T;
}

/** Buổi của chính gia sư giữ nguyên; buổi của gia sư khác chỉ còn nhận xét. */
export function redactOtherTeachersSessions<
  T extends { teacherId?: string | null },
>(sessions: T[], viewerTeacherId: string): T[] {
  return sessions.map((session) =>
    session.teacherId === viewerTeacherId
      ? session
      : redactSessionForOtherTeacherView(session),
  );
}
