import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { CONTENT_LIMITS } from './content-limits';

@ValidatorConstraint({ name: 'trueFalseChoice' })
class TrueFalseChoiceConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return value === null || typeof value === 'boolean';
  }

  defaultMessage(): string {
    return 'tfChoices chỉ nhận true, false hoặc null';
  }
}

@ValidatorConstraint({ name: 'blankAnswer' })
export class BlankAnswerConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return value === null || (typeof value === 'string' && value.length <= 200);
  }

  defaultMessage(): string {
    return 'blankAnswers chỉ nhận chuỗi ≤ 200 ký tự hoặc null';
  }
}

export type AttemptScoringDto = 'equal_100' | 'absolute_it';
export type QuestionSlotDto = 'required' | 'elective_1' | 'elective_2';

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
    nullable: true,
    type: [Boolean],
    description:
      'Lựa chọn Đúng/Sai: true (Đúng) / false (Sai) / null (bỏ trống). Nhóm câu Đúng/Sai 4 phần tử; Câu Đúng/Sai (JP) 1 phần tử.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @Validate(TrueFalseChoiceConstraint, { each: true })
  tfChoices?: (boolean | null)[] | null;

  @ApiPropertyOptional({
    nullable: true,
    type: [String],
    description:
      'Câu điền vào ô trống (JP): chữ học sinh gõ vào từng ô theo thứ tự; null/rỗng = bỏ trống.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @Validate(BlankAnswerConstraint, { each: true })
  blankAnswers?: (string | null)[] | null;

  @ApiPropertyOptional({
    nullable: true,
    type: [String],
    description:
      'Câu sắp xếp (JP): chữ thẻ theo thứ tự học sinh xếp; [] = chưa xếp.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  orderAnswer?: string[] | null;

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

/**
 * Audio trong lượt làm. Đang làm + có giới hạn lượt nghe: `url` = null, xin URL
 * qua `POST .../audio/:audioId/play` (mỗi lần xin trừ một lượt). Đã nộp: URL
 * thẳng, không giới hạn, được tua.
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

export interface AttemptQuestionDto {
  questionId: string;
  order: number;
  /** `equal_100`: 100/N (Hamilton). `absolute_it`: 25 / 100, đơn vị 1/100 điểm. */
  pointsPossible: number;
  type:
    | 'single_choice'
    | 'essay'
    | 'true_false_group'
    | 'true_false'
    | 'fill_blank'
    | 'ordering';
  /** Vị trí câu: Bắt buộc / Tự chọn 1 / Tự chọn 2. */
  slot: QuestionSlotDto;
  content: string;
  /** single_choice: phương án; true_false_group: 4 nhận định a–d; ordering: thẻ đã xáo. */
  options: string[] | null;
  /** Kiểu ô tự luận (snapshot): short = một dòng, long/null = nhiều dòng. */
  essayInputSize: 'short' | 'long' | null;
  /** Kiểu nhãn Câu Đúng/Sai (snapshot): maru_batsu (○/×, mặc định khi null) / dung_sai / true_false. */
  tfLabelStyle: 'maru_batsu' | 'dung_sai' | 'true_false' | null;
  choiceIndex: number | null;
  /** Lựa chọn 4 nhận định (Đúng/Sai/trống); null với loại khác. */
  tfChoices: (boolean | null)[] | null;
  /** Đáp án 4 nhận định — chỉ khi đã nộp. */
  tfAnswerKey?: boolean[] | null;
  /** Câu điền vào ô trống: số ô; null với loại khác. */
  blankCount: number | null;
  /** Chữ học sinh gõ từng ô (độ dài = blankCount); null với loại khác. */
  blankAnswers: (string | null)[] | null;
  /** Đáp án hợp lệ từng ô — chỉ khi đã nộp. */
  blankAnswerKey?: string[][] | null;
  /** Câu sắp xếp: chữ thẻ theo thứ tự học sinh xếp; null với loại khác. */
  orderAnswer: string[] | null;
  /** Câu sắp xếp: thứ tự đúng — chỉ khi đã nộp. */
  orderingKey?: string[] | null;
  /**
   * Tư liệu dùng chung (bản chụp lúc start). Các câu cùng `id` đứng liền nhau —
   * web hiện nội dung một lần trước câu đầu của khối.
   */
  sharedMaterial: {
    id: string;
    content: string;
    /** Audio của tư liệu; null = không có. */
    audio: AttemptAudioView | null;
  } | null;
  /** Audio nhúng của câu; null = không có. */
  audio: AttemptAudioView | null;
  essayAnswer: string | null;
  markedForReview: boolean;
  correctIndex?: number | null;
  isCorrect?: boolean | null;
  pointsAwarded?: number | null;
  /** Nhận xét gia sư cho câu tự luận (chỉ trả khi đã công bố kết quả). */
  feedback?: string | null;
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
  /** Tổng điểm tối đa của bài (`equal_100` = 100; `absolute_it` = tổng câu bắt buộc + một nhóm tự chọn). */
  scoreMax: number;
  /** Tổng điểm câu tự luận đã chấm; null khi chưa công bố hoặc bài không có tự luận. */
  essayScore: number | null;
  /** Tổng điểm = trắc nghiệm + tự luận đã chấm; null khi chưa công bố. */
  score: number | null;
  hasUngradedEssay: boolean;
  scoring: AttemptScoringDto;
  /** Làm cả hai nhóm tự chọn → phần tự chọn 0 điểm. */
  electiveVoided: boolean;
  /** Tên hai nhóm tự chọn (null nếu chưa đặt). */
  electiveGroupNames: { elective_1: string | null; elective_2: string | null };
  /** Hạn lần giao = `openAt + durationMinutes` (null = lần giao cũ không có hạn). */
  closeAt: Date | null;
  /**
   * false = đã nộp nhưng chưa tới hạn: điểm (`autoGradedScore`/`autoGradedMax`),
   * `electiveVoided` và đáp án từng câu bị ẩn.
   */
  resultsReleased: boolean;
  questions: AttemptQuestionDto[];
}

export interface AttemptSummaryDto {
  id: string;
  status: 'in_progress' | 'submitted' | 'timed_out';
  startedAt: Date;
  submittedAt: Date | null;
  autoGradedScore: number | null;
  autoGradedMax: number | null;
  /** Xem `AttemptDetailDto.scoreMax`. */
  scoreMax: number;
  /** Xem `AttemptDetailDto.essayScore`. */
  essayScore: number | null;
  /** Xem `AttemptDetailDto.score`. */
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
  openAt: Date | null;
  /** Hạn lần giao = `openAt + durationMinutes` (null = không có hạn). */
  closeAt: Date | null;
  /** Đã tới hạn: không bắt đầu lượt mới, điểm các lượt được công bố. */
  closed: boolean;
  /** Điểm trong `attempts` là null khi chưa tới hạn. */
  attempts: AttemptSummaryDto[];
}

/**
 * Trạng thái hàng học sinh trên trang Kết quả lần giao.
 * - `in_progress`: đang làm một lượt mới (lượt nộp trước đó không chấm được nữa).
 * - `pending_essay`: lượt nộp mới nhất còn tự luận chưa chấm — vào được chế độ Chấm điểm.
 * - `graded`: có lượt đã chấm xong, lượt mới nhất không chờ chấm.
 * - `not_started`: chưa nộp lượt nào.
 */
export type PracticeStatsStudentStatus =
  | 'graded'
  | 'pending_essay'
  | 'in_progress'
  | 'not_started';

export interface PracticeStatsQuestionRateDto {
  questionId: string;
  /** Vị trí câu trong đề (1-based). */
  order: number;
  type:
    | 'single_choice'
    | 'essay'
    | 'true_false_group'
    | 'true_false'
    | 'fill_blank'
    | 'ordering';
  correctCount: number;
  /** Số học sinh có lượt đã chấm xong gần nhất chứa câu này. */
  sampleCount: number;
  /** 0..1 — chỉ trên lượt đã chấm xong gần nhất của mỗi học sinh. */
  correctRate: number;
}

export interface PracticeStatsStudentRowDto {
  studentId: string;
  studentName: string;
  /** Tổng điểm lượt đã chấm xong gần nhất (đơn vị theo `scoring`); null nếu chưa có lượt đó. */
  score: number | null;
  /** Điểm tối đa của lượt đó. */
  scoreMax: number | null;
  /** Số thứ tự (1-based, theo giờ bắt đầu) của lượt đang tính điểm; null nếu chưa có. */
  scoredAttemptNo: number | null;
  /** Số thứ tự lượt nộp mới nhất; null nếu chưa nộp lượt nào. */
  latestAttemptNo: number | null;
  /** Số lượt đã nộp (submitted / timed_out), không tính in_progress. */
  attemptCount: number;
  /** Thời gian làm của lượt dùng để hiện điểm (hoặc lượt nộp mới nhất nếu chưa có điểm). */
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
  /** Trung bình điểm các học sinh có điểm (đơn vị theo `scoring`); null nếu chưa ai. */
  averageScore: number | null;
  /** Thang điểm để hiển thị: `absolute_it` thì điểm hiển thị = giá trị / 100. */
  scoring: AttemptScoringDto;
  /** Điểm tối đa của đề (lượt chấm xong gần nhất); null nếu chưa ai làm. */
  scoreMax: number | null;
  pendingEssayCount: number;
  questions: PracticeStatsQuestionRateDto[];
  students: PracticeStatsStudentRowDto[];
}

/** Một lượt đã nộp trong bộ chọn lượt của màn Bài làm (phía dạy). */
export interface StaffAttemptOptionDto {
  id: string;
  /** Số thứ tự lượt (1-based, theo giờ bắt đầu). */
  no: number;
  status: 'submitted' | 'timed_out';
  startedAt: Date;
  submittedAt: Date | null;
  /** Trắc nghiệm + tự luận đã chấm. */
  score: number;
  scoreMax: number;
  hasUngradedEssay: boolean;
  /** Lượt đang tính điểm (lượt đã chấm xong gần nhất). */
  isScored: boolean;
  /** Bật được chế độ Chấm điểm: lượt mới nhất và có câu tự luận. */
  gradable: boolean;
}

/** Các lượt đã nộp của một học sinh trên một lần giao (mới nhất trước). */
export interface StaffStudentAttemptsDto {
  classId: string;
  assignmentId: string;
  title: string;
  studentId: string;
  studentName: string;
  scoring: AttemptScoringDto;
  /** Học sinh đang làm dở một lượt mới — lượt đã nộp không chấm được nữa. */
  inProgress: boolean;
  attempts: StaffAttemptOptionDto[];
}

export interface StaffAttemptQuestionDto extends AttemptQuestionDto {
  /** attempt_answers.id — dùng để chấm câu tự luận. */
  attemptAnswerId: string;
}

/** Bài làm của học sinh cho phía dạy: luôn kèm đáp án, điểm, nhận xét. */
export interface StaffAttemptDetailDto extends Omit<
  AttemptDetailDto,
  'questions'
> {
  studentId: string;
  studentName: string;
  no: number;
  isScored: boolean;
  gradable: boolean;
  questions: StaffAttemptQuestionDto[];
}
