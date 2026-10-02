import type { CreateQuestionInput, Question } from "@/dtos/question.dto";

export type ClassQuestionDraftSource = "bank" | "ai" | "authored";

export const CLASS_QUESTION_SOURCE_LABEL: Record<
  ClassQuestionDraftSource,
  string
> = {
  bank: "Từ ngân hàng",
  ai: "✨ AI · mới",
  authored: "✏ Soạn mới",
};

export interface ClassQuestionDraft {
  key: string;
  source: ClassQuestionDraftSource;
  questionId?: string;
  content: string;
  typeLabel: string;
  createPayload?: CreateQuestionInput;
  preview?: Pick<Question, "id" | "content" | "type">;
}
