import { STUDENT_DROP_OUT_REASON_MAX_LENGTH, type StudentStatus } from "@/dtos/student.dto";

export function isMarkingStudentInactive(
  currentStatus: StudentStatus,
  nextStatus: StudentStatus,
): boolean {
  return currentStatus !== "inactive" && nextStatus === "inactive";
}

function getDropOutReasonLengthError(trimmed: string): string | null {
  return trimmed.length > STUDENT_DROP_OUT_REASON_MAX_LENGTH
    ? `Lý do tối đa ${STUDENT_DROP_OUT_REASON_MAX_LENGTH} ký tự.`
    : null;
}

/** Lỗi của lý do nghỉ điền bù (học sinh đã nghỉ), hoặc `null` nếu hợp lệ. */
export function validateBackfilledDropOutReason(reason: string): string | null {
  const trimmed = reason.trim();
  if (!trimmed) return "Nhập lý do nghỉ trước khi lưu.";
  return getDropOutReasonLengthError(trimmed);
}

/**
 * Lỗi của lý do nghỉ học trên form, hoặc `null` nếu hợp lệ. Chuyển sang nghỉ học
 * bắt buộc có lý do; các trường hợp khác lý do không bắt buộc nhưng vẫn giới hạn độ dài.
 */
export function validateStudentDropOutReason(params: {
  currentStatus: StudentStatus;
  nextStatus: StudentStatus;
  reason: string;
}): string | null {
  const trimmed = params.reason.trim();
  if (isMarkingStudentInactive(params.currentStatus, params.nextStatus) && !trimmed) {
    return "Chuyển học sinh sang nghỉ học phải nhập lý do nghỉ.";
  }
  return getDropOutReasonLengthError(trimmed);
}
