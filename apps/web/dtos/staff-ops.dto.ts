import type {
  ClassDetail,
  ClassListResponse,
  ClassScheduleItem,
  ClassStatus,
} from "./class.dto";
import type {
  AttendanceReviewFields,
  SessionAttendanceStatus,
  SessionItem,
  SessionMonthYearParams,
  SessionReviewFields,
} from "./session.dto";

export type StaffOpsClassListResponse = ClassListResponse;
export type StaffOpsClassDetail = ClassDetail;
export type StaffOpsSessionList = SessionItem[];
export type StaffOpsSessionMonthYearParams = SessionMonthYearParams;

export interface StaffOpsCreateClassPayload {
  name: string;
  course_id?: string;
  status?: ClassStatus;
  schedule?: ClassScheduleItem[];
}

export interface StaffOpsUpdateClassSchedulePayload {
  schedule: ClassScheduleItem[];
  /** Id các slot cần xoá tường minh (soft-delete). Gia sư chỉ được liệt kê id slot của chính mình. */
  removedEntryIds?: string[];
  /** `updatedAt` của lớp lúc client tải dữ liệu — dùng để bật optimistic lock. */
  expectedUpdatedAt?: string;
}

/** Lương một gia sư trong lớp. Bỏ field = giữ nguyên; `null` = theo mức của lớp. */
export interface StaffOpsClassTeacherPayItem {
  teacher_id: string;
  custom_allowance?: number | null;
  /** `null` = theo scale lớp, `0` = gia sư không có scale. */
  custom_scale_amount?: number | null;
  operating_deduction_rate_percent?: number;
}

/** `PATCH /staff-ops/classes/:id/teacher-pay` — quản lý lớp chỉnh lương gia sư (không có học phí). */
export interface StaffOpsUpdateClassTeacherPayPayload {
  allowance_per_session_per_student?: number;
  /** `null` = bỏ trần trợ cấp / buổi. */
  max_allowance_per_session?: number | null;
  scale_amount?: number;
  teachers?: StaffOpsClassTeacherPayItem[];
}

/** `POST /staff-ops/classes/:id/teachers` — thêm (hoặc mở lại) một gia sư. */
export interface StaffOpsAddClassTeacherPayload {
  teacher_id: string;
}

export interface StaffOpsSessionAttendancePayload
  extends AttendanceReviewFields {
  studentId: string;
  status: SessionAttendanceStatus;
  notes?: string | null;
}

export interface StaffOpsCreateSessionPayload extends SessionReviewFields {
  date: string;
  startTime?: string;
  endTime?: string;
  notes?: string | null;
  lessonContent?: string | null;
  homework?: string | null;
  tutorial?: string | null;
  recordingUrl?: string | null;
  coefficient?: number;
  attendance?: StaffOpsSessionAttendancePayload[];
}

export interface StaffOpsUpdateSessionPayload extends SessionReviewFields {
  date?: string;
  startTime?: string;
  endTime?: string;
  notes?: string | null;
  lessonContent?: string | null;
  homework?: string | null;
  tutorial?: string | null;
  recordingUrl?: string | null;
  coefficient?: number;
  attendance?: StaffOpsSessionAttendancePayload[];
}
