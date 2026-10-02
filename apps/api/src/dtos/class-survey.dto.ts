import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { IsStaffId, IsStudentId } from '../common/entity-id.validators';

/** Nhận xét của gia sư cho một học sinh trong báo cáo khảo sát lớp. */
export class ClassSurveyStudentAssessmentDto {
  @ApiProperty({
    description: 'Student id trong roster đang học của lớp.',
    example: 'UNIST-a1b2c3d4e5',
  })
  @IsStudentId()
  student_id: string;

  @ApiPropertyOptional({ description: 'Nhận xét học sinh (text tự do).' })
  @IsOptional()
  @IsString()
  comment?: string;
}

export class CreateClassSurveyDto {
  @ApiProperty({
    description: 'Id bài khảo sát (Survey) mà báo cáo này nộp cho.',
    example: 'b7e5c0a0-1234-4a5b-9c3d-0987654321ab',
  })
  @IsUUID()
  survey_id: string;

  @ApiPropertyOptional({
    description: 'Ngày báo cáo YYYY-MM-DD. Mặc định là ngày hiện tại.',
    example: '2026-07-20',
  })
  @IsOptional()
  @IsDateString()
  report_date?: string;

  @ApiProperty({
    description: 'Staff id của gia sư phụ trách trong lớp.',
    example: 'UNISTAFF-c3d4e5f6a7',
  })
  @IsStaffId()
  teacher_id: string;

  @ApiPropertyOptional({
    description:
      'Đánh giá kiến thức (text tự do), dùng chung cho cả báo cáo, không phải theo từng học sinh.',
  })
  @IsOptional()
  @IsString()
  knowledge_assessment?: string;

  @ApiProperty({
    description: 'Nhận xét cho từng học sinh đang học của lớp.',
    type: [ClassSurveyStudentAssessmentDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ClassSurveyStudentAssessmentDto)
  students: ClassSurveyStudentAssessmentDto[];
}

export class UpdateClassSurveyDto extends PartialType(CreateClassSurveyDto) {}
