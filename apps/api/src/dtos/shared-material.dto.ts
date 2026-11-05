import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import type { AudioRefDto } from './audio-asset.dto';

export const SHARED_MATERIAL_TITLE_MAX = 200;

export interface SharedMaterialResponseDto {
  id: string;
  courseId: string;
  /** Chuyên đề của bộ — mọi câu trong bộ cùng chuyên đề này. */
  moduleId: string;
  title: string;
  /** HTML (đoạn văn, ảnh). */
  content: string;
  /** Số câu (chưa xoá) đang gắn tư liệu. */
  questionCount: number;
  /** Audio dùng chung (JP), vd bài nghe cho cả nhóm câu. */
  audioId: string | null;
  audio: AudioRefDto | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Tiết đang dùng một Bộ câu hỏi (hoặc một câu) — để cảnh báo trước khi sửa bộ,
 * chuyển câu vào / ra bộ.
 */
export interface SharedMaterialUsageDto {
  /** Số tiết thực hành đang chứa bộ / câu. */
  lessonCount: number;
  /** Trong đó, số tiết đã giao cho ít nhất một lớp. */
  assignedLessonCount: number;
  /** Số tiết lý thuyết có bài ôn nhẹ chứa bộ / câu. */
  quizLessonCount: number;
}

export class SharedMaterialFilterDto {
  @ApiProperty({ description: 'Khoá học (ngân hàng câu hỏi)' })
  @IsUUID()
  courseId: string;
}

export class CreateSharedMaterialDto {
  @ApiProperty({ description: 'Khoá học sở hữu tư liệu' })
  @IsUUID()
  courseId: string;

  @ApiProperty({
    description: 'Chuyên đề của bộ (cùng khoá). Mọi câu trong bộ cùng chuyên đề này.',
  })
  @IsUUID()
  moduleId: string;

  @ApiProperty({
    description: 'Tên ngắn để người soạn nhận ra (học sinh không thấy)',
    example: 'Bài đọc: お花見',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(SHARED_MATERIAL_TITLE_MAX)
  title: string;

  @ApiProperty({
    description:
      'Phần đầu bộ (HTML từ TipTap: đoạn văn, ảnh). Rỗng được nếu có audio — phần đầu bộ cần ít nhất một trong văn bản / ảnh / audio, thiếu cả ba → 400.',
  })
  @IsString()
  content: string;

  @ApiPropertyOptional({
    description:
      'Audio dùng chung (JP) — id từ POST /audio-assets, cùng khoá. null = gỡ audio.',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  audioId?: string | null;
}

export class ReorderSetQuestionsDto {
  @ApiProperty({
    description:
      'Mọi câu (chưa xoá) của bộ, mỗi câu một lần, theo thứ tự mới của bộ.',
    type: [String],
  })
  @IsArray()
  @IsUUID('all', { each: true })
  questionIds: string[];
}

export class UpdateSharedMaterialDto {
  @ApiPropertyOptional({
    description: 'Đổi chuyên đề của bộ (cùng khoá) — mọi câu trong bộ đi theo.',
  })
  @IsOptional()
  @IsUUID()
  moduleId?: string;

  @ApiPropertyOptional({ description: 'Tên ngắn' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(SHARED_MATERIAL_TITLE_MAX)
  title?: string;

  @ApiPropertyOptional({
    description:
      'Phần đầu bộ (HTML). Sau khi sửa vẫn phải còn văn bản / ảnh / audio. Bài làm đã bắt đầu giữ bản chụp lúc start, không đổi theo.',
  })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({
    description:
      'Audio dùng chung (JP) — id từ POST /audio-assets, cùng khoá. null = gỡ audio.',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  audioId?: string | null;
}
