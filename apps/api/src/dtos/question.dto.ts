import type { AudioRefDto } from './audio-asset.dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  ArrayMinSize,
  ArrayMaxSize,
  Max,
  Min,
  ValidateNested,
  IsIn,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Độ dài tối đa một đáp án hợp lệ của ô trống. */
export const BLANK_ANSWER_MAX_LENGTH = 200;

/** Một ô trống: danh sách đáp án hợp lệ, mỗi đáp án là chuỗi ≤ 200 ký tự, tối đa 10. */
@ValidatorConstraint({ name: 'blankAcceptedAnswers' })
class BlankAcceptedAnswersConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return (
      Array.isArray(value) &&
      value.length <= 10 &&
      value.every(
        (a) => typeof a === 'string' && a.length <= BLANK_ANSWER_MAX_LENGTH,
      )
    );
  }

  defaultMessage(): string {
    return `Mỗi ô trống có tối đa 10 đáp án hợp lệ, mỗi đáp án ≤ ${BLANK_ANSWER_MAX_LENGTH} ký tự`;
  }
}

export enum QuestionTypeDto {
  single_choice = 'single_choice',
  essay = 'essay',
  /** Nhóm câu Đúng/Sai: 4 nhận định a–d trong `options`, đáp án trong `tfAnswerKey`. */
  true_false_group = 'true_false_group',
  /** Câu Đúng/Sai (JP): một nhận định trong `content`, đáp án `tfAnswerKey: [boolean]`. */
  true_false = 'true_false',
  /** Câu điền vào ô trống (JP): ô `[[___]]` trong `content`, đáp án hợp lệ `blankAnswerKey`. */
  fill_blank = 'fill_blank',
  /** Câu sắp xếp (JP): thẻ trong `options` theo thứ tự đúng; học sinh nhận thẻ đã xáo. */
  ordering = 'ordering',
}

/** Kiểu nhãn Câu Đúng/Sai (JP): ○/× (mặc định), Đúng/Sai, True/False. */
export enum TrueFalseLabelStyleDto {
  maru_batsu = 'maru_batsu',
  dung_sai = 'dung_sai',
  true_false = 'true_false',
}

/** Kỹ năng câu hỏi (chỉ hồ sơ JP). */
export enum QuestionSkillDto {
  kanji = 'kanji',
  vocabulary = 'vocabulary',
  grammar = 'grammar',
  reading = 'reading',
  listening = 'listening',
  conversation = 'conversation',
  writing = 'writing',
}

/** Kiểu ô nhập câu tự luận (chỉ hồ sơ JP). */
export enum EssayInputSizeDto {
  short = 'short',
  long = 'long',
}

// --- Response DTOs ----------------------------------------------------------

export interface QuestionResponseDto {
  id: string;
  courseId: string;
  moduleId: string;
  difficultyLevelId: string;
  type: QuestionTypeDto;
  content: string;
  options: string[] | null;
  correctIndex: number | null;
  /** Đáp án 4 nhận định (true = Đúng); rỗng với loại khác. */
  tfAnswerKey: boolean[];
  explanation: string | null;
  answerGuide: string | null;
  /** Kỹ năng (JP); rỗng với hồ sơ khác hoặc câu JP cũ. */
  skills: QuestionSkillDto[];
  /** Kiểu ô tự luận (JP); null = ô dài (câu cũ / hồ sơ khác). */
  essayInputSize: EssayInputSizeDto | null;
  /** Kiểu nhãn Câu Đúng/Sai (JP); null = ○/×. */
  tfLabelStyle: TrueFalseLabelStyleDto | null;
  /** Câu điền vào ô trống (JP): đáp án hợp lệ từng ô; null với loại khác. */
  blankAnswerKey: string[][] | null;
  /** Tư liệu dùng chung (JP); null = câu đứng riêng. */
  sharedMaterialId: string | null;
  /** Audio nhúng của câu (JP); null = không có. */
  audioId: string | null;
  /** Audio kèm signed URL ngắn hạn. */
  audio: AudioRefDto | null;
  createdAt: Date;
  updatedAt: Date;
}

// --- Request DTOs -----------------------------------------------------------

