import { api } from "@/lib/client";
import type {
  AssignmentLobbyDto,
  AttemptDetailDto,
  SaveAttemptAnswersPayload,
} from "@/dtos/attempt.dto";

function base(classId: string) {
  return `/users/me/student-classes/${encodeURIComponent(classId)}`;
}

export async function getAssignmentLobby(
  classId: string,
  assignmentId: string,
): Promise<AssignmentLobbyDto> {
  const { data } = await api.get<AssignmentLobbyDto>(
    `${base(classId)}/assignments/${encodeURIComponent(assignmentId)}`,
  );
  return data;
}

export async function startAssignmentAttempt(
  classId: string,
  assignmentId: string,
): Promise<AttemptDetailDto> {
  const { data } = await api.post<AttemptDetailDto>(
    `${base(classId)}/assignments/${encodeURIComponent(assignmentId)}/attempts`,
  );
  return data;
}

export async function getAttempt(
  classId: string,
  attemptId: string,
): Promise<AttemptDetailDto> {
  const { data } = await api.get<AttemptDetailDto>(
    `${base(classId)}/attempts/${encodeURIComponent(attemptId)}`,
  );
  return data;
}

export async function saveAttemptAnswers(
  classId: string,
  attemptId: string,
  payload: SaveAttemptAnswersPayload,
): Promise<AttemptDetailDto> {
  const { data } = await api.patch<AttemptDetailDto>(
    `${base(classId)}/attempts/${encodeURIComponent(attemptId)}/answers`,
    payload,
  );
  return data;
}

export async function submitAttempt(
  classId: string,
  attemptId: string,
): Promise<AttemptDetailDto> {
  const { data } = await api.post<AttemptDetailDto>(
    `${base(classId)}/attempts/${encodeURIComponent(attemptId)}/submit`,
  );
  return data;
}
