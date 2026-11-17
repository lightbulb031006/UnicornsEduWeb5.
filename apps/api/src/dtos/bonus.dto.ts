import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PaymentStatus } from 'generated/enums';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';
import { IsStaffId } from '../common/entity-id.validators';
import {
  MONTH_KEY_FORMAT_MESSAGE,
  MONTH_KEY_PATTERN,
} from '../common/month-key';

export class CreateBonusDto {
  @ApiProperty({
    description: 'Staff id',
    example: 'UNISTAFF-c3d4e5f6a7',
  })
  @IsStaffId()
  staffId: string;

  @ApiProperty({ description: 'Work type', example: 'cham_bai' })
  @IsString()
  workType: string;

  @ApiProperty({
    description: 'Month key in format YYYY-MM',
    example: '2026-03',
  })
  @IsString()
  @Matches(MONTH_KEY_PATTERN, { message: MONTH_KEY_FORMAT_MESSAGE })
  month: string;

  @ApiPropertyOptional({ example: 500000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  amount?: number;

  @ApiPropertyOptional({ enum: PaymentStatus, default: PaymentStatus.pending })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiPropertyOptional({ example: 'Thưởng thêm vì hỗ trợ học sinh' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateMyBonusDto extends OmitType(CreateBonusDto, [
  'staffId',
  'status',
] as const) {}

export class UpdateBonusDto extends PartialType(CreateBonusDto) {
  @ApiProperty({ description: 'Bonus id' })
  @IsUUID()
  id: string;
}

export class UpdateMyBonusDto extends PartialType(
  OmitType(CreateBonusDto, ['staffId', 'status'] as const),
) {
  @ApiProperty({ description: 'Bonus id' })
  @IsUUID()
  id: string;
}
