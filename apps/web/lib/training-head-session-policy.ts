import type {
  SessionAttendanceStatus,
  SessionUpdatePayload,
  TrainingHeadSessionUpdatePayload,
} from "@/dtos/session.dto";

/**
 * 14/11: bản web của `apps/api/src/session/training-head-session-policy.ts`.
 * Trưởng ban Đào tạo không điểm danh thay gia sư — chỉ đánh dấu / bỏ đánh dấu
 * Học thử. Giữ luật khớp backend; backend vẫn là nơi chặn cuối.
 */
export function isTrainingHeadAttendanceTransitionAllowed(
  from: SessionAttendanceStatus,
  to: SessionAttendanceStatus,
): boolean {
  return from === "trial" || to === "trial";
}

/**
 * Payload form buổi (`SessionHistoryTable` chế độ `trainingHeadEdit`) →
 * body `PATCH /staff-ops/sessions/:id/training-head`. Bỏ mọi field khác.
 */
export function toTrainingHeadSessionUpdatePayload(
  data: SessionUpdatePayload,
): TrainingHeadSessionUpdatePayload {
  return {
    ...(data.coefficient === 0 || data.coefficient === 1
      ? { coefficient: data.coefficient }
      : {}),
    ...(typeof data.allowanceAmount === "number"
      ? { allowanceAmount: data.allowanceAmount }
      : {}),
    ...(data.attendance && data.attendance.length > 0
      ? {
          attendance: data.attendance.map(({ studentId, status }) => ({
            studentId,
            status,
          })),
        }
      : {}),
  };
}
