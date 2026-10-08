import type {
  TrainingTutorDetail,
  TrainingTutorListParams,
  TrainingTutorPage,
  TrainingTutorSession,
  TrainingTutorSummary,
} from "@/dtos/training-tutor.dto";
import { api } from "@/lib/client";

export const trainingTutorKeys = {
  all: ["training-tutors"] as const,
  list: (params: TrainingTutorListParams) =>
    ["training-tutors", "list", params] as const,
  detail: (id: string) => ["training-tutors", "detail", id] as const,
  sessions: (id: string, page: number) =>
    ["training-tutors", "sessions", id, page] as const,
};

export async function listTrainingTutors(
  params: TrainingTutorListParams,
): Promise<TrainingTutorPage<TrainingTutorSummary>> {
  const response = await api.get<TrainingTutorPage<TrainingTutorSummary>>(
    "/training/tutors",
    {
      params: {
        page: params.page,
        limit: params.limit,
        ...(params.search ? { search: params.search } : {}),
        ...(params.status ? { status: params.status } : {}),
      },
    },
  );
  return response.data;
}

export async function getTrainingTutor(
  id: string,
): Promise<TrainingTutorDetail> {
  const response = await api.get<TrainingTutorDetail>(
    `/training/tutors/${encodeURIComponent(id)}`,
  );
  return response.data;
}

export async function listTrainingTutorSessions(
  id: string,
  page: number,
  limit: number,
): Promise<TrainingTutorPage<TrainingTutorSession>> {
  const response = await api.get<TrainingTutorPage<TrainingTutorSession>>(
    `/training/tutors/${encodeURIComponent(id)}/sessions`,
    { params: { page, limit } },
  );
  return response.data;
}
