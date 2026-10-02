import type { QuestionTypeDto } from "@/dtos/question.dto";

export type LessonKind = "theory" | "practice";

/** Chuyên đề — nhóm tiết học cấp cao nhất bên trong một Khoá học. */
export interface CourseModule {
  id: string;
  courseId: string;
  title: string;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
  lessonCount?: number;
}

/** Tiết học — đơn vị nội dung học sinh nhìn thấy và làm việc trực tiếp. */
export interface CourseLesson {
  id: string;
  kind: LessonKind;
  courseId: string | null;
  moduleId: string | null;
  classId: string | null;
  title: string;
  videoUrl: string | null;
  content: string | null;
  order: number;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt?: string;
  updatedAt?: string;
  quizCount?: number;
  questionCount?: number;
}

export interface KnowledgeTreeLessonNode {
  lesson: CourseLesson;
}

export interface KnowledgeTreeNode {
  module: CourseModule;
  lessons: KnowledgeTreeLessonNode[];
}

export interface CreateCourseModulePayload {
  title: string;
}

export interface UpdateCourseModulePayload {
  title?: string;
}

export interface CreateCourseLessonPayload {
  kind: LessonKind;
  title: string;
  videoUrl?: string | null;
  content?: string | null;
}

export interface UpdateCourseLessonPayload {
  title?: string;
  videoUrl?: string | null;
  content?: string | null;
}

export interface QuestionLinkQuestion {
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
}

export interface QuestionLink {
  id: string;
  lessonId: string;
  questionId: string;
  order: number | null;
  points: number | null;
  question: QuestionLinkQuestion;
}

export interface QuestionLinkSummary {
  totalQuestions: number;
  totalPoints: number;
}

export interface CreateQuestionLinkPayload {
  questionId: string;
  order?: number | null;
  points?: number | null;
}

export interface UpdateQuestionLinkPayload {
  order?: number | null;
  points?: number | null;
}

export interface LessonQuizQuestion {
  id: string;
  lessonId: string;
  questionId: string;
  order: number;
  question: {
    id: string;
    type: string;
    content: string;
    options: string[] | null;
    correctIndex: number | null;
    explanation: string | null;
    answerGuide: string | null;
  };
}

export interface LessonQuizAnswer {
  id: string;
  lessonId: string;
  questionId: string;
  studentId: string;
  choiceIndex: number | null;
  essayAnswer: string | null;
  createdAt: string;
  updatedAt: string;
  question: {
    id: string;
    type: string;
    content: string;
    options: string[] | null;
    correctIndex: number | null;
    explanation: string | null;
    answerGuide: string | null;
  };
}

export interface SubmitQuizAnswerPayload {
  questionId: string;
  choiceIndex?: number | null;
  essayAnswer?: string | null;
}

/** Tiết học từ khoá — dùng cho panel chọn nội dung lớp. */
export interface CourseLessonForClassDto {
  id: string;
  title: string;
  kind: LessonKind;
  moduleTitle: string;
  moduleId: string;
  alreadyAdded: boolean;
}

export interface ExamLibraryItem extends CourseLesson {
  module: { id: string; title: string; sortOrder: number } | null;
  questionCount: number;
}

export interface ExamLibraryListResult {
  data: ExamLibraryItem[];
  total: number;
  page: number;
  limit: number;
}

export interface ExamLibraryFilters {
  search?: string;
  moduleId?: string;
  page?: number;
  limit?: number;
}
