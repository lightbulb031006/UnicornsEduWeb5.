import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsUUID, ValidateIf } from 'class-validator';

/** Số lần nghe được chọn trong lượt làm; null = không giới hạn. */
export const AUDIO_MAX_PLAYS_OPTIONS = [1, 2] as const;

/** Audio gắn vào câu / tư liệu dùng chung. `url` là signed URL ngắn hạn (null khi storage lỗi). */
export interface AudioRefDto {
  id: string;
  originalName: string;
  url: string | null;
  /** Giới hạn nghe trong lượt làm: null = không giới hạn. */
  maxPlays: number | null;
  /** false = không tua được trong lượt làm (vẫn tạm dừng). */
  allowSeek: boolean;
}

export class UploadAudioDto {
  @ApiProperty({ description: 'Khoá học sở hữu audio (ngân hàng câu hỏi)' })
  @IsUUID()
  courseId: string;
}

export class UpdateAudioLimitsDto {
  @ApiProperty({
    description:
      'Số lần nghe trong lượt làm (1 hoặc 2); null = không giới hạn. Ôn nhẹ và xem lại sau nộp không áp.',
    nullable: true,
    enum: AUDIO_MAX_PLAYS_OPTIONS,
  })
  @ValidateIf((_o, v) => v !== null)
  @IsIn(AUDIO_MAX_PLAYS_OPTIONS)
  maxPlays: number | null;

  @ApiProperty({
    description: 'Cho tua trong lượt làm; false = ẩn thanh tua, vẫn tạm dừng.',
  })
  @IsBoolean()
  allowSeek: boolean;
}
