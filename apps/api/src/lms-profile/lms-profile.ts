/**
 * Hồ sơ môn của instance (ADR `2026-10-07-instance-subject-profile`).
 * Mọi khoá trên một instance dùng chung bộ luật câu hỏi này.
 */
export const LMS_PROFILES = ['it', 'jp', 'eng', 'math'] as const;
export type LmsProfile = (typeof LMS_PROFILES)[number];

/** `equal_100`: chia đều 100 cho N câu. `absolute_it`: điểm tuyệt đối theo loại câu, đơn vị 1/100 điểm. */
export type LmsScoring = 'equal_100' | 'absolute_it';

export type LmsQuestionType =
  | 'single_choice'
  | 'essay'
  | 'true_false_group'
  | 'true_false'
  | 'fill_blank'
  | 'ordering';

/** Kỹ năng câu hỏi (chỉ JP), thứ tự hiển thị cố định. */
export const QUESTION_SKILLS = [
  'kanji',
  'vocabulary',
  'grammar',
  'reading',
  'listening',
  'conversation',
  'writing',
] as const;
export type QuestionSkillValue = (typeof QUESTION_SKILLS)[number];

export interface LmsProfileConfig {
  profile: LmsProfile;
  questionTypes: LmsQuestionType[];
  optionCount: { min: number; max: number; default: number };
  scoring: LmsScoring;
  electiveGroups: boolean;
  /** Câu hỏi có gắn Kỹ năng (bắt buộc khi tạo/sửa) hay không. */
  questionSkills: boolean;
  /**
   * Thang 100 chia theo trọng số câu-trong-tiết (`question_links.points`,
   * mặc định 1) thay vì chia đều. Chỉ có nghĩa với `equal_100`.
   */
  questionWeights: boolean;
  /** Câu tự luận chọn được kiểu ô nhập ngắn/dài (chỉ đổi giao diện làm bài). */
  essayInputSizes: boolean;
  /** Ngân hàng câu hỏi có Tư liệu dùng chung (nhiều câu dựa vào một đoạn văn/ảnh). */
  sharedMaterials: boolean;
  /** Tư liệu có audio (tải lên, phát trong bài làm / ôn nhẹ / xem lại). */
  questionAudio: boolean;
  /** Nhận xét buổi học có phần Kiểm tra trong buổi (IT bỏ). */
  inClassTest: boolean;
  /** Đề in: xuất PDF đề trắng của tiết thực hành theo form đề tốt nghiệp THPT (chỉ IT). */
  examPrint: boolean;
}

const OPTION_COUNT = { min: 2, max: 6, default: 4 };

const PROFILE_CONFIGS: Record<LmsProfile, LmsProfileConfig> = {
  it: {
    profile: 'it',
    questionTypes: ['single_choice', 'true_false_group'],
    optionCount: OPTION_COUNT,
    scoring: 'absolute_it',
    electiveGroups: true,
    questionSkills: false,
    questionWeights: false,
    essayInputSizes: false,
    sharedMaterials: false,
    questionAudio: false,
    inClassTest: false,
    examPrint: true,
  },
  jp: {
    profile: 'jp',
    questionTypes: [
      'single_choice',
      'essay',
      'true_false',
      'fill_blank',
      'ordering',
    ],
    optionCount: OPTION_COUNT,
    scoring: 'equal_100',
    electiveGroups: false,
    questionSkills: true,
    questionWeights: true,
    essayInputSizes: true,
    sharedMaterials: true,
    questionAudio: true,
    inClassTest: true,
    examPrint: false,
  },
  eng: {
    profile: 'eng',
    questionTypes: ['single_choice', 'essay'],
    optionCount: OPTION_COUNT,
    scoring: 'equal_100',
    electiveGroups: false,
    questionSkills: false,
    questionWeights: false,
    essayInputSizes: false,
    sharedMaterials: false,
    questionAudio: false,
    inClassTest: true,
    examPrint: false,
  },
  math: {
    profile: 'math',
    questionTypes: ['single_choice', 'essay'],
    optionCount: OPTION_COUNT,
    scoring: 'equal_100',
    electiveGroups: false,
    questionSkills: false,
    questionWeights: false,
    essayInputSizes: false,
    sharedMaterials: false,
    questionAudio: false,
    inClassTest: true,
    examPrint: false,
  },
};

/**
 * Đọc `LMS_PROFILE`. Thiếu hoặc sai giá trị thì ném lỗi — không có mặc định,
 * để instance quên đặt biến không lặng lẽ chấm sai luật.
 */
export function loadLmsProfile(
  env: Record<string, string | undefined>,
): LmsProfileConfig {
  const raw = env.LMS_PROFILE?.trim().toLowerCase();
  if (!raw || !(LMS_PROFILES as readonly string[]).includes(raw)) {
    throw new Error(
      `LMS_PROFILE phải là một trong ${LMS_PROFILES.join(' | ')} (nhận: ${
        env.LMS_PROFILE === undefined
          ? 'không đặt'
          : JSON.stringify(env.LMS_PROFILE)
      }).`,
    );
  }
  return PROFILE_CONFIGS[raw as LmsProfile];
}

export function lmsProfileConfig(profile: LmsProfile): LmsProfileConfig {
  return PROFILE_CONFIGS[profile];
}
