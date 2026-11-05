import { api } from "@/lib/client";
import type {
  PracticeStatsDto,
  StaffAttemptDetailDto,
  StaffStudentAttemptsDto,
} from "@/dtos/practice-stats.dto";

function base(classId: string, assignmentId: string) {
  return `/staff-ops/classes/${encodeURIComponent(
    classId,
  )}/assignments/${encodeURIComponent(assignmentId)}`;
}

export async function getPracticeStats(
  classId: string,
  assignmentId: string,
): Promise<PracticeStatsDto> {
  const { data } = await api.get<PracticeStatsDto>(
    `${base(classId, assignmentId)}/stats`,
  );
  return data;
}

export async function getStudentAttempts(
  classId: string,
  assignmentId: string,
  studentId: string,
): Promise<StaffStudentAttemptsDto> {
  const { data } = await api.get<StaffStudentAttemptsDto>(
    `${base(classId, assignmentId)}/students/${encodeURIComponent(
      studentId,
    )}/attempts`,
  );
  return data;
}

export async function getStaffAttempt(
  classId: string,
  assignmentId: string,
  attemptId: string,
): Promise<StaffAttemptDetailDto> {
  const { data } = await api.get<StaffAttemptDetailDto>(
    `${base(classId, assignmentId)}/attempts/${encodeURIComponent(attemptId)}`,
  );
  return data;
}
