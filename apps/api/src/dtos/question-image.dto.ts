import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class UploadQuestionImageDto {
  @ApiProperty({ description: 'Khoá học sở hữu ảnh (ngân hàng câu hỏi)' })
  @IsUUID()
  courseId: string;
}

/** Ảnh vừa tải: `path` lưu vào HTML (`data-question-image`), `url` để hiện ngay. */
export interface QuestionImageDto {
  path: string;
  url: string | null;
}
