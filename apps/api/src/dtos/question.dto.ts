import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
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
} from 'class-validator';
import { Type } from 'class-transformer';

export enum QuestionTypeDto {
  single_choice = 'single_choice',
  essay = 'essay',
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
  explanation: string | null;
  answerGuide: string | null;
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
    description: 'Array of option strings (HTML or LaTeX). Length 2‑6.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
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
  @ArrayMaxSize(6)
  options?: string[];

  @ApiPropertyOptional({
    description: 'Zero‑based index of the correct option.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  correctIndex?: number;

  @ApiPropertyOptional({ description: 'Explanation (HTML).' })
  @IsOptional()
  @IsString()
  explanation?: string;

  @ApiPropertyOptional({ description: 'Essay answer guide (HTML).' })
  @IsOptional()
  @IsString()
  answerGuide?: string;
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
    description: 'Array of option strings. Required for single_choice.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  options?: string[];

  @ApiPropertyOptional({
    description: 'Zero-based correct option index. Required for single_choice.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  correctIndex?: number;

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
}
