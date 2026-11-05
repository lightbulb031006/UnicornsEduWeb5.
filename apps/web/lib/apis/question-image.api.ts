import { api } from "@/lib/client";
import type { QuestionImageRef } from "@/dtos/question-image.dto";

/** Tải ảnh nội dung câu hỏi / Bộ câu hỏi lên bucket private (ảnh bất biến). */
export async function uploadQuestionImage(
  courseId: string,
  file: File,
): Promise<QuestionImageRef> {
  const formData = new FormData();
  formData.append("courseId", courseId);
  formData.append("file", file);
  const response = await api.post<QuestionImageRef>("/question-images", formData);
  return response.data;
}
