"use client";

import { useMutation } from "@tanstack/react-query";
import { uploadQuestionImage } from "@/lib/apis/question-image.api";
import type { QuestionImageRef } from "@/dtos/question-image.dto";

/**
 * Hàm tải ảnh cho `MathRichTextEditor.onUploadImage` (ảnh vào bucket, không
 * dán URL). undefined khi chưa chọn khoá — editor ẩn nút chèn ảnh.
 */
export function useQuestionImageUpload(
  courseId: string | undefined,
): ((file: File) => Promise<QuestionImageRef>) | undefined {
  const { mutateAsync } = useMutation({
    mutationFn: (file: File) => uploadQuestionImage(courseId!, file),
  });
  return courseId ? mutateAsync : undefined;
}
