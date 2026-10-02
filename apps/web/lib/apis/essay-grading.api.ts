import { api } from "@/lib/client";
import type {
  EssayGradingQueueDto,
  GradeEssayAnswerPayload,
} from "@/dtos/essay-grading.dto";

function base(classId: string, assignmentId: string) {
  return `/staff-ops/classes/${encodeURIComponent(
    classId,
  )}/assignments/${encodeURIComponent(assignmentId)}/grading-queue`;
}

export async function getEssayGradingQueue(
  classId: string,
  assignmentId: string,
): Promise<EssayGradingQueueDto> {
  const { data } = await api.get<EssayGradingQueueDto>(
    base(classId, assignmentId),
  );
  return data;
}

export async function gradeEssayAnswer(
  classId: string,
  assignmentId: string,
  attemptAnswerId: string,
  payload: GradeEssayAnswerPayload,
): Promise<void> {
  await api.patch(
    `${base(classId, assignmentId)}/${encodeURIComponent(attemptAnswerId)}`,
    payload,
  );
}
