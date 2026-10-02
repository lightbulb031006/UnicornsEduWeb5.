import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CONTENT_LIMITS } from './content-limits';

export class GradeEssayAnswerDto {
  @ApiProperty({
    description:
      'Điểm chấm cho câu tự luận này (0..pointsPossible snapshot = 100/N)',
  })
  @IsInt()
  @Min(0)
  pointsAwarded: number;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Nhận xét của gia sư cho học sinh về câu này',
    maxLength: CONTENT_LIMITS.feedback,
  })
  @IsOptional()
  @IsString()
  @MaxLength(CONTENT_LIMITS.feedback)
  feedback?: string | null;
}

/** Một câu tự luận đang chờ chấm trong hàng đợi (thuộc lượt làm mới nhất của học sinh). */
export interface EssayGradingQueueItemDto {
  attemptAnswerId: string;
  attemptId: string;
  studentId: string;
  studentName: string;
  /** Tổng số lượt học sinh đã làm cho lần giao này (để hiển thị banner "làm N lượt"). */
  studentAttemptCount: number;
  /** Mốc thời gian lượt mới nhất (submittedAt, fallback startedAt). */
  attemptSubmittedAt: Date;
  /** Vị trí câu trong đề (1-based) để hiển thị "Câu N/Total". */
  questionOrder: number;
  totalQuestions: number;
  questionContent: string;
  /** Tên mức độ khó của câu (CourseDifficultyLevel.name). */
  difficultyLabel: string;
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

export class SaveAttemptAnswerItemDto {
  @ApiProperty({ description: 'Question id' })
  @IsString()
  questionId: string;

  @ApiPropertyOptional({ nullable: true, description: 'MCQ choice index' })
  @IsOptional()
  @IsInt()
  @Min(0)
  choiceIndex?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Essay text',
    maxLength: CONTENT_LIMITS.essayAnswer,
  })
  @IsOptional()
  @IsString()
  @MaxLength(CONTENT_LIMITS.essayAnswer)
  essayAnswer?: string | null;

  @ApiPropertyOptional({
    description: 'Học sinh đánh dấu quay lại xem trước nộp',
  })
  @IsOptional()
  @IsBoolean()
  markedForReview?: boolean;
}

export class SaveAttemptAnswersDto {
  @ApiProperty({ type: [SaveAttemptAnswerItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaveAttemptAnswerItemDto)
  answers: SaveAttemptAnswerItemDto[];
}

export interface AttemptQuestionDto {
  questionId: string;
  order: number;
  /** Thang điểm câu lúc start = 100/N (Hamilton); tổng mọi câu = 100. */
  pointsPossible: number;
  type: 'single_choice' | 'essay';
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
  status: 'in_progress' | 'submitted' | 'timed_out';
  startedAt: Date;
  durationMinutes: number;
  endsAt: Date;
  remainingMs: number;
  submittedAt: Date | null;
  autoGradedScore: number | null;
  autoGradedMax: number | null;
  /** Tổng điểm bài (= 100 sau khi chia đều N câu lúc start). */
  scoreMax: number;
  hasUngradedEssay: boolean;
  questions: AttemptQuestionDto[];
}

export interface AttemptSummaryDto {
  id: string;
  status: 'in_progress' | 'submitted' | 'timed_out';
  startedAt: Date;
  submittedAt: Date | null;
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
  openAt: Date | null;
  attempts: AttemptSummaryDto[];
}

/** Trạng thái hàng học sinh trên bảng thống kê lần giao (Màn 12). */
export type PracticeStatsStudentStatus =
  | 'graded'
  | 'pending_essay'
  | 'not_started';

export interface PracticeStatsQuestionRateDto {
  questionId: string;
  /** Vị trí câu trong đề (1-based). */
  order: number;
  type: 'single_choice' | 'essay';
  correctCount: number;
  /** Số học sinh có lượt tốt nhất đã chấm xong chứa câu này. */
  sampleCount: number;
  /** 0..1 — chỉ trên lượt tốt nhất đã chấm xong. */
  correctRate: number;
}

export interface PracticeStatsStudentRowDto {
  studentId: string;
  studentName: string;
  /** Tổng điểm lượt cao nhất đã chấm xong trên thang 100; null nếu chưa có lượt đó. */
  score: number | null;
  /** Luôn 100 khi đã chấm xong (tổng snapshot 100/N). */
  scoreMax: number | null;
  /** Số lượt đã nộp (submitted / timed_out), không tính in_progress. */
  attemptCount: number;
  /** Thời gian làm của lượt dùng để hiện điểm (hoặc lượt nộp mới nhất nếu chờ chấm). */
  durationMs: number | null;
  status: PracticeStatsStudentStatus;
}

export interface PracticeStatsDto {
  classId: string;
  assignmentId: string;
  title: string;
  className: string;
  openAt: Date | null;
  durationMinutes: number | null;
  submittedCount: number;
  rosterCount: number;
  /** Trung bình điểm các học sinh đã chấm xong trên thang 100; null nếu chưa ai. */
  averageScore: number | null;
  pendingEssayCount: number;
  questions: PracticeStatsQuestionRateDto[];
  students: PracticeStatsStudentRowDto[];
}
