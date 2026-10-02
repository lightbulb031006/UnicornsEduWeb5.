/** Ticket #64 — Thống kê lần giao luyện tập (Màn 12). */

export type PracticeStatsStudentStatus =
  | "graded"
  | "pending_essay"
  | "not_started";

export interface PracticeStatsQuestionRateDto {
  questionId: string;
  order: number;
  type: "single_choice" | "essay";
  correctCount: number;
  sampleCount: number;
  /** 0..1, chỉ trên lượt tốt nhất đã chấm xong. */
  correctRate: number;
}

export interface PracticeStatsStudentRowDto {
  studentId: string;
  studentName: string;
  score: number | null;
  /** Luôn 100 khi đã chấm xong (thang 100/N). */
  scoreMax: number | null;
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
  pendingEssayCount: number;
  questions: PracticeStatsQuestionRateDto[];
  students: PracticeStatsStudentRowDto[];
}
