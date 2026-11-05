/** Hồ sơ môn của instance — `GET /public/app-config`. */
export type LmsProfile = "it" | "jp" | "eng" | "math";

/**
 * `equal_100`: chia đều 100 cho N câu.
 * `absolute_it`: điểm tuyệt đối, lưu đơn vị 1/100 điểm (trắc nghiệm 25, Đúng/Sai tối đa 100).
 */
export type LmsScoring = "equal_100" | "absolute_it";

export type LmsQuestionType =
  | "single_choice"
  | "essay"
  | "true_false_group"
  | "true_false"
  | "fill_blank"
  | "ordering";

export interface AppConfig {
  profile: LmsProfile;
  questionTypes: LmsQuestionType[];
  optionCount: { min: number; max: number; default: number };
  scoring: LmsScoring;
  electiveGroups: boolean;
  /** Câu hỏi có gắn Kỹ năng (JP) — bắt buộc khi tạo/sửa. */
  questionSkills: boolean;
  /** Chia 100 theo trọng số câu-trong-tiết (JP); `points` trên link là trọng số. */
  questionWeights: boolean;
  /** Câu tự luận chọn được kiểu ô ngắn/dài (JP). */
  essayInputSizes: boolean;
  /** Ngân hàng câu hỏi có Tư liệu dùng chung (JP). */
  sharedMaterials: boolean;
  /** Audio tư liệu cho câu / tư liệu dùng chung (JP). */
  questionAudio: boolean;
  /** Nhận xét buổi học có phần Kiểm tra trong buổi (IT tắt). */
  inClassTest: boolean;
  /** Đề in: xuất PDF đề trắng của tiết thực hành theo form đề Bộ (chỉ IT). */
  examPrint: boolean;
}
