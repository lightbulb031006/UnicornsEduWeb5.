import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PaymentStatus } from 'generated/enums';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateCostDto {
  @ApiPropertyOptional({ example: '2026-03' })
  @IsOptional()
  @IsString()
  month?: string;

  @ApiPropertyOptional({ example: 'Marketing' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 500000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  amount?: number;

  @ApiPropertyOptional({ example: '2026-03-13', format: 'date' })
  @IsOptional()
  @IsDateString()
  date?: string | null;

  @ApiPropertyOptional({ enum: PaymentStatus, default: PaymentStatus.pending })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;
}

export class UpdateCostDto extends PartialType(CreateCostDto) {
  @ApiProperty({ description: 'Cost id' })
  @IsUUID()
  id: string;
}

export class CostBulkStatusUpdateDto {
  @ApiProperty({
    description: 'Danh sách id khoản chi cần cập nhật trạng thái.',
    type: [String],
    example: ['550e8400-e29b-41d4-a716-446655440000'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  costIds: string[];

  @ApiProperty({
    description: 'Trạng thái thanh toán mới cho các khoản chi đã chọn.',
    enum: PaymentStatus,
    example: PaymentStatus.paid,
  })
  @IsEnum(PaymentStatus)
  status: PaymentStatus;
}

export interface CostBulkStatusUpdateResult {
  requestedCount: number;
  updatedCount: number;
}
