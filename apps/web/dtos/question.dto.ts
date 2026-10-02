export enum QuestionTypeDto {
  single_choice = "single_choice",
  essay = "essay",
}

export interface Question {
  id: string;
  courseId: string;
  moduleId: string;
  difficultyLevelId: string;
  type: QuestionTypeDto;
  content: string;
  options: string[] | null;
  correctIndex: number | null;
  explanation: string | null;
  answerGuide: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Dữ liệu tối thiểu để đổ vào form soạn câu hỏi. Rộng hơn `Question` để nhận
 * được cả câu hỏi lấy từ `QuestionLink` (không kèm `createdAt`/`updatedAt`).
 */
export type QuestionFormInitial = Pick<
  Question,
  | "id"
  | "courseId"
  | "moduleId"
  | "difficultyLevelId"
  | "type"
  | "content"
  | "options"
  | "correctIndex"
  | "explanation"
  | "answerGuide"
>;

export interface CreateQuestionInput {
  courseId: string;
  moduleId: string;
  difficultyLevelId: string;
  type: QuestionTypeDto;
  content: string;
  options?: string[];
  correctIndex?: number;
  explanation?: string;
  answerGuide?: string;
}

export type UpdateQuestionInput = Partial<
  Omit<CreateQuestionInput, "courseId" | "moduleId" | "difficultyLevelId" | "type">
>;

export interface QuestionFilter {
  courseId?: string;
  moduleId?: string;
  difficultyLevelId?: string;
  type?: QuestionTypeDto;
  search?: string;
}

// --- AI Import types -------------------------------------------------------

/** Wizard steps in `AiImportModal`. */
export enum AiImportStep {
  prompt = "prompt",
  paste = "paste",
  review = "review",
}

/** Raw item from AI-generated JSON (difficulty is a name, not UUID) */
export interface AiQuestionItem {
  type: QuestionTypeDto;
  content: string;
  options?: string[];
  correctIndex?: number;
  explanation?: string;
  answerGuide?: string;
  difficulty: string;
}

/** Validated item with resolved difficultyLevelId */
export interface ValidatedAiQuestion extends Omit<AiQuestionItem, "difficulty"> {
  difficultyLevelId: string;
  difficultyName: string;
  _valid: boolean;
  _errors: string[];
}

/** Payload sent to backend bulk create */
export interface BulkCreateQuestionInput {
  courseId: string;
  moduleId: string;
  questions: Array<{
    type: QuestionTypeDto;
    content: string;
    options?: string[];
    correctIndex?: number;
    explanation?: string;
    answerGuide?: string;
    difficultyLevelId: string;
  }>;
}

export interface BulkCreateResponse {
  count: number;
  questions: Question[];
}
