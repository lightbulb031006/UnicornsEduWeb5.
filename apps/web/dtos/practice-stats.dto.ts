/** Trang Kết quả lần giao luyện tập + màn Bài làm của học sinh (phía dạy). */
import type {
  AttemptDetailDto,
  AttemptQuestionDto,
  AttemptScoringDto,
} from "@/dtos/attempt.dto";

/** `in_progress`: đang làm lượt mới — lượt nộp trước đó không chấm được nữa. */
export type PracticeStatsStudentStatus =
  | "graded"
  | "pending_essay"
  | "in_progress"
  | "not_started";

export interface PracticeStatsQuestionRateDto {
  questionId: string;
  order: number;
  type: "single_choice" | "essay" | "true_false_group" | "true_false" | "fill_blank" | "ordering";
  correctCount: number;
  sampleCount: number;
  /** 0..1, chỉ trên lượt đã chấm xong gần nhất của mỗi học sinh. */
  correctRate: number;
}

export interface PracticeStatsStudentRowDto {
  studentId: string;
  studentName: string;
  /** Điểm lượt đã chấm xong gần nhất; null nếu chưa có lượt đó. */
  score: number | null;
  /** `equal_100`: 100. `absolute_it`: tổng tối đa của đề (đơn vị 1/100 điểm). */
  scoreMax: number | null;
  /** Số thứ tự lượt đang tính điểm (1-based). */
  scoredAttemptNo: number | null;
  /** Số thứ tự lượt nộp mới nhất. */
  latestAttemptNo: number | null;
  /** Số lượt đã nộp. */
  attemptCount: number;
  durationMs: number | null;
  status: PracticeStatsStudentStatus;
}

export interface PracticeStatsDto {
  classId: string;
  assignmentId: string;
  title: string;
  className: string;
  openAt: string | null;
  durationMinutes: number | null;
  submittedCount: number;
  rosterCount: number;
  averageScore: number | null;
  /** Thang điểm để hiển thị: `absolute_it` thì điểm hiển thị = giá trị / 100. */
  scoring: AttemptScoringDto;
  /** Điểm tối đa của đề (lượt chấm xong gần nhất); null nếu chưa ai làm. */
  scoreMax: number | null;
  pendingEssayCount: number;
  questions: PracticeStatsQuestionRateDto[];
  students: PracticeStatsStudentRowDto[];
}

/** Một lượt đã nộp trong bộ chọn lượt của màn Bài làm. */
export interface StaffAttemptOptionDto {
  id: string;
  /** Số thứ tự lượt (1-based, theo giờ bắt đầu). */
  no: number;
  status: "submitted" | "timed_out";
  startedAt: string;
  submittedAt: string | null;
  score: number;
  scoreMax: number;
  hasUngradedEssay: boolean;
  /** Lượt đang tính điểm. */
  isScored: boolean;
  /** Bật được chế độ Chấm điểm: lượt mới nhất có câu tự luận. */
  gradable: boolean;
}

/** Các lượt đã nộp của một học sinh, mới nhất trước. */
export interface StaffStudentAttemptsDto {
  classId: string;
  assignmentId: string;
  title: string;
  studentId: string;
  studentName: string;
  scoring: AttemptScoringDto;
  /** Học sinh đang làm dở lượt mới. */
  inProgress: boolean;
  attempts: StaffAttemptOptionDto[];
}

export interface StaffAttemptQuestionDto extends AttemptQuestionDto {
  /** attempt_answers.id — để chấm câu tự luận. */
  attemptAnswerId: string;
}

export interface StaffAttemptDetailDto
  extends Omit<AttemptDetailDto, "questions"> {
  studentId: string;
  studentName: string;
  no: number;
  isScored: boolean;
  gradable: boolean;
  questions: StaffAttemptQuestionDto[];
}