export class CreateQuestionDto {
  @ApiProperty({
    description: 'Course ID the question belongs to',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsUUID()
  courseId: string;

  @ApiProperty({
    description: 'Module (Chuyên đề) ID the question belongs to',
    example: 'b2c3d4e5-f6a7-8901-bcde-f123456789ab',
  })
  @IsUUID()
  moduleId: string;

  @ApiProperty({
    description: 'Difficulty level ID (must belong to the same course)',
    example: 'c3d4e5f6-a7b8-9012-cdef-123456789abc',
  })
  @IsUUID()
  difficultyLevelId: string;

  @ApiProperty({ description: 'Question type', enum: QuestionTypeDto })
  @IsIn(Object.values(QuestionTypeDto))
  type: QuestionTypeDto;

  @ApiProperty({
    description: 'Question content (HTML from TipTap)',
    example: '<p>What is $x^2$?</p>',
  })
  @IsString()
  content: string;

  @ApiPropertyOptional({
    description:
      'single_choice: 2–6 phương án; true_false_group: đúng 4 nhận định a–d (HTML); ordering: 2–12 thẻ theo đúng thứ tự.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(2)
  @ArrayMaxSize(12)
  options?: string[];

  @ApiPropertyOptional({
    description:
      'Zero‑based index of the correct option (required for single_choice).',
    example: 2,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  correctIndex?: number;

  @ApiPropertyOptional({
    description:
      'Đáp án Đúng/Sai (true = Đúng). true_false_group: 4 nhận định a–d theo thứ tự `options`; true_false (JP): đúng 1 phần tử.',
    type: [Boolean],
    example: [true, false, false, true],
  })
  @IsOptional()
  @IsArray()
  @IsBoolean({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  tfAnswerKey?: boolean[];

  @ApiPropertyOptional({
    description: 'Explanation shown after answering (HTML).',
    example: '<p>Because ...</p>',
  })
  @IsOptional()
  @IsString()
  explanation?: string;

  @ApiPropertyOptional({
    description: 'Guide text for essay answers (HTML).',
    example: '<p>Write about …</p>',
  })
  @IsOptional()
  @IsString()
  answerGuide?: string;
  @ApiPropertyOptional({
    description:
      'Kỹ năng (chỉ hồ sơ JP, chọn nhiều). JP bắt buộc ≥1 khi tạo/sửa; IT/ENG không được gửi.',
    enum: QuestionSkillDto,
    isArray: true,
    example: ['vocabulary', 'reading'],
  })
  @IsOptional()
  @IsArray()
  @IsIn(Object.values(QuestionSkillDto), { each: true })
  @ArrayMaxSize(7)
  skills?: QuestionSkillDto[];

  @ApiPropertyOptional({
    description:
      'Kiểu ô nhập câu tự luận (chỉ hồ sơ JP): short = một dòng, long = nhiều dòng. null = ô dài. Chỉ đổi giao diện làm bài.',
    enum: EssayInputSizeDto,
    nullable: true,
  })
  @IsOptional()
  @IsIn(Object.values(EssayInputSizeDto))
  essayInputSize?: EssayInputSizeDto | null;

  @ApiPropertyOptional({
    description:
      'Kiểu nhãn Câu Đúng/Sai (chỉ true_false, JP): maru_batsu = ○/× (mặc định khi null), dung_sai = Đúng/Sai, true_false = True/False.',
    enum: TrueFalseLabelStyleDto,
    nullable: true,
  })
  @IsOptional()
  @IsIn(Object.values(TrueFalseLabelStyleDto))
  tfLabelStyle?: TrueFalseLabelStyleDto | null;

  @ApiPropertyOptional({
    description:
      'Câu điền vào ô trống (chỉ fill_blank, JP): đáp án hợp lệ của từng ô `[[___]]` theo thứ tự trong `content`. Mỗi ô ≥1 đáp án. So khớp bỏ khoảng trắng đầu/cuối (cả toàn góc), số/Latin toàn góc = nửa góc, không phân biệt hoa/thường; kana/kanji không tự tương đương.',
    type: 'array',
    items: { type: 'array', items: { type: 'string' } },
    example: [['九時', '9時'], ['五時']],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @Validate(BlankAcceptedAnswersConstraint, { each: true })
  blankAnswerKey?: string[][];

  @ApiPropertyOptional({
    description:
      'Không dùng để gắn bộ: khác null → 400. Câu mới trong bộ qua POST /shared-materials/:id/questions.',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  sharedMaterialId?: string | null;

  @ApiPropertyOptional({
    description:
      'Audio nhúng (JP) — id từ POST /audio-assets, cùng khoá. null = gỡ audio.',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  audioId?: string | null;
}

/** DTO for updating a question – all fields optional */
export class UpdateQuestionDto {
  @ApiPropertyOptional({ description: 'Question content (HTML)' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({
    description: 'Array of option strings (HTML or LaTeX).',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(2)
  @ArrayMaxSize(12)
  options?: string[];

  @ApiPropertyOptional({
    description: 'Zero‑based index of the correct option.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  correctIndex?: number;

  @ApiPropertyOptional({
    description:
      'Đáp án Đúng/Sai (true = Đúng). true_false_group: 4 nhận định a–d theo thứ tự `options`; true_false (JP): đúng 1 phần tử.',
    type: [Boolean],
    example: [true, false, false, true],
  })
  @IsOptional()
  @IsArray()
  @IsBoolean({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  tfAnswerKey?: boolean[];

  @ApiPropertyOptional({ description: 'Explanation (HTML).' })
  @IsOptional()
  @IsString()
  explanation?: string;

  @ApiPropertyOptional({ description: 'Essay answer guide (HTML).' })
  @IsOptional()
  @IsString()
  answerGuide?: string;
  @ApiPropertyOptional({
    description:
      'Kỹ năng (chỉ hồ sơ JP, chọn nhiều). JP bắt buộc ≥1 khi tạo/sửa; IT/ENG không được gửi.',
    enum: QuestionSkillDto,
    isArray: true,
    example: ['vocabulary', 'reading'],
  })
  @IsOptional()
  @IsArray()
  @IsIn(Object.values(QuestionSkillDto), { each: true })
  @ArrayMaxSize(7)
  skills?: QuestionSkillDto[];

  @ApiPropertyOptional({
    description:
      'Kiểu ô nhập câu tự luận (chỉ hồ sơ JP): short = một dòng, long = nhiều dòng. null = ô dài. Chỉ đổi giao diện làm bài.',
    enum: EssayInputSizeDto,
    nullable: true,
  })
  @IsOptional()
  @IsIn(Object.values(EssayInputSizeDto))
  essayInputSize?: EssayInputSizeDto | null;

  @ApiPropertyOptional({
    description:
      'Kiểu nhãn Câu Đúng/Sai (chỉ true_false, JP): maru_batsu = ○/× (mặc định khi null), dung_sai = Đúng/Sai, true_false = True/False.',
    enum: TrueFalseLabelStyleDto,
    nullable: true,
  })
  @IsOptional()
  @IsIn(Object.values(TrueFalseLabelStyleDto))
  tfLabelStyle?: TrueFalseLabelStyleDto | null;

  @ApiPropertyOptional({
    description:
      'Câu điền vào ô trống (chỉ fill_blank, JP): đáp án hợp lệ của từng ô `[[___]]` theo thứ tự trong `content`. Mỗi ô ≥1 đáp án. So khớp bỏ khoảng trắng đầu/cuối (cả toàn góc), số/Latin toàn góc = nửa góc, không phân biệt hoa/thường; kana/kanji không tự tương đương.',
    type: 'array',
    items: { type: 'array', items: { type: 'string' } },
    example: [['九時', '9時'], ['五時']],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @Validate(BlankAcceptedAnswersConstraint, { each: true })
  blankAnswerKey?: string[][];

  @ApiPropertyOptional({
    description:
      'Không dùng để đổi bộ: khác bộ hiện tại → 400. Đổi bộ qua POST / DELETE /shared-materials/:id/questions/:questionId.',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  sharedMaterialId?: string | null;

  @ApiPropertyOptional({
    description:
      'Audio nhúng (JP) — id từ POST /audio-assets, cùng khoá. null = gỡ audio.',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  audioId?: string | null;
}

// --- Bulk import DTOs -------------------------------------------------------

export class BulkCreateQuestionItemDto {
  @ApiProperty({ description: 'Question type', enum: QuestionTypeDto })
  @IsIn(Object.values(QuestionTypeDto))
  type: QuestionTypeDto;

  @ApiProperty({ description: 'Question content (HTML from TipTap)' })
  @IsString()
  content: string;

  @ApiPropertyOptional({
    description:
      'single_choice: 2–6 phương án; true_false_group: đúng 4 nhận định a–d; ordering: 2–12 thẻ theo đúng thứ tự.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(2)
  @ArrayMaxSize(12)
  options?: string[];

  @ApiPropertyOptional({
    description: 'Zero-based correct option index. Required for single_choice.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  correctIndex?: number;

  @ApiPropertyOptional({
    description:
      'Đáp án Đúng/Sai (true = Đúng). true_false_group: 4 nhận định a–d theo thứ tự `options`; true_false (JP): đúng 1 phần tử.',
    type: [Boolean],
    example: [true, false, false, true],
  })
  @IsOptional()
  @IsArray()
  @IsBoolean({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  tfAnswerKey?: boolean[];

  @ApiPropertyOptional({ description: 'Explanation (single_choice).' })
  @IsOptional()
  @IsString()
  explanation?: string;

  @ApiPropertyOptional({ description: 'Answer guide (essay).' })
  @IsOptional()
  @IsString()
  answerGuide?: string;

  @ApiProperty({
    description: 'Difficulty level ID (must belong to the same course)',
  })
  @IsUUID()
  difficultyLevelId: string;
  @ApiPropertyOptional({
    description:
      'Kỹ năng (chỉ hồ sơ JP, chọn nhiều). JP bắt buộc ≥1 cho từng câu; IT/ENG không được gửi.',
    enum: QuestionSkillDto,
    isArray: true,
    example: ['vocabulary', 'reading'],
  })
  @IsOptional()
  @IsArray()
  @IsIn(Object.values(QuestionSkillDto), { each: true })
  @ArrayMaxSize(7)
  skills?: QuestionSkillDto[];

  @ApiPropertyOptional({
    description:
      'Kiểu ô nhập câu tự luận (chỉ essay, JP): short = một dòng, long = nhiều dòng. Bỏ trống = ô dài.',
    enum: EssayInputSizeDto,
  })
  @IsOptional()
  @IsIn(Object.values(EssayInputSizeDto))
  essayInputSize?: EssayInputSizeDto;

  @ApiPropertyOptional({
    description:
      'Kiểu nhãn Câu Đúng/Sai (chỉ true_false, JP): maru_batsu = ○/× (mặc định), dung_sai = Đúng/Sai, true_false = True/False.',
    enum: TrueFalseLabelStyleDto,
  })
  @IsOptional()
  @IsIn(Object.values(TrueFalseLabelStyleDto))
  tfLabelStyle?: TrueFalseLabelStyleDto;

  @ApiPropertyOptional({
    description:
      'Câu điền vào ô trống (chỉ fill_blank, JP): đáp án hợp lệ của từng ô `[[___]]` theo thứ tự trong `content`, mỗi ô ≥1 đáp án.',
    type: 'array',
    items: { type: 'array', items: { type: 'string' } },
    example: [['九時', '9時'], ['五時']],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @Validate(BlankAcceptedAnswersConstraint, { each: true })
  blankAnswerKey?: string[][];
}

export class BulkCreateQuestionDto {
  @ApiProperty({ description: 'Course ID for all questions' })
  @IsUUID()
  courseId: string;

  @ApiProperty({ description: 'Module ID for all questions' })
  @IsUUID()
  moduleId: string;

  @ApiProperty({
    description: 'Array of questions to import',
    type: [BulkCreateQuestionItemDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => BulkCreateQuestionItemDto)
  questions: BulkCreateQuestionItemDto[];
}

/** DTO for filtering the question list */
export class QuestionFilterDto {
  @ApiPropertyOptional({ description: 'Filter by Course ID' })
  @IsOptional()
  @IsUUID()
  courseId?: string;

  @ApiPropertyOptional({ description: 'Filter by Module ID' })
  @IsOptional()
  @IsUUID()
  moduleId?: string;

  @ApiPropertyOptional({ description: 'Filter by Difficulty Level ID' })
  @IsOptional()
  @IsUUID()
  difficultyLevelId?: string;

  @ApiPropertyOptional({
    description: 'Filter by question type',
    enum: QuestionTypeDto,
  })
  @IsOptional()
  @IsIn(Object.values(QuestionTypeDto))
  type?: QuestionTypeDto;

  @ApiPropertyOptional({
    description: 'Full‑text search on content (case‑insensitive)',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Lọc câu có kỹ năng này (JP)',
    enum: QuestionSkillDto,
  })
  @IsOptional()
  @IsIn(Object.values(QuestionSkillDto))
  skill?: QuestionSkillDto;

  @ApiPropertyOptional({
    description:
      'Lọc câu trong Bộ câu hỏi này (JP) — kết quả xếp theo thứ tự bộ.',
  })
  @IsOptional()
  @IsUUID()
  sharedMaterialId?: string;

  @ApiPropertyOptional({
    description: "'true' = chỉ câu lẻ (không thuộc bộ nào) — ngân hàng JP hiện bộ dạng thẻ riêng.",
    enum: ['true'],
  })
  @IsOptional()
  @IsIn(['true'])
  standalone?: 'true';
}
