import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { IsClassId } from '../common/entity-id.validators';

/**
 * Bài khảo sát (Survey): thay thế "lần khảo sát N toàn cục" cũ bằng entity có
 * khoảng thời gian [startDate, endDate] + danh sách lớp loại trừ + thông báo kèm.
 */
export class CreateSurveyDto {
  @ApiProperty({
    description: 'Tên bài khảo sát.',
    example: 'Kiểm tra định kì lần 7',
  })
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiProperty({
    description: 'Ngày bắt đầu YYYY-MM-DD.',
    example: '2026-07-19',
  })
  @IsDateString()
  start_date: string;

  @ApiProperty({
    description: 'Ngày kết thúc YYYY-MM-DD.',
    example: '2026-07-26',
  })
  @IsDateString()
  end_date: string;

  @ApiPropertyOptional({
    description: 'Tiêu đề thông báo kèm theo (nếu có push notification).',
    example: 'THÔNG BÁO KIỂM TRA ĐỊNH KÌ LẦN 7',
  })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  notification_title?: string;

  @ApiPropertyOptional({
    description: 'Nội dung thông báo (mục "Nội dung"), plain text nhiều dòng.',
  })
  @IsOptional()
  @IsString()
  notification_content?: string;

  @ApiPropertyOptional({
    description:
      'Hướng dẫn thực hiện (mục "Hướng dẫn"), plain text nhiều dòng.',
  })
  @IsOptional()
  @IsString()
  notification_instructions?: string;

  @ApiPropertyOptional({
    description: 'Lưu ý (mục "Lưu ý"), plain text nhiều dòng.',
  })
  @IsOptional()
  @IsString()
  notification_notes?: string;

  @ApiPropertyOptional({
    description:
      'Hướng dẫn dành cho gia sư (mục "Gia sư"), plain text nhiều dòng.',
  })
  @IsOptional()
  @IsString()
  notification_teacher_note?: string;

  @ApiPropertyOptional({
    description: 'Danh sách classId bị loại trừ khỏi yêu cầu báo cáo bài này.',
    example: ['UNICL-0123456789'],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsClassId({ each: true })
  excluded_class_ids?: string[];
}

export class UpdateSurveyDto extends PartialType(CreateSurveyDto) {}

export interface SurveyRecord {
  id: string;
  name: string | null;
  startDate: string | null;
  endDate: string | null;
  notificationTitle: string | null;
  notificationContent: string | null;
  notificationInstructions: string | null;
  notificationNotes: string | null;
  notificationTeacherNote: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  excludedClassIds: string[];
  totalRunningClasses: number;
  reportedCount: number;
  missingCount: number;
}

export interface SurveyListDto {
  data: SurveyRecord[];
  meta: { total: number; page: number; limit: number };
}

export interface SurveyMissingClassDto {
  classId: string;
  name: string;
  teachers: string[];
}

export interface SurveyMissingClassListDto {
  data: SurveyMissingClassDto[];
  meta: { total: number; page: number; limit: number };
}

export interface SurveyReportedClassDto {
  classId: string;
  name: string;
  teachers: string[];
  reportDate: string | null;
  reportedByTeacherName: string | null;
  knowledgeAssessment: string | null;
}

export interface SurveyReportedClassListDto {
  data: SurveyReportedClassDto[];
  meta: { total: number; page: number; limit: number };
}

/** Một lớp đang thiếu báo cáo cho một hoặc nhiều bài khảo sát đang mở — dùng cho modal cảnh báo gia sư. */
export interface TeacherSurveyWarningDto {
  classId: string;
  className: string;
  pendingSurveys: {
    surveyId: string;
    name: string;
    startDate: string | null;
    endDate: string | null;
  }[];
}

/** Cảnh báo cho kế toán chi: một nhân sự (gia sư) chưa báo cáo khảo sát của lần gần nhất đã quá hạn. */
export interface AccountantSurveyWarningDto {
  staffId: string;
  staffName: string;
  surveyId: string;
  surveyName: string;
  endDate: string | null;
  classes: { classId: string; name: string }[];
}

export class DismissSurveyWarningDto {
  @ApiProperty({ description: 'Staff id của gia sư liên quan tới cảnh báo.' })
  @IsString()
  staff_id: string;

  @ApiProperty({ description: 'Id bài khảo sát liên quan tới cảnh báo.' })
  @IsString()
  survey_id: string;

  @ApiPropertyOptional({
    description: 'true = "Đóng và không hiển thị lại" (lưu vĩnh viễn).',
    default: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  permanent?: boolean;
}
