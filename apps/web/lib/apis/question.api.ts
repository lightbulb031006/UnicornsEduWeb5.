import { api } from "@/lib/client";
import type {
  Question,
  CreateQuestionInput,
  UpdateQuestionInput,
  QuestionFilter,
  BulkCreateQuestionInput,
  BulkCreateResponse,
} from "@/dtos/question.dto";

export async function getQuestions(
  filter: QuestionFilter = {},
  skip = 0,
  take = 20,
): Promise<Question[]> {
  const params = new URLSearchParams();
  if (filter.courseId) params.set("courseId", filter.courseId);
  if (filter.moduleId) params.set("moduleId", filter.moduleId);
  if (filter.difficultyLevelId)
    params.set("difficultyLevelId", filter.difficultyLevelId);
  if (filter.type) params.set("type", filter.type);
  if (filter.search) params.set("search", filter.search);
  params.set("skip", String(skip));
  params.set("take", String(take));
  const response = await api.get<Question[]>(
    `/questions?${params.toString()}`,
  );
  return response.data;
}

export async function getQuestion(id: string): Promise<Question> {
  const response = await api.get<Question>(`/questions/${id}`);
  return response.data;
}

export async function createQuestion(
  data: CreateQuestionInput,
): Promise<Question> {
  const response = await api.post<Question>("/questions", data);
  return response.data;
}

export async function updateQuestion(
  id: string,
  data: UpdateQuestionInput,
): Promise<Question> {
  const response = await api.patch<Question>(`/questions/${id}`, data);
  return response.data;
}

export async function deleteQuestion(id: string): Promise<Question> {
  const response = await api.delete<Question>(`/questions/${id}`);
  return response.data;
}

export async function bulkCreateQuestions(
  data: BulkCreateQuestionInput,
): Promise<BulkCreateResponse> {
  const response = await api.post<BulkCreateResponse>("/questions/bulk", data);
  return response.data;
}
