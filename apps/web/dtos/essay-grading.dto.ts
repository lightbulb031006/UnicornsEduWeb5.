/** Ticket #63 — Chấm tự luận: hàng đợi lượt làm mới nhất. */

export interface EssayGradingQueueItemDto {
  attemptAnswerId: string;
  attemptId: string;
  studentId: string;
  studentName: string;
  /** Tổng số lượt học sinh đã làm lần giao này (banner "làm N lượt"). */
  studentAttemptCount: number;
  /** Mốc thời gian lượt mới nhất (ISO). */
  attemptSubmittedAt: string;
  /** Vị trí câu trong đề (1-based) — hiển thị "Câu N/Total". */
  questionOrder: number;
  totalQuestions: number;
  questionContent: string;
  /** Tên mức độ khó (snapshot lúc start). */
  difficultyLabel: string;
  /** Thang điểm câu = 100/N lúc start. */
  pointsPossible: number;
  answerGuide: string | null;
  essayAnswer: string | null;
}

export interface EssayGradingQueueDto {
  classId: string;
  assignmentId: string;
  title: string;
  totalPending: number;
  items: EssayGradingQueueItemDto[];
}

export interface GradeEssayAnswerPayload {
  pointsAwarded: number;
  feedback?: string | null;
}
