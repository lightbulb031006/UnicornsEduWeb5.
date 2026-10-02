import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { AttendanceStatus } from '../../generated/enums';
import { IsStudentId } from '../common/entity-id.validators';
import { CONTENT_LIMITS } from './content-limits';

export class AttendanceCreateDto {
  @ApiProperty({
    description: 'Student id',
    example: 'UNIST-a1b2c3d4e5',
  })
  @IsStudentId()
  studentId: string;

  @ApiProperty({ enum: AttendanceStatus, example: AttendanceStatus.present })
  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;

  @ApiPropertyOptional({
    description:
      'Rich-text attendance note, maximum 500 plain-text characters.',
    example: 'Đi trễ 10 phút.',
    maxLength: CONTENT_LIMITS.sessionRichText,
  })
  @IsOptional()
  @IsString()
  @MaxLength(CONTENT_LIMITS.sessionRichText)
  notes?: string | null;

  @ApiPropertyOptional({
    description: 'Tuition fee override for this attendance item (VNĐ).',
    example: 180000,
    nullable: true,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  tuitionFee?: number | null;
}

export class AttendanceUpdateDto extends AttendanceCreateDto {}
