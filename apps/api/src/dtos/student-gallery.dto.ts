import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateStudentGalleryItemDto {
  @ApiPropertyOptional({
    description: 'Unused in product UI (always null from admin gallery editor)',
    example: null,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  caption?: string | null;

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

export class UpdateStudentGalleryItemDto extends PartialType(
  CreateStudentGalleryItemDto,
) {}

export class ReorderStudentGalleryDto {
  @ApiProperty({
    description: 'Gallery item ids in the desired display order (first = 0)',
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

export class StudentGalleryItemDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id: string;

  @ApiPropertyOptional({
    nullable: true,
    example: 'Giải nhất hội thi tin học trẻ',
  })
  caption: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Storage path inside the student-gallery bucket',
  })
  imagePath: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Signed URL for the gallery image (null when no image)',
  })
  imageUrl: string | null;

  @ApiProperty({ example: 0 })
  sortOrder: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
