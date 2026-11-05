import { api } from "@/lib/client";
import type { GradeEssayAnswerPayload } from "@/dtos/essay-grading.dto";

export async function gradeEssayAnswer(
  classId: string,
  assignmentId: string,
  attemptAnswerId: string,
  payload: GradeEssayAnswerPayload,
): Promise<void> {
  await api.patch(
    `/staff-ops/classes/${encodeURIComponent(
      classId,
    )}/assignments/${encodeURIComponent(
      assignmentId,
    )}/grading-queue/${encodeURIComponent(attemptAnswerId)}`,
    payload,
  );
}
