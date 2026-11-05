import type { AudioRef } from "./audio-asset.dto";

/** Tư liệu dùng chung (JP): đoạn văn/ảnh nhiều câu hỏi cùng dựa vào. */
export interface SharedMaterial {
  id: string;
  courseId: string;
  /** Chuyên đề của bộ — mọi câu trong bộ cùng chuyên đề này. */
  moduleId: string;
  title: string;
  /** HTML (TipTap). */
  content: string;
  /** Số câu (chưa xoá) đang gắn tư liệu. */
  questionCount: number;
  /** Audio dùng chung (JP), vd bài nghe cho cả nhóm câu. */
  audioId?: string | null;
  audio?: AudioRef | null;
  createdAt: string;
  updatedAt: string;
}

/** Tiết đang dùng bộ (tiết đi theo bộ → sửa bộ là sửa các tiết này). */
export interface SharedMaterialUsage {
  lessonCount: number;
  /** Số tiết trong đó đã giao cho lớp. */
  assignedLessonCount: number;
  /** Số tiết lý thuyết có bài ôn nhẹ chứa bộ / câu. */
  quizLessonCount: number;
}

export interface CreateSharedMaterialInput {
  courseId: string;
  moduleId: string;
  title: string;
  content: string;
  /** null = gỡ audio. */
  audioId?: string | null;
}

export type UpdateSharedMaterialInput = Partial<
  Pick<CreateSharedMaterialInput, "moduleId" | "title" | "content" | "audioId">
>;

export const SHARED_MATERIAL_TITLE_MAX = 200;
