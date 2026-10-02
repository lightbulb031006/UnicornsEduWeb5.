export type AttemptStatusDto = "in_progress" | "submitted" | "timed_out";

export interface AttemptQuestionDto {
  questionId: string;
  order: number;
  /** Thang điểm câu lúc start = 100/N; tổng mọi câu = 100. */
  pointsPossible: number;
  type: "single_choice" | "essay";
  content: string;
  options: string[] | null;
  choiceIndex: number | null;
  essayAnswer: string | null;
  markedForReview: boolean;
  correctIndex?: number | null;
  isCorrect?: boolean | null;
  pointsAwarded?: number | null;
  explanation?: string | null;
  answerGuide?: string | null;
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
  /** Tổng điểm bài (= 100 sau khi chia đều N câu lúc start). */
  scoreMax: number;
  hasUngradedEssay: boolean;
  questions: AttemptQuestionDto[];
}

export interface AttemptSummaryDto {
  id: string;
  status: AttemptStatusDto;
  startedAt: string;
  submittedAt: string | null;
  autoGradedScore: number | null;
  autoGradedMax: number | null;
  hasUngradedEssay: boolean;
}

export interface AssignmentLobbyDto {
  assignmentId: string;
  classId: string;
  lessonId: string;
  title: string;
  durationMinutes: number;
  openAt: string | null;
  attempts: AttemptSummaryDto[];
}

export interface SaveAttemptAnswersPayload {
  answers: Array<{
    questionId: string;
    choiceIndex?: number | null;
    essayAnswer?: string | null;
    markedForReview?: boolean;
  }>;
}
