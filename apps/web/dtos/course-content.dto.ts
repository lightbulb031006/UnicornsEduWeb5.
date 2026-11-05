import type { AudioRef } from "./audio-asset.dto";
import type {
  QuestionTypeDto,
  QuestionTypeValue,
  TrueFalseLabelStyleDto,
} from "@/dtos/question.dto";
import type {
  BlankAnswers,
  QuestionSlotDto,
  TrueFalseChoices,
} from "@/dtos/attempt.dto";

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
  /** Null ở payload học sinh (link YouTube bị giấu) — dùng `hasVideo`. */
  videoUrl: string | null;
  /** Chỉ có ở payload học sinh: tiết có video bảo vệ. */
  hasVideo?: boolean;
  content: string | null;
  order: number;
  /** Tên nhóm tự chọn (tiết thực hành IT). */
  elective1Name?: string | null;
  elective2Name?: string | null;
  /** Thời lượng làm bài (phút/lượt) — chỉ tiết thực hành. */
  durationMinutes?: number | null;
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
  /** Bắt buộc với tiết thực hành. Integer 1–720. */
  durationMinutes?: number;
}

export interface UpdateCourseLessonPayload {
  title?: string;
  videoUrl?: string | null;
  content?: string | null;
  elective1Name?: string | null;
  elective2Name?: string | null;
  /** Chỉ tiết thực hành. Integer 1–720. */
  durationMinutes?: number;
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
  tfAnswerKey: boolean[];
  explanation: string | null;
  answerGuide: string | null;
  essayInputSize?: "short" | "long" | null;
  tfLabelStyle?: TrueFalseLabelStyleDto | null;
  blankAnswerKey?: string[][] | null;
  /** Tư liệu dùng chung (JP); null = câu đứng riêng. */
  sharedMaterialId?: string | null;
  /** Vị trí trong bộ — trong tiết, câu của bộ theo thứ tự này. */
  setPosition?: number | null;
  sharedMaterial?: { id: string; title: string } | null;
  /** Audio nhúng (JP) — giữ khi sửa câu từ màn xếp đề. */
  audioId?: string | null;
  audio?: AudioRef | null;
}

export interface QuestionLink {
  id: string;
  lessonId: string;
  questionId: string;
  order: number | null;
  points: number | null;
  slot: QuestionSlotDto;
  question: QuestionLinkQuestion;
}

export interface QuestionLinkSummary {
  totalQuestions: number;
  totalPoints: number;
  /** Tổng trọng số (null tính là 1) — hồ sơ JP. */
  totalWeight: number;
  /** Lý do đề sai form nhóm tự chọn (IT); null khi hợp lệ. */
  formWarning: string | null;
}

export interface CreateQuestionLinkPayload {
  questionId: string;
  order?: number | null;
  points?: number | null;
  slot?: QuestionSlotDto;
}

export interface UpdateQuestionLinkPayload {
  order?: number | null;
  points?: number | null;
  slot?: QuestionSlotDto;
}

export interface LessonQuizQuestion {
  id: string;
  lessonId: string;
  questionId: string;
  order: number;
  question: {
    id: string;
    type: QuestionTypeValue;
    content: string;
    options: string[] | null;
    correctIndex: number | null;
    tfAnswerKey?: boolean[];
    explanation: string | null;
    answerGuide: string | null;
    /** Kiểu ô tự luận (JP): short = một dòng, long/null = nhiều dòng. */
    essayInputSize?: "short" | "long" | null;
    /** Kiểu nhãn Câu Đúng/Sai (JP); null = ○/×. */
    tfLabelStyle?: TrueFalseLabelStyleDto | null;
    /** Đáp án hợp lệ từng ô — học sinh làm bài nhận null. */
    blankAnswerKey?: string[][] | null;
    /** Số ô trống (câu điền vào ô trống). */
    blankCount?: number | null;
    /** Audio nhúng (JP): signed URL ngắn hạn. */
    audioUrl?: string | null;
    /** Tư liệu dùng chung (JP); câu cùng tư liệu đứng liền nhau. */
    sharedMaterial?: {
      id: string;
      content: string;
      audioUrl?: string | null;
    } | null;
  };
}

export interface LessonQuizAnswer {
  id: string;
  lessonId: string;
  questionId: string;
  studentId: string;
  choiceIndex: number | null;
  essayAnswer: string | null;
  tfChoices?: TrueFalseChoices | null;
  blankAnswers?: BlankAnswers | null;
  orderAnswer?: string[] | null;
  createdAt: string;
  updatedAt: string;
  question: {
    id: string;
    type: QuestionTypeValue;
    content: string;
    options: string[] | null;
    correctIndex: number | null;
    tfAnswerKey?: boolean[];
    explanation: string | null;
    answerGuide: string | null;
    /** Kiểu ô tự luận (JP): short = một dòng, long/null = nhiều dòng. */
    essayInputSize?: "short" | "long" | null;
    /** Kiểu nhãn Câu Đúng/Sai (JP); null = ○/×. */
    tfLabelStyle?: TrueFalseLabelStyleDto | null;
    /** Đáp án hợp lệ từng ô — học sinh làm bài nhận null. */
    blankAnswerKey?: string[][] | null;
    /** Số ô trống (câu điền vào ô trống). */
    blankCount?: number | null;
    /** Audio nhúng (JP): signed URL ngắn hạn. */
    audioUrl?: string | null;
    /** Tư liệu dùng chung (JP); câu cùng tư liệu đứng liền nhau. */
    sharedMaterial?: {
      id: string;
      content: string;
      audioUrl?: string | null;
    } | null;
  };
}

export interface SubmitQuizAnswerPayload {
  questionId: string;
  choiceIndex?: number | null;
  essayAnswer?: string | null;
  tfChoices?: TrueFalseChoices | null;
  blankAnswers?: BlankAnswers | null;
  orderAnswer?: string[] | null;
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

/** Một chuyên đề của khoá nhìn từ một lớp (GET /class/:classId/modules). */
export interface ClassModuleDto {
  moduleId: string;
  title: string;
  /** Thứ tự chuyên đề trong khoá. */
  sortOrder: number;
  /** Thứ tự nhóm của riêng lớp (nhỏ lên trước); null khi lớp chưa thêm. */
  classSortOrder: number | null;
  theoryLessonCount: number;
  practiceLessonCount: number;
  /** Số tiết của chuyên đề lớp đang có (không tính tiết đã gỡ). */
  inClassLessonCount: number;
  added: boolean;
  addedAt: string | null;
}

/** Ảnh hưởng nếu gỡ khỏi lớp — dialog xác nhận báo trước, không chặn gỡ. */
export interface ClassContentRemovalImpactDto {
  ungradedEssayCount: number;
  inProgressStudentCount: number;
}

/** Ảnh hưởng nếu gỡ cả chuyên đề. */
export interface ClassModuleRemovalImpactDto
  extends ClassContentRemovalImpactDto {
  moduleId: string;
}

/** Ảnh hưởng nếu gỡ một tiết khỏi lớp. */
export interface ClassContentItemRemovalImpactDto
  extends ClassContentRemovalImpactDto {
  itemId: string;
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
