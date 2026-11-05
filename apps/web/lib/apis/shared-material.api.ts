import { api } from "@/lib/client";
import type { CreateQuestionInput, Question } from "@/dtos/question.dto";
import type {
  CreateSharedMaterialInput,
  SharedMaterial,
  SharedMaterialUsage,
  UpdateSharedMaterialInput,
} from "@/dtos/shared-material.dto";

export async function getSharedMaterials(
  courseId: string,
): Promise<SharedMaterial[]> {
  const response = await api.get<SharedMaterial[]>("/shared-materials", {
    params: { courseId },
  });
  return response.data;
}

export async function createSharedMaterial(
  data: CreateSharedMaterialInput,
): Promise<SharedMaterial> {
  const response = await api.post<SharedMaterial>("/shared-materials", data);
  return response.data;
}

export async function updateSharedMaterial(
  id: string,
  data: UpdateSharedMaterialInput,
): Promise<SharedMaterial> {
  const response = await api.patch<SharedMaterial>(
    `/shared-materials/${id}`,
    data,
  );
  return response.data;
}

/** Sắp lại thứ tự câu trong bộ — gửi đủ mọi câu của bộ theo thứ tự mới. */
export async function reorderSetQuestions(
  id: string,
  questionIds: string[],
): Promise<void> {
  await api.put(`/shared-materials/${id}/question-order`, { questionIds });
}

/** Số tiết đang dùng bộ — cảnh báo trước khi sửa bộ. */
export async function getSharedMaterialUsage(
  id: string,
): Promise<SharedMaterialUsage> {
  const response = await api.get<SharedMaterialUsage>(
    `/shared-materials/${id}/usage`,
  );
  return response.data;
}

/** Số tiết / bài ôn đang chứa một câu — cảnh báo khi chuyển câu vào / ra bộ. */
export async function getQuestionLessonUsage(
  questionId: string,
): Promise<SharedMaterialUsage> {
  const response = await api.get<SharedMaterialUsage>(
    `/shared-materials/questions/${questionId}/usage`,
  );
  return response.data;
}

/** Câu mới viết trong form bộ: nhận chuyên đề của bộ, đứng cuối bộ. */
export async function createSetQuestion(
  id: string,
  data: CreateQuestionInput,
): Promise<Question> {
  const response = await api.post<Question>(
    `/shared-materials/${id}/questions`,
    data,
  );
  return response.data;
}

/** Câu lẻ vào bộ: gỡ link lẻ, vào mọi tiết / bài ôn dùng bộ. */
export async function moveQuestionIntoSet(
  id: string,
  questionId: string,
): Promise<void> {
  await api.post(`/shared-materials/${id}/questions/${questionId}`);
}

/** Câu ra khỏi bộ: biến mất khỏi các tiết / bài ôn dùng bộ. */
export async function moveQuestionOutOfSet(
  id: string,
  questionId: string,
): Promise<void> {
  await api.delete(`/shared-materials/${id}/questions/${questionId}`);
}

export async function deleteSharedMaterial(id: string): Promise<void> {
  await api.delete(`/shared-materials/${id}`);
}
