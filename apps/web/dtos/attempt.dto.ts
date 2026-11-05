import type {
  QuestionTypeValue,
  TrueFalseLabelStyleDto,
} from "@/dtos/question.dto";
export type AttemptStatusDto = "in_progress" | "submitted" | "timed_out";

/** Thang điểm của Bài làm: `equal_100` = 100/N (JP/ENG), `absolute_it` = điểm tuyệt đối 0,25 / 1 (IT). */
export type AttemptScoringDto = "equal_100" | "absolute_it";

/** Vị trí câu trong đề: Bắt buộc / Tự chọn 1 / Tự chọn 2. */
export type QuestionSlotDto = "required" | "elective_1" | "elective_2";

/** Lựa chọn 4 nhận định a–d: true = Đúng, false = Sai, null = chưa chọn. */
export type TrueFalseChoices = (boolean | null)[];

/** Chữ học sinh gõ vào từng ô trống; null = bỏ trống. */
export type BlankAnswers = (string | null)[];

export interface AttemptQuestionDto {
  questionId: string;
  order: number;
  /**
   * Thang điểm câu lúc start. `equal_100`: 100/N. `absolute_it`: đơn vị 1/100 điểm
   * (trắc nghiệm 25, Đúng/Sai 100).
   */
  pointsPossible: number;
  type: QuestionTypeValue;
  slot: QuestionSlotDto;
  content: string;
  /** Câu sắp xếp: thẻ đã xáo (thứ tự hiển thị của lượt). */
  options: string[] | null;
  /** Kiểu ô tự luận (snapshot): short = một dòng, long/null = nhiều dòng. */
  essayInputSize?: "short" | "long" | null;
  /** Kiểu nhãn Câu Đúng/Sai (snapshot); null = ○/×. */
  tfLabelStyle?: TrueFalseLabelStyleDto | null;
  choiceIndex: number | null;
  essayAnswer: string | null;
  tfChoices: TrueFalseChoices | null;
  /** Câu điền vào ô trống: số ô + chữ đã gõ từng ô (null = bỏ trống). Loại khác = null. */
  blankCount?: number | null;
  blankAnswers?: BlankAnswers | null;
  /** Câu sắp xếp: chữ thẻ theo thứ tự học sinh xếp. Loại khác = null. */
  orderAnswer?: string[] | null;
  markedForReview: boolean;
  correctIndex?: number | null;
  tfAnswerKey?: boolean[];
  /** Đáp án hợp lệ từng ô — chỉ có khi xem lại. */
  blankAnswerKey?: string[][] | null;
  /** Câu sắp xếp: thứ tự đúng — chỉ có khi xem lại. */
  orderingKey?: string[] | null;
  /** Tư liệu dùng chung (bản chụp lúc start); câu cùng `id` đứng liền nhau. */
  sharedMaterial?: {
    id: string;
    content: string;
    /** Audio của tư liệu; null = không có. */
    audio?: AttemptAudioView | null;
  } | null;
  /** Audio nhúng của câu; null = không có. */
  audio?: AttemptAudioView | null;
  isCorrect?: boolean | null;
  pointsAwarded?: number | null;
  /** Nhận xét gia sư cho câu tự luận (sau khi công bố kết quả). */
  feedback?: string | null;
  explanation?: string | null;
  answerGuide?: string | null;
}

/**
 * Audio trong lượt làm. Đang làm + có giới hạn lượt nghe: `url` = null, xin URL
 * qua `playAttemptAudio` (mỗi lần xin trừ một lượt). Đã nộp: URL thẳng, không
 * giới hạn, được tua.
 */
export interface AttemptAudioView {
  id: string;
  url: string | null;
  /** null = không giới hạn. */
  maxPlays: number | null;
  allowSeek: boolean;
  playsUsed: number;
}

/** Kết quả bấm phát audio giới hạn. */
export interface AttemptAudioPlayDto {
  url: string | null;
  maxPlays: number | null;
  playsUsed: number;
}

export interface AttemptDetailDto {
  id: string;
  assignmentId: string;
  classId: string;
  title: string;
  status: AttemptStatusDto;
  startedAt: string;
  durationMinutes: number;
  endsAt: string;
  remainingMs: number;
  submittedAt: string | null;
  autoGradedScore: number | null;
  autoGradedMax: number | null;
  /** Tổng điểm tối đa. `equal_100`: 100. `absolute_it`: câu bắt buộc + một nhóm tự chọn (đơn vị 1/100). */
  scoreMax: number;
  /** Tổng điểm tự luận đã chấm; null = chưa công bố / không có tự luận. */
  essayScore: number | null;
  /** Tổng điểm = trắc nghiệm + tự luận đã chấm; null = chưa công bố. */
  score: number | null;
  hasUngradedEssay: boolean;
  scoring: AttemptScoringDto;
  /** Học sinh làm cả hai nhóm tự chọn → phần tự chọn 0 điểm. */
  electiveVoided: boolean;
  electiveGroupNames: { elective_1: string | null; elective_2: string | null };
  /** Hạn lần giao = mở bài + thời lượng (null = không có hạn). */
  closeAt: string | null;
  /** false = đã nộp nhưng chưa tới hạn: API ẩn điểm và đáp án. */
  resultsReleased: boolean;
  questions: AttemptQuestionDto[];
}

export interface AttemptSummaryDto {
  id: string;
  status: AttemptStatusDto;
  startedAt: string;
  submittedAt: string | null;
  autoGradedScore: number | null;
  autoGradedMax: number | null;
  scoreMax: number;
  essayScore: number | null;
  score: number | null;
  hasUngradedEssay: boolean;
  scoring: AttemptScoringDto;
}

export interface AssignmentLobbyDto {
  assignmentId: string;
  classId: string;
  lessonId: string;
  title: string;
  durationMinutes: number;
  openAt: string | null;
  /** Hạn lần giao = mở bài + thời lượng (null = không có hạn). */
  closeAt: string | null;
  /** Đã tới hạn: không bắt đầu lượt mới; trước hạn điểm các lượt là null. */
  closed: boolean;
  attempts: AttemptSummaryDto[];
}

export interface SaveAttemptAnswersPayload {
  answers: Array<{
    questionId: string;
    choiceIndex?: number | null;
    essayAnswer?: string | null;
    tfChoices?: TrueFalseChoices | null;
    blankAnswers?: BlankAnswers | null;
    orderAnswer?: string[] | null;
    markedForReview?: boolean;
  }>;
}
