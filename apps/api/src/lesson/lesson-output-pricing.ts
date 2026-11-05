export const LESSON_OUTPUT_DIFFICULTY_BANDS = [
  'easy',
  'medium',
  'hard',
  'very_hard',
  'extreme',
] as const;

export type LessonOutputDifficultyBandValue =
  (typeof LESSON_OUTPUT_DIFFICULTY_BANDS)[number];

export type LessonOutputPricingItems = {
  includesTest: boolean;
  includesSolution: boolean;
  includesLectureVideo: boolean;
  includesTheoryLecture: boolean;
};

/** Bảng giá VNĐ theo bậc — hằng số trong code, không có UI quản trị. */
export const LESSON_OUTPUT_DIFFICULTY_PRICES: Record<
  LessonOutputDifficultyBandValue,
  { test: number; solution: number; lecture: number }
> = {
  easy: { test: 20000, solution: 10000, lecture: 20000 },
  medium: { test: 25000, solution: 10000, lecture: 25000 },
  hard: { test: 30000, solution: 15000, lecture: 30000 },
  very_hard: { test: 35000, solution: 15000, lecture: 35000 },
  extreme: { test: 50000, solution: 20000, lecture: 50000 },
};

/** Bài giảng lý thuyết: giá theo `level` (0–5), không theo bậc độ khó. */
export const LESSON_OUTPUT_THEORY_LECTURE_PRICES: Record<number, number> = {
  0: 170000,
  1: 180000,
  2: 190000,
  3: 200000,
  4: 250000,
  5: 250000,
};

/** Nhận `"Level 3"` hoặc `"3"` (cùng quy ước với filter `level`). */
export function parseLessonOutputLevel(
  value: string | null | undefined,
): number | null {
  const match = /^(?:level\s*)?([0-5])$/i.exec(value?.trim() ?? '');
  return match ? Number(match[1]) : null;
}

function hasDifficultyPricedItem(items: LessonOutputPricingItems) {
  return (
    items.includesTest || items.includesSolution || items.includesLectureVideo
  );
}

/**
 * Lỗi nghiệp vụ khi tick Bài giảng lý thuyết, hoặc `null` nếu hợp lệ.
 * Không tick lý thuyết → luôn hợp lệ (giữ luồng dòng cũ chưa có bậc).
 */
export function getLessonOutputPricingError(
  band: LessonOutputDifficultyBandValue | null | undefined,
  level: string | null | undefined,
  items: LessonOutputPricingItems,
): string | null {
  if (!items.includesTheoryLecture) {
    return null;
  }
  if (parseLessonOutputLevel(level) == null) {
    return 'Bài giảng lý thuyết tính tiền theo level — vui lòng chọn Level 0–5.';
  }
  if (hasDifficultyPricedItem(items) && !isLessonOutputDifficultyBand(band)) {
    return 'Vui lòng chọn bậc độ khó cho Sinh test / Lời giải / Bài giảng video.';
  }
  return null;
}

export function isLessonOutputDifficultyBand(
  value: string | null | undefined,
): value is LessonOutputDifficultyBandValue {
  return (
    value != null &&
    (LESSON_OUTPUT_DIFFICULTY_BANDS as readonly string[]).includes(value)
  );
}

/**
 * Tính tiền output = phần theo bậc (Test / Lời giải / Bài giảng video)
 * + phần theo level (Bài giảng lý thuyết).
 * Không tick lý thuyết và bậc `null` → `null` (không tính lại; caller giữ cost cũ).
 * Có tick lý thuyết → luôn tính lại; input phải qua `getLessonOutputPricingError` trước.
 */
export function computeLessonOutputCost(
  band: LessonOutputDifficultyBandValue | null | undefined,
  items: LessonOutputPricingItems,
  level?: string | null,
): number | null {
  const hasBand = isLessonOutputDifficultyBand(band);
  if (!hasBand && !items.includesTheoryLecture) {
    return null;
  }

  let total = 0;
  if (hasBand) {
    const prices = LESSON_OUTPUT_DIFFICULTY_PRICES[band];
    if (items.includesTest) {
      total += prices.test;
    }
    if (items.includesSolution) {
      total += prices.solution;
    }
    if (items.includesLectureVideo) {
      total += prices.lecture;
    }
  }
  if (items.includesTheoryLecture) {
    const parsedLevel = parseLessonOutputLevel(level);
    if (parsedLevel != null) {
      total += LESSON_OUTPUT_THEORY_LECTURE_PRICES[parsedLevel];
    }
  }
  return total;
}
