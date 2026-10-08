import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { StaffStatus } from 'generated/enums';
import { PaginationQueryDto } from './pagination.dto';

export class TrainingTutorListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo họ tên gia sư' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: StaffStatus })
  @IsOptional()
  @IsEnum(StaffStatus)
  status?: StaffStatus;
}

/**
 * Hồ sơ gia sư Ban Đào Tạo được xem. Chỉ allowlist: không CCCD, dân tộc,
 * giới tính, ngày sinh, địa chỉ, ngân hàng, QR, Meet link, tiền.
 */
export interface TrainingTutorSummaryDto {
  id: string;
  fullName: string;
  status: StaffStatus;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  university: string | null;
  highSchool: string | null;
  achievementCount: number;
}

export interface TrainingTutorClassDto {
  id: string;
  name: string;
}

export interface TrainingTutorDetailDto extends TrainingTutorSummaryDto {
  currentClasses: TrainingTutorClassDto[];
  pastClasses: TrainingTutorClassDto[];
  taughtSessionCount: number;
}

export interface TrainingTutorSessionDto {
  id: string;
  date: Date;
  startTime: Date | null;
  endTime: Date | null;
  class: TrainingTutorClassDto;
}

export interface TrainingTutorPageDto<T> {
  data: T[];
  meta: { total: number; page: number; limit: number };
}
