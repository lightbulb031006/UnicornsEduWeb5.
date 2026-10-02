import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { AchievementLevel } from 'generated/enums';

export class CreateAchievementDto {
  @ApiProperty({
    description: 'Achievement title (staff only; no hard length limit)',
    example: 'HCV Olympic 30/4',
  })
  @IsString()
  @MinLength(1)
  title: string;

  @ApiPropertyOptional({
    description: 'Display order (lower first). Defaults to end of list.',
    example: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateAchievementDto extends PartialType(CreateAchievementDto) {}

export class CreateStudentAchievementDto {
  @ApiProperty({
    description: 'Award / prize label',
    example: 'Giải Khuyến khích',
  })
  @IsString()
  @MinLength(1)
  award: string;

  @ApiProperty({
    description: 'Exam / competition name',
    example: 'HSG Quốc gia',
  })
  @IsString()
  @MinLength(1)
  exam: string;

  @ApiProperty({ description: 'Year the award was earned', example: 2025 })
  @Type(() => Number)
  @IsInt()
  @Min(1990)
  @Max(2100)
  year: number;

  @ApiProperty({
    enum: AchievementLevel,
    example: AchievementLevel.HSG_QUOC_GIA,
    description: 'Competition level for /thanh-tich bands',
  })
  @IsEnum(AchievementLevel)
  level: AchievementLevel;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Landing course label (e.g. KHỐI THPT). Empty → landing infers from level.',
    example: 'KHỐI THPT',
  })
  @IsOptional()
  @IsString()
  courseLabel?: string | null;

  @ApiPropertyOptional({
    description: 'Display order (lower first). Defaults to end of list.',
    example: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateStudentAchievementDto extends PartialType(
  CreateStudentAchievementDto,
) {}

export class ReorderAchievementsDto {
  @ApiProperty({
    description: 'Achievement ids in the desired display order (first = 0)',
    type: [String],
    example: [
      '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  orderedIds: string[];
}

export class AchievementDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id: string;

  @ApiPropertyOptional({
    description: 'Staff freeform title. Null on student achievements.',
    example: 'HCV Olympic 30/4',
  })
  title?: string | null;

  @ApiPropertyOptional({
    description: 'Student award label. Null on staff achievements.',
    example: 'Giải Khuyến khích',
  })
  award?: string | null;

  @ApiPropertyOptional({
    description: 'Student exam name. Null on staff achievements.',
    example: 'HSG Quốc gia',
  })
  exam?: string | null;

  @ApiPropertyOptional({
    description: 'Student award year. Null on staff achievements.',
    example: 2025,
  })
  year?: number | null;

  @ApiPropertyOptional({
    enum: AchievementLevel,
    description: 'Student competition level. Null on staff achievements.',
  })
  level?: AchievementLevel | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Student course label for landing.',
    example: 'KHỐI THPT',
  })
  courseLabel?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Storage path inside the achievements bucket',
  })
  imagePath: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Signed URL for the proof image (null when no image)',
  })
  imageUrl: string | null;

  @ApiProperty({ example: 0 })
  sortOrder: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
