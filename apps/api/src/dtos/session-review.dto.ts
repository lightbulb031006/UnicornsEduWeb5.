import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { HomeworkQuality, SessionProgressStatus } from '../../generated/enums';
import { CONTENT_LIMITS } from './content-limits';

/**
 * Phần chung của Nhận xét buổi học có cấu trúc.
 * Bắt buộc/điều kiện được kiểm ở `SessionValidationService.validateSessionReviewFields`.
 */
export class SessionReviewFieldsDto {
  @ApiPropertyOptional({
    enum: SessionProgressStatus,
    description: 'Tiến độ buổi. Bắt buộc khi gửi nội dung buổi.',
  })
  @IsOptional()
  @IsEnum(SessionProgressStatus)
  progressStatus?: SessionProgressStatus;

  @ApiPropertyOptional({
    description: 'Phần đã xong (plain text, mỗi dòng 1 ý).',
    maxLength: CONTENT_LIMITS.sessionReviewText,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(CONTENT_LIMITS.sessionReviewText)
  progressDone?: string | null;

  @ApiPropertyOptional({
    description: 'Phần chưa xong kèm lý do (plain text, mỗi dòng 1 ý).',
    maxLength: CONTENT_LIMITS.sessionReviewText,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(CONTENT_LIMITS.sessionReviewText)
  progressRemaining?: string | null;

  @ApiPropertyOptional({ description: 'Buổi có Kiểm tra trong buổi.' })
  @IsOptional()
  @IsBoolean()
  hasInClassTest?: boolean;

  @ApiPropertyOptional({
    description: 'Nội dung kiểm tra (bắt buộc khi hasInClassTest).',
    maxLength: CONTENT_LIMITS.sessionReviewText,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(CONTENT_LIMITS.sessionReviewText)
  inClassTestContent?: string | null;

  @ApiPropertyOptional({
    description: 'Tổng số câu kiểm tra, ≥ 1 (bắt buộc khi hasInClassTest).',
    example: 10,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  inClassTestTotal?: number | null;

  @ApiPropertyOptional({
    description: 'Hạn nộp BTVN (ISO 8601, có offset). Không bắt buộc.',
    example: '2026-10-19T20:00:00+07:00',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  homeworkDueAt?: string | null;

  @ApiPropertyOptional({
    description: 'Nội dung dự kiến buổi sau. Bắt buộc khi gửi nội dung buổi.',
    maxLength: CONTENT_LIMITS.sessionReviewText,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(CONTENT_LIMITS.sessionReviewText)
  nextSessionPlan?: string | null;

  @ApiPropertyOptional({ description: 'Buổi sau có kiểm tra lại.' })
  @IsOptional()
  @IsBoolean()
  hasRetest?: boolean;

  @ApiPropertyOptional({
    description: 'Nội dung kiểm tra lại (bắt buộc khi hasRetest).',
    maxLength: CONTENT_LIMITS.sessionReviewText,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(CONTENT_LIMITS.sessionReviewText)
  retestContent?: string | null;
}

/**
 * Phần từng học sinh của Nhận xét buổi học có cấu trúc.
 * Bắt buộc theo trạng thái điểm danh, kiểm ở `SessionValidationService.validateAttendanceReview`.
 */
export class AttendanceReviewFieldsDto {
  @ApiPropertyOptional({
    description: 'Số câu đúng (0..inClassTestTotal) khi buổi có kiểm tra.',
    example: 8,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  testCorrectCount?: number | null;

  @ApiPropertyOptional({
    description: 'Nhận xét kết quả kiểm tra.',
    maxLength: CONTENT_LIMITS.sessionReviewText,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(CONTENT_LIMITS.sessionReviewText)
  testComment?: string | null;

  @ApiPropertyOptional({
    description: 'Điểm tốt (plain text, mỗi dòng 1 ý).',
    maxLength: CONTENT_LIMITS.sessionReviewText,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(CONTENT_LIMITS.sessionReviewText)
  strengths?: string | null;

  @ApiPropertyOptional({
    description: 'Cần cải thiện (plain text, mỗi dòng 1 ý).',
    maxLength: CONTENT_LIMITS.sessionReviewText,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(CONTENT_LIMITS.sessionReviewText)
  improvements?: string | null;

  @ApiPropertyOptional({
    enum: HomeworkQuality,
    description: 'Chất lượng BTVN buổi trước.',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEnum(HomeworkQuality)
  homeworkQuality?: HomeworkQuality | null;

  @ApiPropertyOptional({
    description: 'Nhận xét BTVN buổi trước.',
    maxLength: CONTENT_LIMITS.sessionReviewText,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(CONTENT_LIMITS.sessionReviewText)
  homeworkComment?: string | null;
}
