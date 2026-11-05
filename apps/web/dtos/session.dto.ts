export type SessionPaymentStatus = "paid" | "unpaid" | "deposit" | string;
/** `trial` = Học thử: không trừ ví, không tính sĩ số trợ cấp; thu bù gấp đôi ở buổi học/phép kế tiếp cùng lớp. */
export type SessionAttendanceStatus = "present" | "excused" | "absent" | "trial";

/** Tiến độ buổi. Null trên buổi = buổi legacy (nhận xét tự do trong `notes`). */
export type SessionProgressStatus = "completed" | "partial" | "not_completed";

/** Chất lượng BTVN buổi trước của một học sinh. */
export type HomeworkQuality = "passed" | "needs_revision" | "failed";

/** Phần chung của Nhận xét buổi học có cấu trúc. */
export interface SessionReviewFields {
  progressStatus?: SessionProgressStatus | null;
  /** Plain text, mỗi dòng 1 ý. */
  progressDone?: string | null;
  /** Plain text, mỗi dòng 1 ý, kèm lý do. */
  progressRemaining?: string | null;
  hasInClassTest?: boolean;
  inClassTestContent?: string | null;
  inClassTestTotal?: number | null;
  /** ISO 8601 có offset. */
  homeworkDueAt?: string | null;
  nextSessionPlan?: string | null;
  hasRetest?: boolean;
  retestContent?: string | null;
}

/** Phần từng học sinh của Nhận xét buổi học có cấu trúc. */
export interface AttendanceReviewFields {
  testCorrectCount?: number | null;
  testComment?: string | null;
  strengths?: string | null;
  improvements?: string | null;
  homeworkQuality?: HomeworkQuality | null;
  homeworkComment?: string | null;
}

export interface SessionNextOrdinalResponse {
  ordinal: number;
}

export interface SessionClassRef {
  id: string;
  name: string;
}

export interface SessionTeacherRef {
  id: string;
  fullName?: string | null;
}

export interface SessionAttendanceItem extends AttendanceReviewFields {
  studentId: string;
  status: SessionAttendanceStatus;
  notes?: string | null;
  tuitionFee?: number | null;
}

export interface SessionMonthYearParams {
  month: string;
  year: string;
}

export interface SessionUnpaidSummaryParams {
  days?: number;
}

export interface SessionUnpaidSummaryItem {
  classId: string;
  className: string;
  totalAllowance: number | string;
}

export type MissedTeachingAlertStatus =
  | "pending_explanation"
  | "explained_pending_makeup";

export interface MissedTeachingAlertExplanation {
  id: string;
  reason: string;
  explainedAt: string;
  explainedByName?: string | null;
  canEdit: boolean;
}

export interface MissedTeachingAlert {
  id: string;
  classId: string;
  className: string;
  teacherId: string;
  teacherName?: string | null;
  scheduleEntryId: string;
  originalDate: string;
  scheduledStartTime: string;
  scheduledEndTime?: string | null;
  status: MissedTeachingAlertStatus;
  explanation?: MissedTeachingAlertExplanation;
}

export interface CreateMissedTeachingExplanationPayload {
  scheduleEntryId: string;
  originalDate: string;
  teacherId: string;
  reason: string;
}

export interface UpdateMissedTeachingExplanationPayload {
  reason: string;
}

export interface MissedTeachingExplanationRecord {
  id: string;
  classId: string;
  teacherId: string;
  baselineScheduleEntryId: string;
  originalDate: string;
  reason: string;
  explainedAt: string;
  explainedByName?: string | null;
}

export interface SessionCreatePayload extends SessionReviewFields {
  classId: string;
  teacherId: string;
  date: string;
  startTime?: string;
  endTime?: string;
  notes?: string | null;
  lessonContent: string;
  homework: string;
  tutorial: string;
  recordingUrl?: string | null;
  teacherPaymentStatus?: string | null;
  /** Coefficient from 0.0 to 1.0. Default 1.0. */
  coefficient?: number;
  /** Allowance amount (VNĐ). If omitted, uses class teacher custom allowance. */
  allowanceAmount?: number | null;
  /** Whether teacher operating deduction should be applied to this session. Defaults to true. */
  includeTeacherOperatingDeduction?: boolean;
  attendance?: SessionAttendanceItem[];
}

export interface SessionUpdatePayload extends SessionReviewFields {
  id?: string;
  classId?: string;
  teacherId?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  notes?: string | null;
  lessonContent?: string;
  homework?: string;
  tutorial?: string;
  recordingUrl?: string | null;
  teacherPaymentStatus?: string | null;
  coefficient?: number;
  allowanceAmount?: number | null;
  includeTeacherOperatingDeduction?: boolean;
  attendance?: SessionAttendanceItem[];
}

export interface SessionBulkPaymentStatusUpdatePayload {
  sessionIds: string[];
  teacherPaymentStatus: SessionPaymentStatus;
}

export interface SessionBulkPaymentStatusUpdateResult {
  requestedCount: number;
  updatedCount: number;
}

export interface SessionAttendanceRecord extends AttendanceReviewFields {
  studentId: string;
  status: SessionAttendanceStatus;
  notes?: string | null;
  tuitionFee?: number | null;
  student?: { fullName?: string | null } | null;
}

export interface SessionItem extends SessionReviewFields {
  id: string;
  /** Số thứ tự buổi trong lớp (suy ra từ ngày + giờ, tính cả buổi bù). */
  ordinal?: number | null;
  classId: string;
  teacherId: string;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  teacherPaymentStatus?: SessionPaymentStatus | null;
  allowanceAmount?: number | null;
  /** Resolved per-student allowance snapshot at session creation. */
  snapshotPerStudentAllowance?: number | null;
  /** Class scale amount snapshot at session creation. */
  snapshotScaleAmount?: number | null;
  /** 30-minute block count snapshotted when the session was created. */
  snapshotBlockCount?: number | null;
  /** Snapshot of class noAttendance flag at session creation. */
  snapshotNoAttendance?: boolean;
  tuitionFee?: number | null;
  /** Coefficient from 0.0 to 1.0. */
  coefficient?: number | null;
  /** Snapshot operating deduction rate percent applied to teacher payout. */
  teacherOperatingDeductionRatePercent?: number | string | null;
  notes?: string | null;
  lessonContent?: string | null;
  homework?: string | null;
  tutorial?: string | null;
  makeupScheduleEvent?: { originalDate?: string | null } | null;
  createdAt?: string;
  updatedAt?: string;
  class?: SessionClassRef | null;
  teacher?: SessionTeacherRef | null;
  attendance?: SessionAttendanceRecord[] | null;
  /** Google Meet video conference link */
  googleMeetLink?: string | null;
  /** Google Calendar event ID */
  googleCalendarEventId?: string | null;
  /** YouTube recording URL */
  recordingUrl?: string | null;
  trainingManagerAllowanceAmount?: number | null;
  trainingManagerPaymentStatus?: SessionPaymentStatus | null;
  trainingManagerRatePercent?: number | null;
}
