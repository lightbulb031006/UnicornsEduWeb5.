import { api } from "@/lib/client";
import type { PracticeStatsDto } from "@/dtos/practice-stats.dto";

export async function getPracticeStats(
  classId: string,
  assignmentId: string,
): Promise<PracticeStatsDto> {
  const { data } = await api.get<PracticeStatsDto>(
    `/staff-ops/classes/${encodeURIComponent(classId)}/assignments/${encodeURIComponent(
      assignmentId,
    )}/stats`,
  );
  return data;
}
