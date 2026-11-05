import type { SessionAttendanceStatus } from "@/dtos/session.dto";
import type {
  SessionReviewFormValue,
  StudentReviewFormValue,
} from "@/lib/session-review-form";

export type SessionFormAttendanceDirtyItem = {
  studentId: string;
  status: SessionAttendanceStatus;
  review: StudentReviewFormValue;
  tuitionFee: string;
};

export type SessionFormDirtySnapshot = {
  date: string;
  startTime: string;
  endTime: string;
  lessonContent: string;
  homework: string;
  tutorial: string;
  recordingUrl?: string;
  review: SessionReviewFormValue;
  skipAttendance?: boolean;
  teacherPaymentStatus: string;
  teacherId: string;
  manualAllowanceGrossOverride: number | null;
  attendance: SessionFormAttendanceDirtyItem[];
};

export function buildSessionFormDirtySnapshot(
  input: SessionFormDirtySnapshot,
): string {
  return JSON.stringify({
    date: input.date.trim(),
    startTime: input.startTime.trim(),
    endTime: input.endTime.trim(),
    lessonContent: input.lessonContent,
    homework: input.homework,
    tutorial: input.tutorial,
    recordingUrl: (input.recordingUrl ?? "").trim(),
    review: input.review,
    skipAttendance: Boolean(input.skipAttendance),
    teacherPaymentStatus: input.teacherPaymentStatus.trim(),
    teacherId: input.teacherId.trim(),
    manualAllowanceGrossOverride: input.manualAllowanceGrossOverride,
    attendance: input.attendance.map((item) => ({
      studentId: item.studentId,
      status: item.status,
      review: item.review,
      tuitionFee: item.tuitionFee.trim(),
    })),
  });
}

export function isSessionFormDirty(
  baselineSerialized: string | null,
  current: SessionFormDirtySnapshot,
): boolean {
  if (!baselineSerialized) return false;
  return buildSessionFormDirtySnapshot(current) !== baselineSerialized;
}
