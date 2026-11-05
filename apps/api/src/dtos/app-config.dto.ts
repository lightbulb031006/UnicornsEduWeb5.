import { ApiProperty } from '@nestjs/swagger';
import type {
  LmsProfile,
  LmsProfileConfig,
  LmsQuestionType,
  LmsScoring,
} from '../lms-profile/lms-profile';

class OptionCountDto {
  @ApiProperty({ example: 2 })
  min!: number;

  @ApiProperty({ example: 6 })
  max!: number;

  @ApiProperty({ example: 4 })
  default!: number;
}

export class AppConfigResponseDto implements LmsProfileConfig {
  @ApiProperty({ enum: ['it', 'jp', 'eng'], example: 'it' })
  profile!: LmsProfile;

  @ApiProperty({
    enum: [
      'single_choice',
      'essay',
      'true_false_group',
      'true_false',
      'fill_blank',
      'ordering',
    ],
    isArray: true,
    example: ['single_choice', 'true_false_group'],
  })
  questionTypes!: LmsQuestionType[];

  @ApiProperty({ type: OptionCountDto })
  optionCount!: OptionCountDto;

  @ApiProperty({
    enum: ['equal_100', 'absolute_it'],
    description:
      '`equal_100`: chia đều 100 cho N câu. `absolute_it`: điểm tuyệt đối, lưu đơn vị 1/100 điểm (trắc nghiệm 25, Đúng/Sai tối đa 100).',
  })
  scoring!: LmsScoring;

  @ApiProperty({ description: 'Tiết thực hành có nhóm tự chọn hay không' })
  electiveGroups!: boolean;

  @ApiProperty({
    description: 'Câu hỏi có gắn Kỹ năng (JP) — bắt buộc khi tạo/sửa',
  })
  questionSkills!: boolean;

  @ApiProperty({
    description:
      'Chia 100 theo trọng số câu-trong-tiết (`points`, mặc định 1) thay vì chia đều (JP)',
  })
  questionWeights!: boolean;

  @ApiProperty({
    description: 'Câu tự luận chọn được kiểu ô ngắn/dài (JP)',
  })
  essayInputSizes!: boolean;

  @ApiProperty({
    description:
      'Ngân hàng câu hỏi có Tư liệu dùng chung — nhiều câu dựa vào một đoạn văn/ảnh (JP)',
  })
  sharedMaterials!: boolean;

  @ApiProperty({
    description:
      'Tư liệu có audio: tải lên cho tư liệu dùng chung và từng câu (JP)',
  })
  questionAudio!: boolean;

  @ApiProperty({
    description:
      'Nhận xét buổi học có phần Kiểm tra trong buổi (IT tắt; JP/ENG bật)',
  })
  inClassTest!: boolean;

  @ApiProperty({
    description:
      'Đề in: xuất PDF đề trắng của tiết thực hành theo form đề tốt nghiệp THPT (IT bật; JP/ENG tắt)',
  })
  examPrint!: boolean;
}
