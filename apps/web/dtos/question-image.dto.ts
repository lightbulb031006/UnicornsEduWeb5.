/**
 * Ảnh vừa tải vào bucket private. `path` lưu trong HTML
 * (`<img data-question-image>`); `url` là signed URL ngắn hạn để hiện ngay —
 * API tự ký lại mỗi lần trả nội dung. null = storage lỗi.
 */
export interface QuestionImageRef {
  path: string;
  url: string | null;
}

export const QUESTION_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
export const QUESTION_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
