import type { SessionAttendanceStatus } from "@/dtos/session.dto";

export type SessionFormAttendanceDirtyItem = {
  studentId: string;
  status: SessionAttendanceStatus;
  notes: string;
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
  isTrialLesson: boolean;
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
    isTrialLesson: input.isTrialLesson,
    skipAttendance: Boolean(input.skipAttendance),
    teacherPaymentStatus: input.teacherPaymentStatus.trim(),
    teacherId: input.teacherId.trim(),
    manualAllowanceGrossOverride: input.manualAllowanceGrossOverride,
    attendance: input.attendance.map((item) => ({
      studentId: item.studentId,
      status: item.status,
      notes: item.notes,
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
