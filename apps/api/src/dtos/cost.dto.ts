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
  Matches,
  Min,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateCostDto {
  @ApiPropertyOptional({ example: '2026-03' })
  @IsOptional()
  @IsString()
  month?: string;

  // Bắt buộc như form web (CostFormPopup): body rỗng không được tạo khoản chi.
  @ApiProperty({ example: 'Marketing', description: 'Danh mục, không rỗng.' })
  @IsString()
  @Matches(/\S/, { message: 'Danh mục là bắt buộc.' })
  category: string;

  @ApiProperty({ example: 500000, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0, { message: 'Số tiền phải lớn hơn hoặc bằng 0.' })
  amount: number;

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
