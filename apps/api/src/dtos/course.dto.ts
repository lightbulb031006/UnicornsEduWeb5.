import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsStaffId } from '../common/entity-id.validators';

export class CreateCourseDto {
  @ApiProperty({
    description: 'Display name shown in the UI.',
    example: 'THPT Basic',
  })
  @IsString()
  name: string;

  @ApiPropertyOptional({
    description:
      'Số ngày thời hạn mặc định khi tạo lớp học từ khoá này. Để trống/null nghĩa là vô hạn.',
    example: 90,
    minimum: 1,
    nullable: true,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  default_duration_days?: number | null;

  @ApiPropertyOptional({ example: 10, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort_order?: number;
}

export class UpdateCourseDto {
  @ApiPropertyOptional({ example: 'THPT Advanced' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description:
      'Số ngày thời hạn mặc định khi tạo lớp học từ khoá này. Truyền null để chuyển về vô hạn.',
    example: 90,
    minimum: 1,
    nullable: true,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  default_duration_days?: number | null;

  @ApiPropertyOptional({ example: 10, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort_order?: number;

  @ApiPropertyOptional({
    description: 'Toggle visibility in dropdowns without deleting the course.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class CreateCourseDifficultyLevelDto {
  @ApiProperty({
    description: 'Tên mức độ khó (duy nhất trong khoá học).',
    example: 'Dễ',
  })
  @IsString()
  name: string;

  @ApiPropertyOptional({
    description: 'Thứ tự hiển thị.',
    example: 0,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort_order?: number;
}

export class UpdateCourseDifficultyLevelDto {
  @ApiPropertyOptional({
    description: 'Tên mức độ khó.',
    example: 'Trung bình',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Thứ tự hiển thị.',
    example: 1,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort_order?: number;

  @ApiPropertyOptional({ description: 'Bật/tắt mức độ khó.', example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class CourseDifficultyLevelReorderItem {
  @ApiProperty({ description: 'Id mức độ khó.', example: 'uuid' })
  @IsUUID()
  id: string;

  @ApiProperty({
    description: 'Thứ tự mới (tăng dần từ 0).',
    example: 0,
    minimum: 0,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort_order: number;
}

export class ReorderCourseDifficultyLevelsDto {
  @ApiProperty({
    description: 'Danh sách đầy đủ các mức độ khó theo thứ tự mới.',
    type: [CourseDifficultyLevelReorderItem],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CourseDifficultyLevelReorderItem)
  levels: CourseDifficultyLevelReorderItem[];
}

export class AssignCourseLessonPlanMembersDto {
  @ApiProperty({
    description:
      'Danh sách staff id (nhân sự) của đội giáo án. Thay thế toàn bộ danh sách hiện tại của khoá.',
    type: [String],
    example: ['UNISTAFF-c3d4e5f6a7'],
  })
  @IsArray()
  @IsStaffId({ each: true })
  staff_ids: string[];
}
