/**
 * Kiểu dữ liệu cho các "pack" seed ngân hàng câu hỏi + đề luyện tập.
 *
 * Một pack = một bộ nội dung học thuật (chuyên đề, thang độ khó, câu hỏi, đề)
 * áp cho một hoặc nhiều Khoá học có sẵn trong DB, dò theo tên khoá.
 */

export type SeedQuestionType = 'single_choice' | 'essay';

export interface SeedQuestion {
  /** Khoá ổn định trong pack — dùng sinh UUID tất định, không đổi sau khi seed lần đầu. */
  key: string;
  /** Tiêu đề chuyên đề (phải có trong `SeedPack.modules`). */
  module: string;
  /** Tên độ khó (phải có trong `SeedPack.difficultyLevels`). */
  difficulty: string;
  type: SeedQuestionType;
  /** HTML TipTap; công thức toán viết LaTeX giữa hai dấu `$`. */
  content: string;
  /** Chỉ cho `single_choice`: 2–6 phương án, không tự đánh A/B/C/D. */
  options?: string[];
  /** Chỉ cho `single_choice`: chỉ số đáp án đúng, đếm từ 0. */
  correctIndex?: number;
  /** Lời giải ngắn (HTML) — dùng cho `single_choice`. */
  explanation?: string;
  /** Barem / ý chính cần có — chỉ cho `essay`. */
  answerGuide?: string;
}

export interface SeedExam {
  /** Khoá ổn định trong pack — dùng sinh UUID tất định cho Lesson. */
  key: string;
  title: string;
  /**
   * Giới hạn nguồn câu hỏi theo chuyên đề. Bỏ trống = lấy toàn bộ chuyên đề của pack
   * (đề tổng hợp giữa khoá / cuối khoá).
   */
  modules?: string[];
  /**
   * Chuyên đề chứa đề trên cây nội dung khoá. **Bắt buộc** — CHECK constraint
   * `lessons_owner_check` không cho tiết cấp khoá đứng ngoài chuyên đề.
   */
  module: string;
  /** Số câu cần lấy theo từng độ khó: `{ 'Nhận biết': 1, 'Thông hiểu': 2 }`. */
  blueprint: Record<string, number>;
  /**
   * Hệ số xoay nguồn câu hỏi, để hai đề cùng blueprint trên cùng pool lấy hai
   * khối câu khác nhau. Offset thực của mỗi mức độ khó = `rotate × số câu mức
   * đó`, nên `rotate: 1` lấy đúng khối kế tiếp của `rotate: 0`. Mặc định `0`.
   */
  rotate?: number;
}

export interface SeedPack {
  key: string;
  /** Tên khoá học trong DB sẽ nhận pack này (so khớp không phân biệt hoa/thường). */
  courseNames: string[];
  /** Thang độ khó của khoá, theo đúng thứ tự hiển thị. */
  difficultyLevels: string[];
  /** Danh sách chuyên đề, theo đúng thứ tự hiển thị. */
  modules: string[];
  questions: SeedQuestion[];
  exams: SeedExam[];
}
